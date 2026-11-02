import { h } from '../dom.js';
import { View } from '../View.js';
import { section, row, balanceBadge, emptyState } from '../components.js';
import { linkButton } from '../forms.js';
import { BalanceService } from '../../services/BalanceService.js';

/** Home screen: your overall balance and your groups. */
export class GroupsView extends View {
  get title() {
    return 'Groups';
  }

  get tab() {
    return 'groups';
  }

  actions() {
    return [h('a', { class: 'icon-btn', href: '#/groups/new', 'aria-label': 'New group' }, '＋')];
  }

  render() {
    const me = this.store.me;
    const overall = BalanceService.netBalances(this.store.expensesFor(), this.store.settlementsFor()).get(me.id) ?? 0;
    const groups = this.store.allGroups();

    return h(
      'div',
      {},
      h(
        'div',
        { class: 'summary card pad' },
        h('div', {}, h('div', { class: 'summary-hi' }, `Hi, ${me.name}! 👋`), h('div', { class: 'muted small' }, 'Your overall balance')),
        balanceBadge(overall, this.store.currency),
      ),
      groups.length
        ? section('Your groups', groups.map((group) => this.#groupRow(group)))
        : emptyState('👥', 'No groups yet', 'Make a group for a trip, your house, or an event.', linkButton('Create a group', '#/groups/new')),
      groups.length ? h('div', { class: 'section' }, linkButton('＋ New group', '#/groups/new', { kind: 'secondary', block: true })) : null,
    );
  }

  #groupRow(group) {
    const me = this.store.me;
    const net = BalanceService.netBalances(
      this.store.expensesFor({ groupId: group.id }),
      this.store.settlementsFor({ groupId: group.id }),
    ).get(me.id) ?? 0;
    const count = this.store.expensesFor({ groupId: group.id }).length;

    return row({
      href: `#/groups/${group.id}`,
      leading: h('span', { class: 'emoji-tile', 'aria-hidden': 'true' }, group.emoji),
      title: group.name,
      subtitle: `${group.memberIds.length} members · ${count} expense${count === 1 ? '' : 's'}`,
      trailing: balanceBadge(net, this.store.currency),
    });
  }
}
