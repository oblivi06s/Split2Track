/**
 * Base class for everything we save (Person, Group, Expense, Settlement).
 * Gives each object an id and a creation time.
 */
export class Entity {
  constructor({ id = Entity.newId(), createdAt = new Date().toISOString() } = {}) {
    this.id = id;
    this.createdAt = createdAt;
  }

  static newId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /** Plain object for saving. Subclasses add their own fields. */
  toJSON() {
    return { id: this.id, createdAt: this.createdAt };
  }
}
