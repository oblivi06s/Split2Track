import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Money } from '../js/services/Money.js';
import { SplitStrategy, EqualSplit, ExactSplit, PercentSplit } from '../js/services/SplitStrategy.js';
import { BalanceService } from '../js/services/BalanceService.js';
import { AppStore } from '../js/storage/AppStore.js';
import { MemoryStorageAdapter } from '../js/storage/StorageAdapter.js';
import { SampleData } from '../js/services/SampleData.js';
import { Expense, Settlement, Category } from '../js/models/index.js';

const sum = (shares) => Object.values(shares).reduce((a, b) => a + b, 0);

test('Money.parse reads common inputs', () => {
  assert.equal(Money.parse('99'), 9900);
  assert.equal(Money.parse('1,250.50'), 125050);
  assert.equal(Money.parse('12,5'), 1250);
  assert.equal(Money.parse('0.29'), 29);
  assert.equal(Money.parse('1.999'), 200);
  assert.equal(Money.parse('.5'), 50);
  assert.equal(Money.parse(''), null);
  assert.equal(Money.parse('abc'), null);
  assert.equal(Money.parse('-5'), null);
  assert.equal(Money.parse('1.2.3'), null);
});

test('Money.toInput round-trips with parse', () => {
  for (const cents of [0, 5, 99, 100, 125050]) {
    assert.equal(Money.parse(Money.toInput(cents)), cents);
  }
});

test('strategies are polymorphic and registered', () => {
  assert.ok(SplitStrategy.for('equal') instanceof EqualSplit);
  assert.ok(SplitStrategy.for('exact') instanceof ExactSplit);
  assert.ok(SplitStrategy.for('percent') instanceof PercentSplit);
  assert.deepEqual(SplitStrategy.all().map((s) => s.id), ['equal', 'exact', 'percent']);
  assert.throws(() => SplitStrategy.for('nope'));
});

test('equal split hands leftover cents to the first people', () => {
  const result = SplitStrategy.for('equal').split(1000, { participantIds: ['a', 'b', 'c'] });
  assert.ok(result.ok);
  assert.deepEqual(result.shares, { a: 334, b: 333, c: 333 });
  assert.equal(sum(result.shares), 1000);
});

test('equal split needs people and a positive amount', () => {
  assert.equal(SplitStrategy.for('equal').split(1000, { participantIds: [] }).ok, false);
  assert.equal(SplitStrategy.for('equal').split(0, { participantIds: ['a'] }).ok, false);
});

test('exact split must match the total', () => {
  const strategy = SplitStrategy.for('exact');
  const ok = strategy.split(1000, { participantIds: ['a', 'b'], values: { a: '6', b: '4' } });
  assert.deepEqual(ok.shares, { a: 600, b: 400 });

  const under = strategy.split(1000, { participantIds: ['a', 'b'], values: { a: '6' } });
  assert.equal(under.ok, false);
  assert.match(under.error, /left to assign/);

  const over = strategy.split(1000, { participantIds: ['a', 'b'], values: { a: '6', b: '5' } });
  assert.match(over.error, /over the total/);
});

test('percent split always adds up to the total', () => {
  const strategy = SplitStrategy.for('percent');
  const result = strategy.split(1000, {
    participantIds: ['a', 'b', 'c'],
    values: { a: '33.33', b: '33.33', c: '33.34' },
  });
  assert.ok(result.ok);
  assert.equal(sum(result.shares), 1000);

  const bad = strategy.split(1000, { participantIds: ['a', 'b'], values: { a: '50', b: '40' } });
  assert.match(bad.error, /10% left/);
});

test('net balances and simplification settle everyone', () => {
  const expenses = [
    new Expense({ title: 'Hotel', amountCents: 3000, payerId: 'a', shares: { a: 1000, b: 1000, c: 1000 } }),
    new Expense({ title: 'Food', amountCents: 600, payerId: 'b', shares: { a: 200, b: 200, c: 200 } }),
  ];
  const net = BalanceService.netBalances(expenses);
  assert.equal(net.get('a'), 1800);
  assert.equal(net.get('b'), -600);
  assert.equal(net.get('c'), -1200);
  assert.equal([...net.values()].reduce((x, y) => x + y, 0), 0);

  const transfers = BalanceService.simplify(net);
  assert.equal(transfers.length, 2);
  // Applying the transfers as payments should zero everything.
  const payments = transfers.map((t) => new Settlement({ fromId: t.fromId, toId: t.toId, amountCents: t.amountCents }));
  const after = BalanceService.netBalances(expenses, payments);
  for (const value of after.values()) assert.equal(value, 0);
});

test('pairwise balance between two people', () => {
  const expenses = [
    new Expense({ title: 'Lunch', amountCents: 1000, payerId: 'me', shares: { me: 500, ana: 500 } }),
    new Expense({ title: 'Taxi', amountCents: 300, payerId: 'ana', shares: { me: 150, ana: 150 } }),
  ];
  assert.equal(BalanceService.pairwise('me', 'ana', expenses), 350);
  const paid = [new Settlement({ fromId: 'ana', toId: 'me', amountCents: 350 })];
  assert.equal(BalanceService.pairwise('me', 'ana', expenses, paid), 0);
});

test('category totals, overall and per person', () => {
  const expenses = [
    new Expense({ title: 'A', amountCents: 1000, categoryId: 'food', payerId: 'x', shares: { x: 500, y: 500 } }),
    new Expense({ title: 'B', amountCents: 3000, categoryId: 'gift', payerId: 'x', shares: { x: 3000 } }),
  ];
  const all = BalanceService.categoryTotals(expenses);
  assert.deepEqual(all.map((t) => [t.category, t.cents]), [[Category.GIFT, 3000], [Category.FOOD, 1000]]);
  const mine = BalanceService.categoryTotals(expenses, 'y');
  assert.deepEqual(mine.map((t) => [t.category.id, t.cents]), [['food', 500]]);
});

test('AppStore saves, reloads, and notifies listeners', () => {
  const adapter = new MemoryStorageAdapter();
  const store = new AppStore(adapter);
  let calls = 0;
  store.subscribe(() => calls++);

  const me = store.createMe('John');
  const ana = store.addFriend('Ana');
  const group = store.createGroup({ name: 'Trip', emoji: '✈️', memberIds: [ana.id] });
  store.saveExpense({
    title: 'Bus', amountCents: 1000, payerId: me.id, groupId: group.id, shares: { [me.id]: 500, [ana.id]: 500 },
  });
  assert.equal(calls, 4);

  const reloaded = new AppStore(adapter);
  assert.equal(reloaded.me.name, 'John');
  assert.deepEqual(reloaded.membersOf(group.id).map((p) => p.name), ['John', 'Ana']);
  assert.equal(reloaded.expensesFor({ groupId: group.id }).length, 1);
  assert.ok(reloaded.getExpense(reloaded.expensesFor()[0].id) instanceof Expense);
});

test('AppStore protects data rules', () => {
  const store = new AppStore(new MemoryStorageAdapter());
  assert.throws(() => store.createGroup({ name: 'X' }), /profile/);
  const me = store.createMe('John');
  const ana = store.addFriend('Ana');
  assert.throws(() => store.addFriend('   '), /empty/);
  assert.throws(() => store.saveExpense({ title: 'Bad', amountCents: 1000, payerId: me.id, shares: { [me.id]: 900 } }));
  assert.throws(() => store.recordSettlement({ fromId: me.id, toId: me.id, amountCents: 100 }));

  const group = store.createGroup({ name: 'Trip', memberIds: [ana.id] });
  assert.throws(() => store.removeFriend(ana.id), /still has/);
  store.saveExpense({ title: 'Bus', amountCents: 100, payerId: ana.id, groupId: group.id, shares: { [me.id]: 100 } });
  // Ana has expenses, so removing her from the group is ignored.
  store.updateGroup(group.id, { memberIds: [] });
  assert.ok(store.getGroup(group.id).hasMember(ana.id));

  store.deleteGroup(group.id);
  assert.equal(store.expensesFor().length, 0);
  store.removeFriend(ana.id);
  assert.equal(store.friends().length, 0);
});

test('sample data, export, import, and erase', () => {
  const store = new AppStore(new MemoryStorageAdapter());
  store.createMe('John');
  SampleData.load(store);
  assert.equal(store.friends().length, 3);
  assert.equal(store.allGroups().length, 2);
  assert.equal(store.expensesFor().length, 8);

  const backup = JSON.parse(JSON.stringify(store.toJSON()));
  store.eraseAll();
  assert.equal(store.expensesFor().length, 0);
  assert.equal(store.me.name, 'John');

  store.importJSON(backup);
  assert.equal(store.expensesFor().length, 8);
  assert.throws(() => store.importJSON({ hello: 'world' }), /not a Split2Track backup/);

  // Every group's balances add up to zero.
  for (const group of store.allGroups()) {
    const net = BalanceService.netBalances(
      store.expensesFor({ groupId: group.id }),
      store.settlementsFor({ groupId: group.id }),
    );
    assert.equal([...net.values()].reduce((a, b) => a + b, 0), 0);
  }
});

import { SplitAutofill } from '../js/services/SplitAutofill.js';

test('exact split: typing one amount fills in the rest (₱400, John 260 → Ana 140)', () => {
  const filled = SplitAutofill.exact({ ids: ['john', 'ana'], values: { john: '260' }, manual: new Set(['john']), totalCents: 40000 });
  assert.deepEqual(filled, { ana: '140.00' });
});

test('exact split: the rest is shared equally among people not typed', () => {
  const filled = SplitAutofill.exact({
    ids: ['john', 'ana', 'ben', 'carla'],
    values: { john: '100' },
    manual: new Set(['john']),
    totalCents: 1000_00,
  });
  assert.deepEqual(filled, { ana: '300.00', ben: '300.00', carla: '300.00' });
  const odd = SplitAutofill.exact({ ids: ['a', 'b', 'c'], values: { a: '0' }, manual: new Set(['a']), totalCents: 100 });
  assert.deepEqual(odd, { b: '0.50', c: '0.50' });
  const cents = SplitAutofill.exact({ ids: ['a', 'b', 'c', 'd'], values: { a: '0.01' }, manual: new Set(['a']), totalCents: 100 });
  assert.deepEqual(cents, { b: '0.33', c: '0.33', d: '0.33' });
});

test('exact split: over the total gives 0, and nothing changes while input is invalid or total missing', () => {
  assert.deepEqual(SplitAutofill.exact({ ids: ['a', 'b'], values: { a: '500' }, manual: new Set(['a']), totalCents: 40000 }), { b: '0.00' });
  assert.deepEqual(SplitAutofill.exact({ ids: ['a', 'b'], values: { a: 'abc' }, manual: new Set(['a']), totalCents: 40000 }), {});
  assert.deepEqual(SplitAutofill.exact({ ids: ['a', 'b'], values: { a: '1' }, manual: new Set(['a']), totalCents: null }), {});
  assert.deepEqual(SplitAutofill.exact({ ids: ['a', 'b'], values: { a: '1', b: '2' }, manual: new Set(['a', 'b']), totalCents: 300 }), {});
});

test('percent split: typing one percentage fills in the rest', () => {
  assert.deepEqual(SplitAutofill.percent({ ids: ['a', 'b'], values: { a: '65' }, manual: new Set(['a']) }), { b: '35' });
  assert.deepEqual(SplitAutofill.percent({ ids: ['a', 'b', 'c'], values: { a: '50' }, manual: new Set(['a']) }), { b: '25', c: '25' });
  const thirds = SplitAutofill.percent({ ids: ['a', 'b', 'c', 'd'], values: { a: '0' }, manual: new Set(['a']) });
  assert.equal(Object.values(thirds).reduce((s, v) => s + Math.round(Number(v) * 100), 0), 10000);
  // The filled values always pass the real split check.
  const result = SplitStrategy.for('percent').split(1000, { participantIds: ['a', 'b', 'c', 'd'], values: { a: '0', ...thirds } });
  assert.ok(result.ok);
});
