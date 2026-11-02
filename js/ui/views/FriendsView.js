import { h } from '../dom.js';
import { View } from '../View.js';
import { section, row, avatar, balanceBadge, emptyState, toast } from '../components.js';
import { textInput, button } from '../forms.js';
import { BalanceService } from '../../services/BalanceService.js';

/** Everyone you split with, and who owes who overall. */
export class FriendsView extends View {
  get title() {
    return 'Friends';
  }

  get tab() {
    return 'friends';
  }

  render() {
    const me = this.store.me;
    const expenses = this.store.expensesFor();
    const payments = this.store.settlementsFor();
    const friends = this.store.friends();

    let owedToMe = 0;
    let iOwe = 0;
    const rows = friends.map((friend) => {
      const balance = BalanceService.pairwise(me.id, friend.id, expenses, payments);
      if (balance > 0) owedToMe += balance;
      else iOwe -= balance;
      return row({
        href: `#/friends/${friend.id}`,
        leading: avatar(friend),
        title: friend.name,
        trailing: balanceBadge(balance, this.store.currency, { owedLabel: 'owes you', oweLabel: 'you owe' }),
      });
    });

    return h(
      'div',
      {},
      h(
        'div',
        { class: 'stats' },
        h('div', { class: 'card pad stat' }, h('span', { class: 'muted small' }, 'Owed to you'), h('strong', { class: 'pos' }, this.money(owedToMe))),
        h('div', { class: 'card pad stat' }, h('span', { class: 'muted small' }, 'You owe'), h('strong', { class: 'neg' }, this.money(iOwe))),
      ),
      this.#addFriendForm(),
      friends.length ? section('Friends', rows) : emptyState('🙋', 'No friends yet', 'Add a friend above, or inside a group.'),
    );
  }

  #addFriendForm() {
    const input = textInput({ placeholder: 'Friend’s name' });
    input.setAttribute('aria-label', 'Friend’s name');
    const submit = (event) => {
      event.preventDefault();
      try {
        const friend = this.store.addFriend(input.value);
        toast(`${friend.name} added`);
      } catch (e) {
        toast(e.message);
      }
    };
    return h('form', { class: 'card add-row pad-sm', onSubmit: submit }, input, button('Add friend', null, { type: 'submit' }));
  }
}
