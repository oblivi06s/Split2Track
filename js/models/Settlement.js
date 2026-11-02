import { Entity } from './Entity.js';
import { Expense } from './Expense.js';

/** A payment that pays back a debt: `fromId` paid `toId`. */
export class Settlement extends Entity {
  constructor({ fromId, toId, amountCents, date = Expense.today(), note = '', groupId = null, ...base }) {
    super(base);
    this.fromId = fromId;
    this.toId = toId;
    this.amountCents = Math.round(Number(amountCents) || 0);
    this.date = date;
    this.note = note;
    this.groupId = groupId;
  }

  involves(personId) {
    return this.fromId === personId || this.toId === personId;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      fromId: this.fromId,
      toId: this.toId,
      amountCents: this.amountCents,
      date: this.date,
      note: this.note,
      groupId: this.groupId,
    };
  }

  static fromJSON(data) {
    return new Settlement(data);
  }
}
