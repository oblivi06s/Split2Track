import { h, formatMonth } from '../dom.js';
import { View } from '../View.js';
import { section, expenseRow, paymentRow, emptyState } from '../components.js';
import { selectInput } from '../forms.js';
import { Category } from '../../models/index.js';

/** Everything that happened, newest first, grouped by month. */
export class ActivityView extends View {
  constructor(...args) {
    super(...args);
    this.filter = 'all';
  }

  get title() {
    return 'Activity';
  }

  get tab() {
    return 'activity';
  }

  render() {
    const filter = this.filter;
    const expenses = this.store.expensesFor().filter((e) => filter === 'all' || e.categoryId === filter);
    const payments = filter === 'all' || filter === 'payments' ? this.store.settlementsFor() : [];
    const shownExpenses = filter === 'payments' ? [] : expenses;

    const items = [
      ...shownExpenses.map((e) => ({ date: e.date, created: e.createdAt, el: () => expenseRow(e, this.store, { showGroup: true }) })),
      ...payments.map((p) => ({ date: p.date, created: p.createdAt, el: () => paymentRow(p, this.store) })),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));

    const months = new Map();
    for (const item of items) {
      const key = item.date.slice(0, 7);
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(item);
    }

    const filterSelect = selectInput(
      [
        { value: 'all', label: 'Everything' },
        { value: 'payments', label: '💸 Payments only' },
        ...Category.ALL.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` })),
      ],
      filter,
      (value) => {
        this.filter = value;
        this.refresh();
      },
    );
    filterSelect.setAttribute('aria-label', 'Filter activity');

    const total = shownExpenses.reduce((acc, e) => acc + e.amountCents, 0);

    return h(
      'div',
      {},
      h(
        'div',
        { class: 'filter-bar' },
        filterSelect,
        filter !== 'all' && filter !== 'payments' ? h('span', { class: 'muted small' }, `Total: ${this.money(total)}`) : null,
      ),
      items.length
        ? [...months].map(([key, list]) => section(formatMonth(`${key}-01`), list.map((item) => item.el())))
        : emptyState('🧾', 'Nothing here yet', filter === 'all' ? 'Expenses and payments will show up here.' : 'No activity in this category.'),
    );
  }
}
