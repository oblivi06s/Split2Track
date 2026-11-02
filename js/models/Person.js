import { Entity } from './Entity.js';

/** You (isMe = true) or one of your friends. */
export class Person extends Entity {
  constructor({ name, isMe = false, hasAccount = false, email = null, ...base }) {
    super(base);
    this.name = String(name ?? '').trim();
    this.isMe = Boolean(isMe);
    /** Cloud mode: true when this person has signed up and joined. */
    this.hasAccount = Boolean(hasAccount);
    /** Cloud mode: email invite for a friend who hasn't joined yet. */
    this.email = email || null;
  }

  /** Cleans up an email. Returns null if empty. Throws if it doesn't look like an email. */
  static normalizeEmail(text) {
    const email = String(text ?? '').trim().toLowerCase();
    if (!email) return null;
    if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error('That email doesn’t look right');
    }
    return email;
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
    return { ...super.toJSON(), name: this.name, isMe: this.isMe, hasAccount: this.hasAccount, email: this.email };
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
