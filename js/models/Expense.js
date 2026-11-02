import { Entity } from './Entity.js';
import { Category } from './Category.js';

/**
 * One shared bill. All money is in whole cents (integers).
 * `shares` maps personId -> how many cents that person owes for this bill.
 * `groupId === null` means it is between friends, outside any group.
 */
export class Expense extends Entity {
  constructor({
    title,
    amountCents,
    categoryId = Category.OTHER.id,
    splitMethod = 'equal',
    date = Expense.today(),
    note = '',
    payerId,
    groupId = null,
    shares = {},
    ...base
  }) {
    super(base);
    this.title = String(title ?? '').trim();
    this.amountCents = Math.round(Number(amountCents) || 0);
    this.categoryId = categoryId;
    this.splitMethod = splitMethod;
    this.date = date;
    this.note = note;
    this.payerId = payerId;
    this.groupId = groupId;
    this.shares = { ...shares };
  }

  get category() {
    return Category.byId(this.categoryId);
  }

  shareOf(personId) {
    return this.shares[personId] ?? 0;
  }

  /** Ids of everyone this expense touches (payer + people with a share). */
  get involvedIds() {
    return new Set([this.payerId, ...Object.keys(this.shares)]);
  }

  involves(personId) {
    return this.involvedIds.has(personId);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      title: this.title,
      amountCents: this.amountCents,
      categoryId: this.categoryId,
      splitMethod: this.splitMethod,
      date: this.date,
      note: this.note,
      payerId: this.payerId,
      groupId: this.groupId,
      shares: { ...this.shares },
    };
  }

  static fromJSON(data) {
    return new Expense(data);
  }

  /** Today's date as YYYY-MM-DD in local time. */
  static today() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
}
