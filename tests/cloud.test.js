import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RemoteMapper } from '../js/cloud/RemoteMapper.js';
import { CloudSync } from '../js/cloud/CloudSync.js';
import { CloudStorageAdapter } from '../js/cloud/CloudStorageAdapter.js';
import { isNetworkError } from '../js/cloud/CloudService.js';
import { AppStore } from '../js/storage/AppStore.js';
import { MemoryStorageAdapter } from '../js/storage/StorageAdapter.js';
import { SampleData } from '../js/services/SampleData.js';
import { FakeCloudService } from './fake/FakeCloudService.js';

const UID = '11111111-1111-1111-1111-111111111111';

/** Minimal localStorage stand-in. */
class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

function setup({ service = new FakeCloudService({ userId: UID }), storage = new MemoryStorage() } = {}) {
  const adapter = new CloudStorageAdapter(UID, storage);
  const store = new AppStore(adapter);
  const errors = [];
  const sync = new CloudSync({ service, store, adapter, userId: UID, debounceMs: 0, onError: (m) => errors.push(m) });
  return { service, store, adapter, sync, errors, storage };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test('mapper round-trips app data through database rows', () => {
  const store = new AppStore(new MemoryStorageAdapter());
  store.createMe('John');
  SampleData.load(store);
  const data = store.toJSON();

  const rows = RemoteMapper.toRows(data, UID);
  assert.equal(rows.people.filter((p) => p.user_id === UID).length, 1, 'only "me" carries the account id');
  assert.ok(rows.people.filter((p) => !p.isMe).every((p) => !('isMe' in p)));
  assert.equal(rows.group_members.length, 6);

  // Pretend the server added its own columns.
  const serverRows = structuredClone(rows);
  for (const g of serverRows.groups) Object.assign(g, { invite_code: 'abc', owner_id: UID });
  for (const p of serverRows.people) p.user_id ??= null;
  const back = RemoteMapper.fromRows(serverRows, UID);

  assert.equal(back.people.find((p) => p.isMe).name, 'John');
  assert.equal(back.expenses.length, data.expenses.length);
  assert.ok(back.groups.every((g) => g.isOwner && g.inviteCode === 'abc'));
  assert.ok(RemoteMapper.diff(data, back, UID).empty, 'no changes after a round trip');
});

test('diff sends only what changed, with deletes', () => {
  const store = new AppStore(new MemoryStorageAdapter());
  store.createMe('John');
  SampleData.load(store);
  const before = store.toJSON();

  const [expense] = store.expensesFor();
  store.deleteExpense(expense.id);
  const ana = store.friends().find((f) => f.name === 'Ana');
  store.renamePerson(ana.id, 'Ana Cruz');
  const diff = RemoteMapper.diff(before, store.toJSON(), UID);

  assert.deepEqual(diff.deletes.expenses.map((e) => e.id), [expense.id]);
  assert.deepEqual(diff.upserts.people.map((p) => p.name), ['Ana Cruz']);
  assert.equal(diff.upserts.expenses.length, 0);
  assert.equal(diff.empty, false);
});

test('first sync uploads a new profile and group, then downloads server values', async () => {
  const { service, store, sync } = setup();
  await sync.start();
  assert.equal(sync.ready, true);
  assert.equal(store.me, null);

  const me = store.createMe('John');
  const ana = store.addFriend('Ana');
  const group = store.createGroup({ name: 'Trip', memberIds: [ana.id] });
  store.saveExpense({ title: 'Bus', amountCents: 1000, payerId: me.id, groupId: group.id, shares: { [me.id]: 500, [ana.id]: 500 } });
  await sync.push();
  await sync.refresh();

  const server = service.serverSnapshot();
  assert.equal(server.people.find((p) => p.id === me.id).user_id, UID);
  assert.equal(server.expenses.length, 1);
  assert.ok(store.getGroup(group.id).inviteCode, 'invite code came back from the server');
  assert.equal(sync.dirty, false);
  assert.equal(sync.status, 'synced');
  sync.stop();
});

test('changes from other people show up after a server notification', async () => {
  const { service, store, sync } = setup();
  await sync.start();
  const me = store.createMe('John');
  await sync.push();

  service.mutateServer((server) => {
    server.expenses.push({
      id: '99999999-9999-9999-9999-999999999999', group_id: null, title: 'From a friend', amount_cents: 100,
      category_id: 'food', split_method: 'equal', date: '2026-11-01', note: '', payer_id: me.id,
      shares: { [me.id]: 100 }, created_at: new Date().toISOString(),
    });
  });
  await settle();
  await sync.refresh();
  assert.equal(store.expensesFor()[0].title, 'From a friend');
  sync.stop();
});

test('offline changes are kept and uploaded when back online', async () => {
  const storage = new MemoryStorage();
  const service = new FakeCloudService({ userId: UID });
  const first = setup({ service, storage });
  await first.sync.start();
  first.store.createMe('John');
  await first.sync.push();

  service.offline = true;
  first.store.addFriend('Offline Friend');
  await first.sync.push();
  assert.equal(first.sync.status, 'offline');
  assert.equal(first.sync.dirty, true);
  first.sync.stop();

  // App is closed and opened again, still with the pending change.
  const second = setup({ service, storage });
  assert.ok(second.store.friends().some((f) => f.name === 'Offline Friend'), 'pending change survived a reload');
  service.offline = false;
  await second.sync.start();
  assert.ok(service.serverSnapshot().people.some((p) => p.name === 'Offline Friend'));
  assert.equal(second.sync.dirty, false);
  second.sync.stop();
});

test('a refused change shows an error and rolls back to the server version', async () => {
  const { service, store, sync, errors } = setup();
  await sync.start();
  store.createMe('John');
  await sync.push();

  service.failNextApply = new Error('new row violates row-level security policy');
  store.addFriend('Not allowed');
  await sync.push();
  await settle();
  assert.deepEqual(errors, ['You don’t have permission to change that.']);
  assert.equal(store.friends().length, 0, 'local change was rolled back');
  assert.equal(sync.dirty, false);
  sync.stop();
});

test('a download never wipes out changes that are not uploaded yet', async () => {
  const { service, store, sync } = setup();
  await sync.start();
  store.createMe('John');
  await sync.push();

  service.offline = true;
  store.addFriend('Pending');
  await sync.push();
  service.offline = false;
  // A refresh while dirty is skipped instead of overwriting.
  await sync.refresh();
  assert.ok(store.friends().some((f) => f.name === 'Pending'));
  sync.stop();
});

test('joining with an invite takes over the placeholder', async () => {
  const service = new FakeCloudService({ userId: UID });
  const john = setup({ service });
  await john.sync.start();
  const me = john.store.createMe('John');
  const placeholder = john.store.addFriend('Ana');
  const group = john.store.createGroup({ name: 'Trip', memberIds: [placeholder.id] });
  john.store.saveExpense({ title: 'Hotel', amountCents: 1000, payerId: me.id, groupId: group.id, shares: { [me.id]: 500, [placeholder.id]: 500 } });
  await john.sync.push();
  await john.sync.refresh();
  const code = john.store.getGroup(group.id).inviteCode;

  // Ana signs up on her phone (same fake server).
  const ANA = '22222222-2222-2222-2222-222222222222';
  service.session = { user: { id: ANA } };
  const anaAdapter = new CloudStorageAdapter(ANA, new MemoryStorage());
  const anaStore = new AppStore(anaAdapter);
  const anaSync = new CloudSync({ service, store: anaStore, adapter: anaAdapter, userId: ANA, debounceMs: 0 });
  await anaSync.start();
  const anaMe = anaStore.createMe('Ana');
  await anaSync.push();

  const preview = await service.invitePreview(code);
  assert.equal(preview.name, 'Trip');
  await service.joinGroup(code, placeholder.id);
  await anaSync.refresh();

  const expense = anaStore.expensesFor()[0];
  assert.equal(expense.shareOf(anaMe.id), 500, 'Ana now owns the placeholder’s share');
  assert.equal(anaStore.getPerson(placeholder.id), null, 'placeholder is gone');
  assert.equal(anaStore.getGroup(group.id).isOwner, false);
  john.sync.stop();
  anaSync.stop();
});

test('network errors are recognized', () => {
  assert.equal(isNetworkError(new TypeError('Failed to fetch')), true);
  assert.equal(isNetworkError(new Error('Load failed')), true);
  assert.equal(isNetworkError(new Error('permission denied for table people')), false);
});

test('two quick changes in a row are both uploaded (regression)', async () => {
  const { service, store, sync } = setup();
  await sync.start();
  // Onboarding saves the currency and then the profile right away.
  store.setCurrency('USD');
  store.createMe('John');
  store.addFriend('Ana');
  await sync.push();
  const names = service.serverSnapshot().people.map((p) => p.name).sort();
  assert.deepEqual(names, ['Ana', 'John']);
  assert.equal(sync.dirty, false);
  sync.stop();
});

test('if the server rejects the profile, it is gone after the rollback (app shows onboarding)', async () => {
  const { service, store, sync, errors } = setup();
  await sync.start();
  service.failNextApply = new Error('new row violates row-level security policy for table "people"');
  store.createMe('John');
  await sync.push();
  await settle();
  assert.equal(errors.length, 1);
  assert.equal(store.me, null, 'store matches the server again');
  // Trying again after the fix works.
  store.createMe('John');
  await sync.push();
  assert.equal(service.serverSnapshot().people.length, 1);
  sync.stop();
});

test('email invites: a friend added by email sees the group when they sign up', async () => {
  const service = new FakeCloudService({ userId: UID, email: 'john@example.com' });
  const john = setup({ service });
  await john.sync.start();
  const me = john.store.createMe('John');
  const ana = john.store.addFriend('Ana', '  Ana@Example.com ');
  assert.equal(ana.email, 'ana@example.com');
  assert.throws(() => john.store.addFriend('Ana again', 'ana@example.com'), /already added/);
  assert.throws(() => john.store.addFriend('Bad', 'not-an-email'), /doesn’t look right/);
  const group = john.store.createGroup({ name: 'Beach', memberIds: [ana.id] });
  john.store.saveExpense({ title: 'Boat', amountCents: 1000, payerId: me.id, groupId: group.id, shares: { [me.id]: 500, [ana.id]: 500 } });
  await john.sync.push();

  // Ana signs up with that email. She has no profile yet.
  const ANA = '22222222-2222-2222-2222-222222222222';
  service.session = { user: { id: ANA, email: 'ana@example.com' } };
  const anaAdapter = new CloudStorageAdapter(ANA, new MemoryStorage());
  const anaStore = new AppStore(anaAdapter);
  const anaSync = new CloudSync({ service, store: anaStore, adapter: anaAdapter, userId: ANA, debounceMs: 0 });
  await anaSync.start();

  assert.equal(anaStore.me?.id, ana.id, 'the placeholder became Ana’s profile (no setup screen needed)');
  assert.equal(anaStore.getGroup(group.id)?.name, 'Beach');
  assert.equal(anaStore.expensesFor()[0].shareOf(anaStore.me.id), 500);

  // John sees that Ana joined.
  service.session = { user: { id: UID, email: 'john@example.com' } };
  await john.sync.refresh();
  assert.equal(john.store.getPerson(ana.id).hasAccount, true);
  john.sync.stop();
  anaSync.stop();
});

test('email invites: an existing user gets merged, and the email round-trips', async () => {
  const store = new AppStore(new MemoryStorageAdapter());
  store.createMe('John');
  const ben = store.addFriend('Ben', 'ben@example.com');
  const rows = RemoteMapper.toRows(store.toJSON(), UID);
  assert.equal(rows.people.find((p) => p.id === ben.id).email, 'ben@example.com');
  assert.ok(!('email' in rows.people.find((p) => p.user_id === UID)), 'your own row never sends an email');
  store.setPersonEmail(ben.id, 'benjie@example.com');
  assert.equal(store.getPerson(ben.id).email, 'benjie@example.com');
  assert.throws(() => store.setPersonEmail(store.me.id, 'x@y.com'));
});
