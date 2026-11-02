import { TABLES } from './RemoteMapper.js';

const PAGE_SIZE = 1000;

/**
 * Talks to Supabase. Everything that touches the network lives here, so
 * tests can swap in a fake with the same methods.
 */
export class CloudService {
  /** @param {import('@supabase/supabase-js').SupabaseClient} client */
  constructor(client) {
    this.client = client;
  }

  // ---------- Accounts ----------

  async getSession() {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  onAuthChange(callback) {
    const { data } = this.client.auth.onAuthStateChange((event, session) => callback(event, session));
    return () => data.subscription.unsubscribe();
  }

  /** @returns {Promise<{session: object|null}>} session is null when email confirmation is required */
  async signUp(email, password, name) {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: CloudService.appUrl() },
    });
    if (error) throw error;
    return { session: data.session };
  }

  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { session: data.session };
  }

  async resetPassword(email) {
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo: CloudService.appUrl() });
    if (error) throw error;
  }

  async signOut() {
    await this.client.auth.signOut();
  }

  // ---------- Data ----------

  /** Everything this user is allowed to see. */
  async fetchAll() {
    const entries = await Promise.all(TABLES.map(async (table) => [table, await this.#fetchTable(table)]));
    return Object.fromEntries(entries);
  }

  async #fetchTable(table) {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const query = this.client.from(table).select('*');
      const ordered = table === 'group_members' ? query.order('group_id').order('person_id') : query.order('id');
      const { data, error } = await ordered.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE_SIZE) return rows;
    }
  }

  /** Sends a diff from RemoteMapper.diff(): upserts parents first, deletes children first. */
  async apply(diff) {
    for (const table of TABLES) {
      const rows = diff.upserts[table] ?? [];
      // Rows with different columns must be sent separately, or missing columns become null.
      for (const batch of CloudService.#byShape(rows)) {
        const options = table === 'group_members' ? { onConflict: 'group_id,person_id', ignoreDuplicates: true } : {};
        const { error } = await this.client.from(table).upsert(batch, options);
        if (error) throw error;
      }
    }
    for (const table of [...TABLES].reverse()) {
      const rows = diff.deletes[table] ?? [];
      if (!rows.length) continue;
      if (table === 'group_members') {
        for (const row of rows) {
          const { error } = await this.client.from(table).delete().match({ group_id: row.group_id, person_id: row.person_id });
          if (error) throw error;
        }
      } else {
        const { error } = await this.client.from(table).delete().in('id', rows.map((row) => row.id));
        if (error) throw error;
      }
    }
  }

  // ---------- Invites ----------

  async invitePreview(code) {
    const { data, error } = await this.client.rpc('group_invite_preview', { code });
    if (error) throw error;
    return data;
  }

  async joinGroup(code, claimPersonId = null) {
    const { data, error } = await this.client.rpc('join_group', { code, claim_person_id: claimPersonId });
    if (error) throw error;
    return data;
  }

  // ---------- Live updates ----------

  /** Calls `onChange` whenever any shared data changes on the server. */
  subscribe(onChange) {
    const channel = this.client.channel('split2track-changes');
    for (const table of TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange(table));
    }
    channel.subscribe();
    return () => this.client.removeChannel(channel);
  }

  static appUrl() {
    return `${location.origin}${location.pathname}`;
  }

  static #byShape(rows) {
    const groups = new Map();
    for (const row of rows) {
      const shape = Object.keys(row).sort().join(',');
      if (!groups.has(shape)) groups.set(shape, []);
      groups.get(shape).push(row);
    }
    return [...groups.values()];
  }
}

/** True when an error means "no internet" rather than "the server said no". */
export function isNetworkError(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = String(error?.message ?? error ?? '');
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message);
}
