import { h, clear, append } from '../dom.js';
import { View } from '../View.js';
import { field, textInput, selectInput, segmented, button, errorText, linkButton } from '../forms.js';
import { avatar, categoryIcon, emptyState, toast } from '../components.js';
import { Category, Expense } from '../../models/index.js';
import { Money } from '../../services/Money.js';
import { SplitStrategy } from '../../services/SplitStrategy.js';

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
      note: e?.note ?? '',
    };
    if (e?.splitMethod === 'exact') {
      for (const [id, cents] of Object.entries(e.shares)) this.state.values.exact[id] = Money.toInput(cents);
    }
    if (e?.splitMethod === 'percent') this.state.values.percent = ExpenseFormView.#percentsFromShares(e);
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
            this.#prefill(value);
            this.app.renderCurrent();
          },
          'Split method',
        ),
        this.splitRows,
        this.statusEl,
      ),
      h(
        'div',
        { class: 'card pad' },
        field('Note (optional)', h('textarea', { class: 'input', rows: 2, maxlength: 300, placeholder: 'Anything to remember?', onInput: (e) => (s.note = e.target.value) }, s.note)),
      ),
      error,
      h('div', { class: 'section' }, button(this.existing ? 'Save changes' : 'Save expense', null, { type: 'submit', block: true })),
    );

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
            this.#updateStatus();
          },
        });
        input.classList.add('share-input');
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
    this.statusEl.className = `split-status ${result.ok ? 'ok' : 'warn'}`;
    this.statusEl.textContent = result.ok ? '✓ Shares add up to the total.' : result.error;
  }

  /** When switching to Exact or Percent with nothing typed, start from an equal split. */
  #prefill(method) {
    const s = this.state;
    if (method === 'equal') return;
    const values = s.values[method];
    if (Object.values(values).some((v) => String(v).trim() !== '')) return;
    const ids = this.participants.map((p) => p.id);
    const total = Money.parse(s.amountText);

    if (method === 'exact' && total) {
      const { shares } = SplitStrategy.for('equal').split(total, { participantIds: ids });
      for (const id of ids) values[id] = Money.toInput(shares[id]);
    }
    if (method === 'percent') {
      // Work in hundredths of a percent so the total is exactly 100.
      const base = Math.floor(10000 / ids.length);
      let extra = 10000 - base * ids.length;
      for (const id of ids) {
        const hundredths = base + (extra-- > 0 ? 1 : 0);
        values[id] = String(hundredths / 100);
      }
    }
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
