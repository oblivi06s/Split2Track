/**
 * Converts between the app's data (camelCase objects) and database rows
 * (snake_case), and works out what changed between two versions.
 * Pure functions only, so it is easy to test.
 */

/** Order to insert/update in (parents before children). Deletes go in reverse. */
export const TABLES = ['people', 'groups', 'group_members', 'expenses', 'settlements'];

const iso = (value) => (value ? new Date(value).toISOString() : new Date().toISOString());

export class RemoteMapper {
  /** App data -> rows per table. Only fields the app is allowed to change. */
  static toRows(data, userId) {
    return {
      people: (data.people ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        created_at: p.createdAt,
        ...(p.isMe ? { user_id: userId } : { email: p.email ?? null }),
      })),
      groups: (data.groups ?? []).map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, created_at: g.createdAt })),
      group_members: (data.groups ?? []).flatMap((g) => g.memberIds.map((personId) => ({ group_id: g.id, person_id: personId }))),
      expenses: (data.expenses ?? []).map((e) => ({
        id: e.id,
        group_id: e.groupId ?? null,
        title: e.title,
        amount_cents: e.amountCents,
        category_id: e.categoryId,
        split_method: e.splitMethod,
        date: e.date,
        note: e.note ?? '',
        payer_id: e.payerId,
        shares: e.shares,
        created_at: e.createdAt,
      })),
      settlements: (data.settlements ?? []).map((s) => ({
        id: s.id,
        group_id: s.groupId ?? null,
        from_id: s.fromId,
        to_id: s.toId,
        amount_cents: s.amountCents,
        date: s.date,
        note: s.note ?? '',
        created_at: s.createdAt,
      })),
    };
  }

  /** Rows from the server -> app data. */
  static fromRows(rows, userId) {
    const membersByGroup = new Map();
    for (const m of rows.group_members ?? []) {
      if (!membersByGroup.has(m.group_id)) membersByGroup.set(m.group_id, []);
      membersByGroup.get(m.group_id).push(m.person_id);
    }
    const peopleIds = new Set((rows.people ?? []).map((p) => p.id));

    return {
      people: (rows.people ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        isMe: p.user_id === userId,
        hasAccount: p.user_id !== null && p.user_id !== undefined,
        email: p.email ?? null,
        createdAt: iso(p.created_at),
      })),
      groups: (rows.groups ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        emoji: g.emoji,
        // Skip members we can't see (should not happen, but stay safe).
        memberIds: (membersByGroup.get(g.id) ?? []).filter((id) => peopleIds.has(id)),
        inviteCode: g.invite_code ?? null,
        isOwner: g.owner_id === userId,
        createdAt: iso(g.created_at),
      })),
      expenses: (rows.expenses ?? []).map((e) => ({
        id: e.id,
        groupId: e.group_id,
        title: e.title,
        amountCents: Number(e.amount_cents),
        categoryId: e.category_id,
        splitMethod: e.split_method,
        date: String(e.date).slice(0, 10),
        note: e.note ?? '',
        payerId: e.payer_id,
        shares: Object.fromEntries(Object.entries(e.shares ?? {}).map(([id, cents]) => [id, Number(cents)])),
        createdAt: iso(e.created_at),
      })),
      settlements: (rows.settlements ?? []).map((s) => ({
        id: s.id,
        groupId: s.group_id,
        fromId: s.from_id,
        toId: s.to_id,
        amountCents: Number(s.amount_cents),
        date: String(s.date).slice(0, 10),
        note: s.note ?? '',
        createdAt: iso(s.created_at),
      })),
    };
  }

  static key(table, row) {
    return table === 'group_members' ? `${row.group_id}:${row.person_id}` : row.id;
  }

  /**
   * What must be sent to turn `before` into `after` (both in app format).
   * @returns {{upserts: Object<string, object[]>, deletes: Object<string, object[]>, empty: boolean}}
   */
  static diff(before, after, userId) {
    const prev = RemoteMapper.toRows(before ?? {}, userId);
    const next = RemoteMapper.toRows(after ?? {}, userId);
    const upserts = {};
    const deletes = {};
    let empty = true;

    for (const table of TABLES) {
      const oldRows = new Map(prev[table].map((row) => [RemoteMapper.key(table, row), JSON.stringify(row)]));
      const newKeys = new Set();
      upserts[table] = [];
      deletes[table] = [];
      for (const row of next[table]) {
        const key = RemoteMapper.key(table, row);
        newKeys.add(key);
        if (oldRows.get(key) !== JSON.stringify(row)) upserts[table].push(row);
      }
      for (const row of prev[table]) {
        if (!newKeys.has(RemoteMapper.key(table, row))) deletes[table].push(row);
      }
      if (upserts[table].length || deletes[table].length) empty = false;
    }
    return { upserts, deletes, empty };
  }
}
