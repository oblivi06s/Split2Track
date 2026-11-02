import { h } from '../dom.js';
import { View } from '../View.js';
import { section, avatar, expenseRow, paymentRow, emptyState, toast } from '../components.js';
import { linkButton, button, textInput } from '../forms.js';
import { BalanceService } from '../../services/BalanceService.js';

/** Your balance with one friend, and everything you share. */
export class FriendDetailView extends View {
  get friend() {
    const person = this.store.getPerson(this.params.id);
    return person && !person.isMe ? person : null;
  }

  get title() {
    return this.friend?.name ?? 'Friend';
  }

  get tab() {
    return 'friends';
  }

  get backHref() {
    return '#/friends';
  }

  render() {
    const friend = this.friend;
    if (!friend) return emptyState('🤷', 'Friend not found', 'They may have been removed.', linkButton('Back to friends', '#/friends'));

    const me = this.store.me;
    const ids = [me.id, friend.id];
    const expenses = this.store.expensesFor({ personIds: ids });
    const payments = this.store.settlementsFor({ personIds: ids });
    const balance = BalanceService.pairwise(me.id, friend.id, this.store.expensesFor(), this.store.settlementsFor());

    let status;
    if (balance > 0) status = h('div', { class: 'pos strong' }, `${friend.name} owes you ${this.money(balance)}`);
    else if (balance < 0) status = h('div', { class: 'neg strong' }, `You owe ${friend.name} ${this.money(-balance)}`);
    else status = h('div', { class: 'muted strong' }, `You and ${friend.name} are settled up`);

    const settle = new URLSearchParams({ friend: friend.id });
    if (balance !== 0) {
      settle.set('from', balance > 0 ? friend.id : me.id);
      settle.set('to', balance > 0 ? me.id : friend.id);
      settle.set('amount', String(Math.abs(balance)));
    }

    const items = [
      ...expenses.map((e) => ({ date: e.date, created: e.createdAt, el: () => expenseRow(e, this.store, { showGroup: true }) })),
      ...payments.map((p) => ({ date: p.date, created: p.createdAt, el: () => paymentRow(p, this.store) })),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));

    const canRemove = !this.store.isPersonInUse(friend.id);

    return h(
      'div',
      {},
      h('div', { class: 'card pad friend-head' }, avatar(friend, 64), h('h2', {}, friend.name), status),
      this.app.mode === 'cloud' ? this.#inviteCard(friend) : null,
      h(
        'div',
        { class: 'button-row' },
        linkButton('Settle up', `#/settle?${settle}`, { kind: 'secondary' }),
        linkButton('＋ Add expense', `#/expense/new?friend=${friend.id}`),
      ),
      items.length
        ? section('Shared activity', items.map((item) => item.el()))
        : emptyState('🧾', 'Nothing shared yet', `Add an expense with ${friend.name}.`),
      h(
        'div',
        { class: 'section' },
        canRemove
          ? button(`Remove ${friend.name}`, () => this.#remove(friend), { kind: 'danger', block: true })
          : h('p', { class: 'muted small center' }, `${friend.name} is in a group or has expenses, so they can't be removed.`),
      ),
    );
  }

  /** Cloud mode: shows if the friend joined, or lets you invite them by email. */
  #inviteCard(friend) {
    if (friend.hasAccount) {
      return h('div', { class: 'notice' }, `✓ ${friend.name} has joined Split2Track. You both see the same shared expenses.`);
    }
    const input = textInput({ type: 'email', value: friend.email ?? '', placeholder: 'friend@example.com', maxlength: 254 });
    input.setAttribute('aria-label', `${friend.name}’s email`);
    input.setAttribute('inputmode', 'email');
    const save = (event) => {
      event.preventDefault();
      try {
        this.store.setPersonEmail(friend.id, input.value);
        toast(input.value.trim() ? `Invite saved. ${friend.name} will see your groups when they sign in.` : 'Email removed');
      } catch (e) {
        toast(e.message);
      }
    };
    return h(
      'form',
      { class: 'card pad invite', onSubmit: save },
      h('h3', {}, friend.email ? '✉️ Invited by email' : '✉️ Invite by email'),
      h(
        'p',
        { class: 'muted small' },
        friend.email
          ? `${friend.name} will see your shared groups and expenses when they sign in or sign up with this email.`
          : `Add ${friend.name}’s email. When they sign in or sign up with it, they’ll see your shared groups and expenses.`,
      ),
      h('div', { class: 'add-row' }, input, button(friend.email ? 'Update' : 'Invite', null, { type: 'submit' })),
    );
  }

  #remove(friend) {
    if (!confirm(`Remove ${friend.name} from your friends?`)) return;
    try {
      this.store.removeFriend(friend.id);
      toast(`${friend.name} removed`);
      this.go('#/friends');
    } catch (e) {
      toast(e.message);
    }
  }
}
