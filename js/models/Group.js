import { Entity } from './Entity.js';

/** A group like "Baguio Trip" or "Apartment". Members are stored by id. */
export class Group extends Entity {
  constructor({ name, emoji = '✈️', memberIds = [], inviteCode = null, isOwner = true, ...base }) {
    super(base);
    this.name = String(name ?? '').trim();
    this.emoji = emoji;
    this.memberIds = [...new Set(memberIds)];
    /** Cloud mode: code for the invite link (set by the server). */
    this.inviteCode = inviteCode;
    /** Cloud mode: only the creator can delete the group. */
    this.isOwner = Boolean(isOwner);
  }

  hasMember(personId) {
    return this.memberIds.includes(personId);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      name: this.name,
      emoji: this.emoji,
      memberIds: [...this.memberIds],
      inviteCode: this.inviteCode,
      isOwner: this.isOwner,
    };
  }

  static fromJSON(data) {
    return new Group(data);
  }
}
