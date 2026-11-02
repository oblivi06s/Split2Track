/**
 * In-memory stand-in for CloudService, used by tests.
 * Mimics the server: tables, default values (invite codes, owner),
 * the shares check, invites/claiming, and change notifications.
 * It does NOT copy the security rules (those are tested in supabase/tests).
 *
 * Optional `storage` (like localStorage) lets several browser tabs share
 * one fake server, so invite links can be tested end to end.
 */
const TABLES = ['people', 'groups', 'group_members', 'expenses', 'settlements'];
const SERVER_KEY = '__fake_supabase_server';
const USERS_KEY = '__fake_supabase_users';
const SESSION_KEY = '__fake_supabase_session';

export class FakeCloudService {
  constructor({ storage = null, sessionStorage = null, userId = null, email = 'test@example.com' } = {}) {
    this.storage = storage;
    this.sessionStorage = sessionStorage;
    this.memory = { server: emptyServer(), users: {} };
    this.session = userId ? { user: { id: userId, email, user_metadata: {} } } : this.#read(SESSION_KEY, this.sessionStorage);
    this.listeners = new Set();
    this.offline = false;
    this.calls = [];
    this.failNextApply = null;
    if (storage && typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === SERVER_KEY) this.#notify();
      });
    }
  }

  // ---------- Accounts ----------

  async getSession() {
    return this.session;
  }

  onAuthChange() {
    return () => {};
  }

  async signUp(email, password, name) {
    const users = this.#users();
    if (users[email]) throw new Error('User already registered');
    if (password.length < 6) throw new Error('Password should be at least 6 characters.');
    users[email] = { id: crypto.randomUUID(), password, name };
    this.#saveUsers(users);
    return this.signIn(email, password);
  }

  async signIn(email, password) {
    const user = this.#users()[email];
    if (!user || user.password !== password) throw new Error('Invalid login credentials');
    this.session = { user: { id: user.id, email, user_metadata: { name: user.name } } };
    this.#write(SESSION_KEY, this.session, this.sessionStorage);
    return { session: this.session };
  }

  async resetPassword() {}

  async signOut() {
    this.session = null;
    this.sessionStorage?.removeItem(SESSION_KEY);
  }

  // ---------- Data ----------

  async fetchAll() {
    this.#checkOnline();
    this.calls.push('fetchAll');
    const { aliases, ...tables } = this.#server();
    return structuredClone(tables);
  }

  async apply(diff) {
    this.#checkOnline();
    this.calls.push('apply');
    if (this.failNextApply) {
      const error = this.failNextApply;
      this.failNextApply = null;
      throw error;
    }
    const server = this.#server();
    const uid = this.session.user.id;
    const now = () => new Date().toISOString();

    server.aliases ??= {};
    const resolve = (id) => server.aliases[id] ?? id;
    for (const table of TABLES) {
      for (const original of diff.upserts[table] ?? []) {
        // Like the triggers in schema.sql: old placeholder ids point to whoever claimed them.
        const row = structuredClone(original);
        if (table === 'people' && server.aliases[row.id]) continue;
        if (table === 'group_members') row.person_id = resolve(row.person_id);
        if (table === 'expenses') {
          row.payer_id = resolve(row.payer_id);
          const shares = {};
          for (const [id, cents] of Object.entries(row.shares)) shares[resolve(id)] = (shares[resolve(id)] ?? 0) + cents;
          row.shares = shares;
        }
        if (table === 'settlements') {
          row.from_id = resolve(row.from_id);
          row.to_id = resolve(row.to_id);
        }
        if (table === 'group_members') {
          if (!server.group_members.some((m) => m.group_id === row.group_id && m.person_id === row.person_id)) {
            server.group_members.push({ ...row });
          }
          continue;
        }
        if (table === 'expenses') {
          const total = Object.values(row.shares).reduce((a, b) => a + b, 0);
          if (total !== row.amount_cents) throw new Error('Shares must add up to the total');
        }
        if (table === 'people' && 'email' in row) row.email = row.email ? String(row.email).trim().toLowerCase() : null;
        const existing = server[table].find((r) => r.id === row.id);
        if (existing) Object.assign(existing, row);
        else {
          const defaults = { owner_id: uid, created_at: now() };
          if (table === 'groups') defaults.invite_code = Math.random().toString(36).slice(2, 14);
          if (table === 'people') defaults.user_id = null;
          server[table].push({ ...defaults, ...row });
        }
      }
    }
    for (const table of [...TABLES].reverse()) {
      for (const row of diff.deletes[table] ?? []) {
        if (table === 'group_members') {
          server.group_members = server.group_members.filter((m) => !(m.group_id === row.group_id && m.person_id === row.person_id));
        } else {
          server[table] = server[table].filter((r) => r.id !== row.id);
          if (table === 'groups') {
            server.group_members = server.group_members.filter((m) => m.group_id !== row.id);
            server.expenses = server.expenses.filter((e) => e.group_id !== row.id);
            server.settlements = server.settlements.filter((s) => s.group_id !== row.id);
          }
        }
      }
    }
    this.#saveServer(server);
  }

  // ---------- Invites ----------

  async invitePreview(code) {
    const server = this.#server();
    const group = server.groups.find((g) => g.invite_code === code);
    if (!group) return null;
    const me = server.people.find((p) => p.user_id === this.session.user.id);
    const memberIds = server.group_members.filter((m) => m.group_id === group.id).map((m) => m.person_id);
    return {
      id: group.id,
      name: group.name,
      emoji: group.emoji,
      already_member: Boolean(me && memberIds.includes(me.id)),
      members: server.people
        .filter((p) => memberIds.includes(p.id))
        .map((p) => ({ id: p.id, name: p.name, claimed: p.user_id !== null })),
    };
  }

  async joinGroup(code, claimPersonId = null) {
    const server = this.#server();
    const group = server.groups.find((g) => g.invite_code === code);
    if (!group) throw new Error('This invite link is not valid');
    const me = server.people.find((p) => p.user_id === this.session.user.id);
    if (!me) throw new Error('Create your profile first');
    if (claimPersonId && claimPersonId !== me.id) {
      const target = server.people.find((p) => p.id === claimPersonId && p.user_id === null);
      if (!target) throw new Error("That person can't be claimed");
      this.#merge(server, claimPersonId, me.id);
    }
    if (!server.group_members.some((m) => m.group_id === group.id && m.person_id === me.id)) {
      server.group_members.push({ group_id: group.id, person_id: me.id });
    }
    this.#saveServer(server);
    return group.id;
  }

  /** Same idea as claim_email_invites() in schema.sql. */
  async claimInvites() {
    this.#checkOnline();
    const email = this.session?.user?.email?.toLowerCase();
    if (!email) return 0;
    const server = this.#server();
    let me = server.people.find((p) => p.user_id === this.session.user.id);
    const placeholders = server.people.filter((p) => p.user_id === null && p.email === email);
    if (!placeholders.length) return 0;
    for (const placeholder of placeholders) {
      if (!me) {
        placeholder.user_id = this.session.user.id;
        me = placeholder;
        continue;
      }
      this.#merge(server, placeholder.id, me.id);
    }
    this.#saveServer(server);
    return placeholders.length;
  }

  #merge(server, oldId, newId) {
    for (const e of server.expenses) {
      if (e.payer_id === oldId) e.payer_id = newId;
      if (oldId in e.shares) {
        e.shares[newId] = (e.shares[newId] ?? 0) + e.shares[oldId];
        delete e.shares[oldId];
      }
    }
    server.settlements = server.settlements.filter((s) => !([s.from_id, s.to_id].includes(oldId) && [s.from_id, s.to_id].includes(newId)));
    for (const s of server.settlements) {
      if (s.from_id === oldId) s.from_id = newId;
      if (s.to_id === oldId) s.to_id = newId;
    }
    for (const m of server.group_members.filter((x) => x.person_id === oldId)) {
      if (!server.group_members.some((x) => x.group_id === m.group_id && x.person_id === newId)) {
        server.group_members.push({ group_id: m.group_id, person_id: newId });
      }
    }
    server.group_members = server.group_members.filter((m) => m.person_id !== oldId);
    server.people = server.people.filter((p) => p.id !== oldId);
    server.aliases ??= {};
    for (const [from, to] of Object.entries(server.aliases)) if (to === oldId) server.aliases[from] = newId;
    server.aliases[oldId] = newId;
  }

  // ---------- Live updates ----------

  subscribe(onChange) {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }

  /** Test helper: change server data as if another user did it. */
  mutateServer(fn) {
    const server = this.#server();
    fn(server);
    this.#saveServer(server);
  }

  serverSnapshot() {
    return structuredClone(this.#server());
  }

  // ---------- Internals ----------

  #checkOnline() {
    if (this.offline) throw new TypeError('Failed to fetch');
  }

  #server() {
    return this.storage ? this.#read(SERVER_KEY, this.storage) ?? emptyServer() : this.memory.server;
  }

  #saveServer(server) {
    if (this.storage) this.#write(SERVER_KEY, server, this.storage);
    else this.memory.server = server;
    this.#notify();
  }

  #users() {
    return this.storage ? this.#read(USERS_KEY, this.storage) ?? {} : this.memory.users;
  }

  #saveUsers(users) {
    if (this.storage) this.#write(USERS_KEY, users, this.storage);
    else this.memory.users = users;
  }

  #notify() {
    for (const listener of this.listeners) listener('*');
  }

  #read(key, storage) {
    try {
      return JSON.parse(storage?.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  }

  #write(key, value, storage) {
    storage?.setItem(key, JSON.stringify(value));
  }
}

function emptyServer() {
  return Object.fromEntries(TABLES.map((t) => [t, []]));
}
