import { Entity } from './Entity.js';

/** A group like "Baguio Trip" or "Apartment". Members are stored by id. */
export class Group extends Entity {
  constructor({ name, emoji = '✈️', memberIds = [], ...base }) {
    super(base);
    this.name = String(name ?? '').trim();
    this.emoji = emoji;
    this.memberIds = [...new Set(memberIds)];
  }

  hasMember(personId) {
    return this.memberIds.includes(personId);
  }

  toJSON() {
    return { ...super.toJSON(), name: this.name, emoji: this.emoji, memberIds: [...this.memberIds] };
  }

  static fromJSON(data) {
    return new Group(data);
  }
}
