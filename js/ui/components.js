import { h } from './dom.js';
import { Money } from '../services/Money.js';
import { formatDate } from './dom.js';

/** Small reusable pieces of UI shared by many screens. */

const AVATAR_COLORS = ['#12a1a1', '#2f80ed', '#9b51e0', '#eb5c9a', '#f2994a', '#27ae60', '#5b5bd6', '#a0703c'];

export function avatar(person, size = 36) {
  const name = person?.name ?? '?';
  const sum = [...name].reduce((acc, ch) => acc + ch.codePointAt(0), 0);
  return h(
    'span',
    {
      class: 'avatar',
      'aria-hidden': 'true',
      style: { width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.4}px`, background: AVATAR_COLORS[sum % AVATAR_COLORS.length] },
    },
    person?.initials ?? '?',
  );
}

export function categoryIcon(category, size = 38) {
  return h(
    'span',
    {
      class: 'cat-icon',
      'aria-hidden': 'true',
      style: { width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.5}px`, background: `${category.color}26` },
    },
    category.icon,
  );
}

/** "you are owed ₱100" / "you owe ₱100" / "settled up". */
export function balanceBadge(cents, currency, { owedLabel = 'you are owed', oweLabel = 'you owe' } = {}) {
  if (cents > 0) return amountBlock(owedLabel, Money.format(cents, currency), 'pos');
  if (cents < 0) return amountBlock(oweLabel, Money.format(-cents, currency), 'neg');
  return h('span', { class: 'muted small' }, 'settled up');
}

export function amountBlock(label, amount, tone = '') {
  return h('div', { class: `amount-block ${tone}` }, h('span', { class: 'small' }, label), h('strong', {}, amount));
}

export function emptyState(icon, title, text, action = null) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, icon), h('h3', {}, title), h('p', { class: 'muted' }, text), action);
}

export function section(title, ...children) {
  return h('section', { class: 'section' }, title ? h('h2', { class: 'section-title' }, title) : null, h('div', { class: 'card' }, ...children));
}

/** A tappable row. Pass `href` to make it a link. */
export function row({ href, onClick, leading, title, subtitle, meta, trailing, className = '' }) {
  const tag = href ? 'a' : onClick ? 'button' : 'div';
  return h(
    tag,
    { class: `row ${className} ${href || onClick ? 'tappable' : ''}`, href, onClick, type: tag === 'button' ? 'button' : null },
    leading,
    h(
      'div',
      { class: 'row-main' },
      h('div', { class: 'row-title' }, title),
      subtitle ? h('div', { class: 'row-sub' }, subtitle) : null,
      meta ? h('div', { class: 'row-meta' }, meta) : null,
    ),
    trailing ? h('div', { class: 'row-trailing' }, trailing) : null,
  );
}

/** One expense in a list, showing what it means for you. */
export function expenseRow(expense, store, { showGroup = false } = {}) {
  const currency = store.currency;
  const me = store.me;
  const myShare = expense.shareOf(me.id);
  let trailing;
  if (expense.payerId === me.id) {
    const lent = expense.amountCents - myShare;
    trailing = lent > 0 ? amountBlock('you lent', Money.format(lent, currency), 'pos') : h('span', { class: 'muted small' }, 'no balance');
  } else if (myShare > 0) {
    trailing = amountBlock('you borrowed', Money.format(myShare, currency), 'neg');
  } else {
    trailing = h('span', { class: 'muted small' }, 'not involved');
  }

  const group = showGroup && expense.groupId ? store.getGroup(expense.groupId) : null;
  return row({
    href: `#/expense/${expense.id}`,
    leading: categoryIcon(expense.category),
    title: expense.title,
    subtitle: `${store.nameOf(expense.payerId)} paid ${Money.format(expense.amountCents, currency)}`,
    meta: [formatDate(expense.date), group ? ` · ${group.emoji} ${group.name}` : ''].join(''),
    trailing,
  });
}

/** One payment ("Ana paid You") in a list. */
export function paymentRow(payment, store, { onDelete } = {}) {
  return row({
    leading: h('span', { class: 'cat-icon pay', 'aria-hidden': 'true' }, '💸'),
    title: `${store.nameOf(payment.fromId)} paid ${store.nameOf(payment.toId)}`,
    meta: formatDate(payment.date) + (payment.note ? ` · ${payment.note}` : ''),
    trailing: h(
      'div',
      { class: 'pay-trailing' },
      h('strong', { class: 'brand' }, Money.format(payment.amountCents, store.currency)),
      onDelete
        ? h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Delete payment', onClick: onDelete }, '🗑️')
        : null,
    ),
  });
}

/** Donut chart + bars showing spending per category. */
export function categoryBreakdown(totals, currency) {
  if (!totals.length) {
    return emptyState('📊', 'No spending yet', 'Add an expense to see where the money goes.');
  }
  const grand = totals.reduce((acc, t) => acc + t.cents, 0);
  let start = 0;
  const stops = totals.map((t) => {
    const end = start + (t.cents / grand) * 360;
    const stop = `${t.category.color} ${start}deg ${end}deg`;
    start = end;
    return stop;
  });

  return h(
    'div',
    { class: 'breakdown' },
    h(
      'div',
      { class: 'donut', style: { background: `conic-gradient(${stops.join(', ')})` }, role: 'img', 'aria-label': 'Spending by category chart' },
      h('div', { class: 'donut-hole' }, h('span', { class: 'small muted' }, 'Total'), h('strong', {}, Money.format(grand, currency))),
    ),
    h(
      'div',
      { class: 'bars' },
      totals.map((t) => {
        const pct = Math.round((t.cents / grand) * 100);
        return h(
          'div',
          { class: 'bar-row' },
          h(
            'div',
            { class: 'bar-head' },
            categoryIcon(t.category, 28),
            h('span', { class: 'bar-name' }, t.category.name),
            h('strong', {}, Money.format(t.cents, currency)),
            h('span', { class: 'muted small bar-pct' }, `${pct}%`),
          ),
          h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${pct}%`, background: t.category.color } })),
        );
      }),
    ),
  );
}

/** Short message at the bottom of the screen. */
export function toast(message) {
  document.querySelectorAll('.toast').forEach((old) => old.remove());
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2200);
}
