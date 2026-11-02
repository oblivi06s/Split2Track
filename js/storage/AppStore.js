import { Person, Group, Expense, Settlement } from '../models/index.js';

const SCHEMA_VERSION = 1;

/**
 * The single place that owns all app data (Repository pattern).
 * Views read from it and call its methods to change data.
 * Views subscribe to it and redraw when data changes (Observer pattern).
 */
export class AppStore {
  /** @param {import('./StorageAdapter.js').StorageAdapter} adapter */
  constructor(adapter) {
    this.adapter = adapter;
    this.listeners = new Set();
    this.#reset();
    this.#hydrate(adapter.load());
  }

  // ---------- Observer ----------

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #commit() {
    this.adapter.save(this.toJSON());
    for (const listener of this.listeners) listener(this);
  }

  // ---------- Settings ----------

  get currency() {
    return this.settings.currency;
  }

  setCurrency(code) {
    this.settings.currency = code;
    this.#commit();
  }

  // ---------- People ----------

  get me() {
    return [...this.people.values()].find((person) => person.isMe) ?? null;
  }

  createMe(name) {
    if (this.me) throw new Error('Profile already exists');
    const me = new Person({ name, isMe: true });
    this.#requireName(me.name);
    this.people.set(me.id, me);
    this.#commit();
    return me;
  }

  getPerson(id) {
    return this.people.get(id) ?? null;
  }

  /** Name to show for an id ("You", "Ana", or "Someone" if deleted). */
  nameOf(id) {
    return this.people.get(id)?.displayName ?? 'Someone';
  }

  friends() {
    return [...this.people.values()].filter((p) => !p.isMe).sort(Person.compare);
  }

  addFriend(name) {
    const friend = new Person({ name });
    this.#requireName(friend.name);
    this.people.set(friend.id, friend);
    this.#commit();
    return friend;
  }

  renamePerson(id, name) {
    const person = this.#require(this.people, id, 'Person');
    const trimmed = String(name ?? '').trim();
    this.#requireName(trimmed);
    person.name = trimmed;
    this.#commit();
  }

  /** True if the person appears in any expense, payment, or group. */
  isPersonInUse(id) {
    return (
      [...this.expenses.values()].some((e) => e.involves(id)) ||
      [...this.settlements.values()].some((s) => s.involves(id)) ||
      [...this.groups.values()].some((g) => g.hasMember(id))
    );
  }

  removeFriend(id) {
    const person = this.#require(this.people, id, 'Person');
    if (person.isMe) throw new Error('You cannot remove yourself');
    if (this.isPersonInUse(id)) throw new Error(`${person.name} still has groups or expenses`);
    this.people.delete(id);
    this.#commit();
  }

  // ---------- Groups ----------

  getGroup(id) {
    return this.groups.get(id) ?? null;
  }

  allGroups() {
    return [...this.groups.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  membersOf(groupId) {
    const group = this.getGroup(groupId);
    if (!group) return [];
    return group.memberIds.map((id) => this.people.get(id)).filter(Boolean).sort(Person.compare);
  }

  createGroup({ name, emoji, memberIds = [] }) {
    const me = this.#requireMe();
    const group = new Group({ name, emoji, memberIds: [me.id, ...memberIds] });
    this.#requireName(group.name);
    this.groups.set(group.id, group);
    this.#commit();
    return group;
  }

  updateGroup(id, { name, emoji, memberIds }) {
    const group = this.#require(this.groups, id, 'Group');
    if (name !== undefined) {
      const trimmed = String(name).trim();
      this.#requireName(trimmed);
      group.name = trimmed;
    }
    if (emoji !== undefined) group.emoji = emoji;
    if (memberIds !== undefined) {
      const locked = this.lockedMemberIds(id);
      const next = new Set([this.#requireMe().id, ...memberIds, ...locked]);
      group.memberIds = [...next];
    }
    this.#commit();
  }

  /** Members with expenses or payments in the group can't be removed. */
  lockedMemberIds(groupId) {
    const locked = new Set();
    for (const expense of this.expensesFor({ groupId })) {
      for (const id of expense.involvedIds) locked.add(id);
    }
    for (const payment of this.settlementsFor({ groupId })) {
      locked.add(payment.fromId);
      locked.add(payment.toId);
    }
    return locked;
  }

  /** Deletes the group and everything in it. */
  deleteGroup(id) {
    this.#require(this.groups, id, 'Group');
    for (const expense of this.expensesFor({ groupId: id })) this.expenses.delete(expense.id);
    for (const payment of this.settlementsFor({ groupId: id })) this.settlements.delete(payment.id);
    this.groups.delete(id);
    this.#commit();
  }

  // ---------- Expenses ----------

  getExpense(id) {
    return this.expenses.get(id) ?? null;
  }

  /**
   * Expenses, newest first.
   * groupId: only that group. personIds: only ones touching ALL these people.
   */
  expensesFor({ groupId, personIds } = {}) {
    return [...this.expenses.values()]
      .filter((e) => groupId === undefined || e.groupId === groupId)
      .filter((e) => !personIds || personIds.every((id) => e.involves(id)))
      .sort(AppStore.#newestFirst);
  }

  /** Adds a new expense or replaces an existing one with the same id. */
  saveExpense(data) {
    const expense = data instanceof Expense ? data : new Expense(data);
    if (!expense.title) throw new Error('Expense needs a title');
    const sum = Object.values(expense.shares).reduce((a, b) => a + b, 0);
    if (expense.amountCents <= 0 || sum !== expense.amountCents) {
      throw new Error('Shares must add up to the total');
    }
    this.expenses.set(expense.id, expense);
    this.#commit();
    return expense;
  }

  deleteExpense(id) {
    this.expenses.delete(id);
    this.#commit();
  }

  // ---------- Settlements ----------

  getSettlement(id) {
    return this.settlements.get(id) ?? null;
  }

  settlementsFor({ groupId, personIds } = {}) {
    return [...this.settlements.values()]
      .filter((s) => groupId === undefined || s.groupId === groupId)
      .filter((s) => !personIds || personIds.every((id) => s.involves(id)))
      .sort(AppStore.#newestFirst);
  }

  recordSettlement(data) {
    const payment = new Settlement(data);
    if (payment.amountCents <= 0) throw new Error('Amount must be more than zero');
    if (payment.fromId === payment.toId) throw new Error('Payer and receiver must be different');
    this.settlements.set(payment.id, payment);
    this.#commit();
    return payment;
  }

  deleteSettlement(id) {
    this.settlements.delete(id);
    this.#commit();
  }

  // ---------- Import / export ----------

  toJSON() {
    const list = (map) => [...map.values()].map((item) => item.toJSON());
    return {
      version: SCHEMA_VERSION,
      settings: { ...this.settings },
      people: list(this.people),
      groups: list(this.groups),
      expenses: list(this.expenses),
      settlements: list(this.settlements),
    };
  }

  /** Replaces all data with a backup. Throws if the file is not valid. */
  importJSON(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.people)) {
      throw new Error('This is not a Split2Track backup file');
    }
    if (!data.people.some((p) => p.isMe)) throw new Error('Backup has no profile');
    this.#reset();
    this.#hydrate(data);
    this.#commit();
  }

  /** Deletes everything except your profile and settings. */
  eraseAll() {
    const me = this.me;
    const settings = { ...this.settings };
    this.#reset();
    this.settings = settings;
    if (me) this.people.set(me.id, me);
    this.#commit();
  }

  // ---------- Internals ----------

  #reset() {
    this.settings = { currency: 'PHP' };
    this.people = new Map();
    this.groups = new Map();
    this.expenses = new Map();
    this.settlements = new Map();
  }

  #hydrate(data) {
    if (!data) return;
    const fill = (map, rows = [], Model) => {
      for (const row of rows) {
        const item = Model.fromJSON(row);
        map.set(item.id, item);
      }
    };
    this.settings = { ...this.settings, ...(data.settings ?? {}) };
    fill(this.people, data.people, Person);
    fill(this.groups, data.groups, Group);
    fill(this.expenses, data.expenses, Expense);
    fill(this.settlements, data.settlements, Settlement);
  }

  #require(map, id, label) {
    const item = map.get(id);
    if (!item) throw new Error(`${label} not found`);
    return item;
  }

  #requireMe() {
    const me = this.me;
    if (!me) throw new Error('Create your profile first');
    return me;
  }

  #requireName(name) {
    if (!name) throw new Error('Name cannot be empty');
  }

  static #newestFirst(a, b) {
    return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
  }
}
