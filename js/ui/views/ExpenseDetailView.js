import { h, formatDate } from '../dom.js';
import { View } from '../View.js';
import { section, row, avatar, categoryIcon, emptyState, toast } from '../components.js';
import { linkButton, button } from '../forms.js';
import { SplitStrategy } from '../../services/SplitStrategy.js';

/** Full details of one expense, with Edit and Delete. */
export class ExpenseDetailView extends View {
  get expense() {
    return this.store.getExpense(this.params.id);
  }

  get title() {
    return 'Expense';
  }

  get backHref() {
    const e = this.expense;
    if (e?.groupId) return `#/groups/${e.groupId}`;
    return '#/activity';
  }

  actions() {
    if (!this.expense) return [];
    return [h('a', { class: 'icon-btn', href: `#/expense/${this.expense.id}/edit`, 'aria-label': 'Edit expense' }, '✏️')];
  }

  render() {
    const e = this.expense;
    if (!e) return emptyState('🤷', 'Expense not found', 'It may have been deleted.', linkButton('Go to activity', '#/activity'));

    const group = e.groupId ? this.store.getGroup(e.groupId) : null;
    const payer = this.store.getPerson(e.payerId);
    const shares = Object.entries(e.shares)
      .map(([id, cents]) => ({ person: this.store.getPerson(id), id, cents }))
      .sort((a, b) => (a.person?.isMe ? -1 : b.person?.isMe ? 1 : b.cents - a.cents));

    let methodLabel = e.splitMethod;
    try {
      methodLabel = SplitStrategy.for(e.splitMethod).label;
    } catch {
      /* unknown method from an old backup: show the raw id */
    }

    return h(
      'div',
      {},
      h(
        'div',
        { class: 'card pad expense-head' },
        categoryIcon(e.category, 64),
        h('h2', {}, e.title),
        h('div', { class: 'big-amount' }, this.money(e.amountCents)),
        h('div', { class: 'muted small' }, `${e.category.name} · ${formatDate(e.date)}`),
        group ? h('a', { class: 'context-chip', href: `#/groups/${group.id}` }, `${group.emoji} ${group.name}`) : null,
      ),
      section('Paid by', row({ leading: avatar(payer, 32), title: `${this.store.nameOf(e.payerId)} paid ${this.money(e.amountCents)}` })),
      section(
        `Split · ${methodLabel}`,
        shares.map(({ person, id, cents }) =>
          row({
            leading: avatar(person, 32),
            title: this.store.nameOf(id),
            subtitle: id === e.payerId ? 'paid' : `owes ${this.store.nameOf(e.payerId)}`,
            trailing: h('strong', {}, this.money(cents)),
          }),
        ),
      ),
      e.note ? section('Note', h('p', { class: 'pad note' }, e.note)) : null,
      h(
        'div',
        { class: 'section button-col' },
        linkButton('Edit expense', `#/expense/${e.id}/edit`, { kind: 'secondary', block: true }),
        button('Delete expense', () => this.#delete(), { kind: 'danger', block: true }),
      ),
    );
  }

  #delete() {
    if (!confirm('Delete this expense?')) return;
    const back = this.backHref;
    this.store.deleteExpense(this.params.id);
    toast('Expense deleted');
    this.go(back);
  }
}
