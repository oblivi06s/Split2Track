import { h } from '../dom.js';
import { View } from '../View.js';
import { section, row, avatar, expenseRow, paymentRow, emptyState, categoryBreakdown, toast } from '../components.js';
import { segmented, linkButton, button } from '../forms.js';
import { BalanceService } from '../../services/BalanceService.js';

/** One group: expenses, balances, and spending by category. */
export class GroupDetailView extends View {
  constructor(...args) {
    super(...args);
    this.pane = this.query.get('pane') ?? 'expenses';
  }

  get group() {
    return this.store.getGroup(this.params.id);
  }

  get title() {
    return this.group?.name ?? 'Group';
  }

  get tab() {
    return 'groups';
  }

  get backHref() {
    return '#/groups';
  }

  actions() {
    if (!this.group) return [];
    return [h('a', { class: 'icon-btn', href: `#/groups/${this.group.id}/edit`, 'aria-label': 'Edit group' }, '✏️')];
  }

  render() {
    const group = this.group;
    if (!group) return emptyState('🤷', 'Group not found', 'It may have been deleted.', linkButton('Back to groups', '#/groups'));

    const expenses = this.store.expensesFor({ groupId: group.id });
    const payments = this.store.settlementsFor({ groupId: group.id });
    const net = BalanceService.netBalances(expenses, payments);
    const transfers = BalanceService.simplify(net);
    const myNet = net.get(this.store.me.id) ?? 0;
    const total = expenses.reduce((acc, e) => acc + e.amountCents, 0);
    const canAdd = group.memberIds.length > 1;

    let status;
    if (myNet > 0) status = h('div', { class: 'pos strong' }, `You are owed ${this.money(myNet)}`);
    else if (myNet < 0) status = h('div', { class: 'neg strong' }, `You owe ${this.money(-myNet)}`);
    else status = h('div', { class: 'muted strong' }, 'You are settled up');

    const panes = {
      expenses: () => this.#expensesPane(expenses, payments, canAdd),
      balances: () => this.#balancesPane(net, transfers),
      spending: () => section('Where the money went', h('div', { class: 'pad' }, categoryBreakdown(BalanceService.categoryTotals(expenses), this.store.currency))),
    };

    return h(
      'div',
      {},
      h(
        'div',
        { class: 'card pad group-head' },
        h('span', { class: 'emoji-tile big', 'aria-hidden': 'true' }, group.emoji),
        h('div', {}, h('h2', { class: 'group-name' }, group.name), status, h('div', { class: 'muted small' }, `Group spending: ${this.money(total)}`)),
      ),
      canAdd
        ? h(
            'div',
            { class: 'button-row' },
            linkButton('Settle up', this.#settleHref(transfers), { kind: 'secondary' }),
            linkButton('＋ Add expense', `#/expense/new?group=${group.id}`),
          )
        : h('div', { class: 'notice' }, 'Add at least one friend to this group to start adding expenses. ', h('a', { href: `#/groups/${group.id}/edit` }, 'Add members')),
      segmented(
        [
          { value: 'expenses', label: 'Expenses' },
          { value: 'balances', label: 'Balances' },
          { value: 'spending', label: 'Spending' },
        ],
        this.pane,
        (value) => {
          this.pane = value;
          this.refresh();
        },
        'Group sections',
      ),
      (panes[this.pane] ?? panes.expenses)(),
      h(
        'div',
        { class: 'section' },
        button('Delete group', () => this.#deleteGroup(), { kind: 'danger', block: true }),
      ),
    );
  }

  #expensesPane(expenses, payments, canAdd) {
    if (!expenses.length && !payments.length) {
      return emptyState('🧾', 'No expenses yet', canAdd ? 'Tap "Add expense" to log the first one.' : 'Add members first.');
    }
    const items = [
      ...expenses.map((e) => ({ date: e.date, created: e.createdAt, el: () => expenseRow(e, this.store) })),
      ...payments.map((p) => ({
        date: p.date,
        created: p.createdAt,
        el: () =>
          paymentRow(p, this.store, {
            onDelete: () => {
              if (confirm('Delete this payment?')) this.store.deleteSettlement(p.id);
            },
          }),
      })),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
    return section(null, items.map((item) => item.el()));
  }

  #balancesPane(net, transfers) {
    const members = this.store.membersOf(this.group.id);
    return h(
      'div',
      {},
      section(
        'Member balances',
        members.map((member) => {
          const balance = net.get(member.id) ?? 0;
          let trailing;
          if (balance > 0) trailing = h('span', { class: 'pos' }, `gets back ${this.money(balance)}`);
          else if (balance < 0) trailing = h('span', { class: 'neg' }, `owes ${this.money(-balance)}`);
          else trailing = h('span', { class: 'muted' }, 'settled up');
          return row({ leading: avatar(member, 32), title: member.displayName, trailing });
        }),
      ),
      section(
        'Suggested payments',
        transfers.length
          ? transfers.map((t) =>
              row({
                title: `${this.store.nameOf(t.fromId)} → ${this.store.nameOf(t.toId)}`,
                subtitle: this.money(t.amountCents),
                trailing: linkButton('Record', this.#settleHref([t]), { kind: 'secondary' }),
              }),
            )
          : h('div', { class: 'pad brand' }, '🎉 Everyone is settled up'),
      ),
      h('p', { class: 'muted small section' }, 'Debts are simplified so the group needs the fewest payments.'),
    );
  }

  /** Link to Settle Up, pre-filled with the best payment (one involving you if possible). */
  #settleHref(transfers) {
    const meId = this.store.me.id;
    const pick = transfers.find((t) => t.fromId === meId || t.toId === meId) ?? transfers[0];
    const params = new URLSearchParams({ group: this.group.id });
    if (pick) {
      params.set('from', pick.fromId);
      params.set('to', pick.toId);
      params.set('amount', String(pick.amountCents));
    }
    return `#/settle?${params}`;
  }

  #deleteGroup() {
    const group = this.group;
    if (!confirm(`Delete "${group.name}" and all its expenses? This cannot be undone.`)) return;
    this.store.deleteGroup(group.id);
    toast('Group deleted');
    this.go('#/groups');
  }
}
