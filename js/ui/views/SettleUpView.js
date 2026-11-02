import { h } from '../dom.js';
import { View } from '../View.js';
import { field, textInput, selectInput, button, errorText, linkButton } from '../forms.js';
import { emptyState, toast } from '../components.js';
import { Money } from '../../services/Money.js';
import { Expense } from '../../models/index.js';

/**
 * Record a payment.
 *   #/settle?group=ID&from=ID&to=ID&amount=CENTS
 *   #/settle?friend=ID&from=ID&to=ID&amount=CENTS
 */
export class SettleUpView extends View {
  constructor(...args) {
    super(...args);
    this.groupId = this.query.get('group');
    this.friendId = this.query.get('friend');
    const me = this.store.me;

    if (this.groupId) this.people = this.store.membersOf(this.groupId);
    else {
      const friend = this.friendId ? this.store.getPerson(this.friendId) : null;
      this.people = friend && !friend.isMe ? [me, friend] : [];
    }

    const ids = this.people.map((p) => p.id);
    const pick = (value, fallback) => (ids.includes(value) ? value : fallback);
    const other = ids.find((id) => id !== me.id);
    const amount = Number(this.query.get('amount'));
    this.state = {
      fromId: pick(this.query.get('from'), me.id),
      toId: pick(this.query.get('to'), other),
      amountText: amount > 0 ? Money.toInput(amount) : '',
      date: Expense.today(),
      note: '',
    };
  }

  get title() {
    return 'Settle up';
  }

  get backHref() {
    if (this.groupId) return `#/groups/${this.groupId}?pane=balances`;
    if (this.friendId) return `#/friends/${this.friendId}`;
    return '#/friends';
  }

  get live() {
    return false;
  }

  render() {
    if (this.people.length < 2) {
      return emptyState('🤝', 'Nobody to settle with', 'Open a group or a friend first.', linkButton('Go to groups', '#/groups'));
    }
    const s = this.state;
    const error = errorText();
    const options = this.people.map((p) => ({ value: p.id, label: p.displayName }));
    const amountInput = textInput({ value: s.amountText, placeholder: '0.00', inputmode: 'decimal', maxlength: 15, onInput: (v) => (s.amountText = v) });
    amountInput.classList.add('amount-input');

    const save = (event) => {
      event.preventDefault();
      try {
        const cents = Money.parse(s.amountText);
        if (!cents) throw new Error('Enter an amount greater than zero.');
        this.store.recordSettlement({
          fromId: s.fromId,
          toId: s.toId,
          amountCents: cents,
          date: s.date || Expense.today(),
          note: s.note.trim(),
          groupId: this.groupId ?? null,
        });
        toast('Payment recorded');
        this.go(this.backHref);
      } catch (e) {
        error.textContent = e.message;
      }
    };

    return h(
      'form',
      { onSubmit: save, novalidate: true },
      h('div', { class: 'settle-hero', 'aria-hidden': 'true' }, '🤝'),
      h(
        'div',
        { class: 'card pad' },
        field('Who paid?', selectInput(options, s.fromId, (v) => (s.fromId = v))),
        field('Who received it?', selectInput(options, s.toId, (v) => (s.toId = v))),
        field('Amount', h('div', { class: 'amount-wrap' }, h('span', { class: 'currency' }, Money.symbol(this.store.currency)), amountInput)),
        field('Date', h('input', { type: 'date', class: 'input', value: s.date, onChange: (e) => (s.date = e.target.value) })),
        field('Note (optional)', textInput({ placeholder: 'e.g. GCash', onInput: (v) => (s.note = v) })),
      ),
      error,
      h('div', { class: 'section' }, button('Record payment', null, { type: 'submit', block: true })),
      h('p', { class: 'muted small center' }, 'This only records the payment. Send the money with GCash, bank, or cash.'),
    );
  }
}
