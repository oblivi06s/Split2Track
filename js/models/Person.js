import { Entity } from './Entity.js';

/** You (isMe = true) or one of your friends. */
export class Person extends Entity {
  constructor({ name, isMe = false, ...base }) {
    super(base);
    this.name = String(name ?? '').trim();
    this.isMe = Boolean(isMe);
  }

  /** "You" for yourself, the real name for friends. */
  get displayName() {
    return this.isMe ? 'You' : this.name;
  }

  get initials() {
    const letters = this.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('');
    return letters ? letters.toUpperCase() : '?';
  }

  toJSON() {
    return { ...super.toJSON(), name: this.name, isMe: this.isMe };
  }

  static fromJSON(data) {
    return new Person(data);
  }

  /** Sort helper: you first, then friends A to Z. */
  static compare(a, b) {
    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  }
}
