import { h, clear, append } from '../dom.js';
import { View } from '../View.js';
import { field, textInput, selectInput, segmented, button, errorText, linkButton } from '../forms.js';
import { avatar, categoryIcon, emptyState, toast } from '../components.js';
import { Category, Expense } from '../../models/index.js';
import { Money } from '../../services/Money.js';
import { SplitStrategy } from '../../services/SplitStrategy.js';
import { SplitAutofill } from '../../services/SplitAutofill.js';

/**
 * Add or edit an expense.
 *   #/expense/new?group=ID    new expense in a group
 *   #/expense/new?friend=ID   new expense with one friend (no group)
 *   #/expense/ID/edit         edit an existing expense
 */
export class ExpenseFormView extends View {
  constructor(...args) {
    super(...args);
    this.existing = this.params.id ? this.store.getExpense(this.params.id) : null;
    this.groupId = this.existing ? this.existing.groupId : this.query.get('group');
    this.friendId = this.query.get('friend');
    this.participants = this.#findParticipants();

    const e = this.existing;
    const ids = this.participants.map((p) => p.id);
    this.state = {
      title: e?.title ?? '',
      amountText: e ? Money.toInput(e.amountCents) : '',
      categoryId: e?.categoryId ?? Category.FOOD.id,
      date: e?.date ?? Expense.today(),
      payerId: e?.payerId ?? this.store.me.id,
      method: e?.splitMethod ?? 'equal',
      included: new Set(e && e.splitMethod === 'equal' ? Object.keys(e.shares) : ids),
      values: { exact: {}, percent: {} },
      // People whose box the user typed in. Everyone else is filled in automatically.
      manual: { exact: new Set(), percent: new Set() },
      note: e?.note ?? '',
    };
    if (e?.splitMethod === 'exact') {
      for (const [id, cents] of Object.entries(e.shares)) this.state.values.exact[id] = Money.toInput(cents);
    }
    if (e?.splitMethod === 'percent') this.state.values.percent = ExpenseFormView.#percentsFromShares(e);
    // When editing, keep the saved amounts exactly as they were.
    if (e && e.splitMethod !== 'equal') this.state.manual[e.splitMethod] = new Set(Object.keys(e.shares));
  }

  get title() {
    return this.existing ? 'Edit expense' : 'Add expense';
  }

  get backHref() {
    if (this.existing) return `#/expense/${this.existing.id}`;
    if (this.groupId) return `#/groups/${this.groupId}`;
    if (this.friendId) return `#/friends/${this.friendId}`;
    return '#/activity';
  }

  get live() {
    return false;
  }

  get hideTabs() {
    return true;
  }

  #findParticipants() {
    const me = this.store.me;
    if (this.groupId) return this.store.membersOf(this.groupId);
    if (this.existing) {
      return [...this.existing.involvedIds].map((id) => this.store.getPerson(id)).filter(Boolean).sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : 0));
    }
    const friend = this.friendId ? this.store.getPerson(this.friendId) : null;
    return friend && !friend.isMe ? [me, friend] : [];
  }

  render() {
    if (this.params.id && !this.existing) {
      return emptyState('🤷', 'Expense not found', 'It may have been deleted.', linkButton('Go to activity', '#/activity'));
    }
    if (this.participants.length < 2) {
      return emptyState('👥', 'Pick who to split with', 'Open a group or a friend, then tap "Add expense".', linkButton('Go to groups', '#/groups'));
    }

    const s = this.state;
    const error = errorText();
    this.statusEl = h('div', { class: 'split-status', 'aria-live': 'polite' });
    this.splitRows = h('div', { class: 'card' });

    const amountInput = textInput({
      value: s.amountText,
      placeholder: '0.00',
      inputmode: 'decimal',
      maxlength: 15,
      autofocus: !this.existing,
      onInput: (v) => {
        s.amountText = v;
        this.#autofill();
        this.#updateStatus();
      },
    });
    amountInput.classList.add('amount-input');

    const group = this.groupId ? this.store.getGroup(this.groupId) : null;
    const context = group ? `${group.emoji} ${group.name}` : `With ${this.participants.filter((p) => !p.isMe).map((p) => p.name).join(', ')}`;

    const save = (event) => {
      event.preventDefault();
      const result = this.#split();
      try {
        if (!result.ok) throw new Error(result.error);
        const expense = new Expense({
          ...(this.existing ? this.existing.toJSON() : {}),
          title: s.title,
          amountCents: Money.parse(s.amountText),
          categoryId: s.categoryId,
          splitMethod: s.method,
          date: s.date || Expense.today(),
          note: s.note.trim(),
          payerId: s.payerId,
          groupId: this.groupId ?? null,
          shares: result.shares,
        });
        this.store.saveExpense(expense);
        toast(this.existing ? 'Expense updated' : 'Expense added');
        this.go(this.existing ? `#/expense/${expense.id}` : this.backHref);
      } catch (e) {
        error.textContent = e.message;
      }
    };

    const form = h(
      'form',
      { onSubmit: save, novalidate: true },
      h('div', { class: 'context-chip' }, context),
      h(
        'div',
        { class: 'card pad' },
        field('What was it for?', textInput({ value: s.title, placeholder: 'e.g. Dinner at Jollibee', onInput: (v) => (s.title = v) })),
        field('Amount', h('div', { class: 'amount-wrap' }, h('span', { class: 'currency' }, Money.symbol(this.store.currency)), amountInput)),
      ),
      h('section', { class: 'section' }, h('h2', { class: 'section-title' }, 'Category'), this.#categoryGrid()),
      h(
        'div',
        { class: 'card pad two-col' },
        field(
          'Paid by',
          selectInput(
            this.participants.map((p) => ({ value: p.id, label: p.displayName })),
            s.payerId,
            (v) => (s.payerId = v),
          ),
        ),
        field('Date', h('input', { type: 'date', class: 'input', value: s.date, onChange: (e) => (s.date = e.target.value) })),
      ),
      h(
        'section',
        { class: 'section' },
        h('h2', { class: 'section-title' }, 'Split'),
        segmented(
          SplitStrategy.all().map((st) => ({ value: st.id, label: st.label })),
          s.method,
          (value) => {
            s.method = value;
            this.app.renderCurrent();
          },
          'Split method',
        ),
        this.splitRows,
        this.statusEl,
        s.method === 'equal'
          ? null
          : h(
              'p',
              { class: 'hint split-hint' },
              s.method === 'exact'
                ? 'Type an amount for anyone. The rest is shared by the others automatically (shown in grey).'
                : 'Type a percentage for anyone. The rest is shared by the others automatically (shown in grey).',
            ),
      ),
      h(
        'div',
        { class: 'card pad' },
        field('Note (optional)', h('textarea', { class: 'input', rows: 2, maxlength: 300, placeholder: 'Anything to remember?', onInput: (e) => (s.note = e.target.value) }, s.note)),
      ),
      error,
      h('div', { class: 'sticky-actions' }, button(this.existing ? 'Save changes' : 'Save expense', null, { type: 'submit', block: true })),
    );

    this.#autofill();
    this.#drawSplitRows();
    this.#updateStatus();
    return form;
  }

  #categoryGrid() {
    const grid = h('div', { class: 'cat-grid', role: 'radiogroup', 'aria-label': 'Category' });
    const draw = () => {
      clear(grid);
      append(
        grid,
        Category.ALL.map((cat) =>
          h(
            'button',
            {
              type: 'button',
              role: 'radio',
              'aria-checked': cat.id === this.state.categoryId ? 'true' : 'false',
              'aria-label': cat.name,
              class: `cat-btn ${cat.id === this.state.categoryId ? 'active' : ''}`,
              style: { '--cat': cat.color },
              onClick: () => {
                this.state.categoryId = cat.id;
                draw();
              },
            },
            categoryIcon(cat, 40),
            h('span', {}, cat.shortName),
          ),
        ),
      );
    };
    draw();
    return grid;
  }

  #drawSplitRows() {
    const s = this.state;
    clear(this.splitRows);
    this.shareEls = {};
    this.shareInputs = {};
    for (const person of this.participants) {
      const main = h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, person.displayName));
      if (s.method === 'equal') {
        const share = h('span', { class: 'muted small' });
        this.shareEls[person.id] = share;
        const checkbox = h('input', {
          type: 'checkbox',
          checked: s.included.has(person.id),
          'aria-label': `Include ${person.displayName}`,
          onChange: (e) => {
            if (e.target.checked) s.included.add(person.id);
            else s.included.delete(person.id);
            this.#updateStatus();
          },
        });
        append(this.splitRows, h('label', { class: 'row tappable check-row' }, avatar(person, 30), main, share, checkbox));
      } else {
        const isPercent = s.method === 'percent';
        const input = textInput({
          value: s.values[s.method][person.id] ?? '',
          placeholder: isPercent ? '0' : '0.00',
          inputmode: 'decimal',
          maxlength: 12,
          onInput: (v) => {
            s.values[s.method][person.id] = v;
            // Typing makes this box "yours". An emptied box stays yours until you
            // leave it, so it doesn't refill while you're still typing.
            s.manual[s.method].add(person.id);
            this.#autofill();
            this.#updateStatus();
          },
        });
        input.addEventListener('blur', () => {
          if (String(s.values[s.method][person.id] ?? '').trim() === '') {
            s.manual[s.method].delete(person.id);
            this.#autofill();
            this.#updateStatus();
          }
        });
        input.classList.add('share-input');
        input.classList.toggle('auto', !s.manual[s.method].has(person.id));
        this.shareInputs[person.id] = input;
        input.setAttribute('aria-label', `${person.displayName} ${isPercent ? 'percent' : 'amount'}`);
        const share = isPercent ? h('span', { class: 'muted small' }) : null;
        if (share) this.shareEls[person.id] = share;
        append(
          this.splitRows,
          h('div', { class: 'row' }, avatar(person, 30), main, share, h('div', { class: 'share-field' }, isPercent ? null : h('span', { class: 'muted' }, Money.symbol(this.store.currency)), input, isPercent ? h('span', { class: 'muted' }, '%') : null)),
        );
      }
    }
  }

  #split() {
    const s = this.state;
    const ids = this.participants.map((p) => p.id);
    const input =
      s.method === 'equal'
        ? { participantIds: ids.filter((id) => s.included.has(id)) }
        : { participantIds: ids, values: s.values[s.method] };
    return SplitStrategy.for(s.method).split(Money.parse(s.amountText) ?? 0, input, this.store.currency);
  }

  #updateStatus() {
    const result = this.#split();
    for (const [id, el] of Object.entries(this.shareEls ?? {})) {
      const cents = result.ok ? result.shares[id] ?? 0 : null;
      el.textContent = cents ? this.money(cents) : '';
    }
    if (!this.state.amountText.trim()) {
      // Nothing typed yet: a friendly hint, not an error.
      this.statusEl.className = 'split-status idle';
      this.statusEl.textContent = 'Type the amount above to see each person’s share.';
      return;
    }
    this.statusEl.className = `split-status ${result.ok ? 'ok' : 'warn'}`;
    this.statusEl.textContent = result.ok ? '✓ Shares add up to the total.' : result.error;
  }

  /**
   * Fills the boxes the user hasn't typed in, so the split always adds up.
   * Example: ₱400, type 260 for John and Ana gets 140.
   */
  #autofill() {
    const s = this.state;
    if (s.method === 'equal') return;
    const ids = this.participants.map((p) => p.id);
    const values = s.values[s.method];
    const manual = s.manual[s.method];
    const filled =
      s.method === 'exact'
        ? SplitAutofill.exact({ ids, values, manual, totalCents: Money.parse(s.amountText) })
        : SplitAutofill.percent({ ids, values, manual });
    for (const [id, text] of Object.entries(filled)) {
      values[id] = text;
      const input = this.shareInputs?.[id];
      if (input) {
        input.value = text;
        input.classList.add('auto');
      }
    }
    for (const id of manual) this.shareInputs?.[id]?.classList.remove('auto');
  }

  /** Converts saved shares back into percentages that add up to exactly 100. */
  static #percentsFromShares(expense) {
    const entries = Object.entries(expense.shares);
    const result = {};
    let used = 0;
    entries.forEach(([id, cents], index) => {
      const hundredths =
        index === entries.length - 1 ? 10000 - used : Math.round((cents / expense.amountCents) * 10000);
      used += hundredths;
      result[id] = String(hundredths / 100);
    });
    return result;
  }
}
