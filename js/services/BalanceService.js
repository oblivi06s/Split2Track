import { Category } from '../models/Category.js';

/** A suggested payment: `fromId` should pay `toId`. */
export class Transfer {
  constructor(fromId, toId, amountCents) {
    this.fromId = fromId;
    this.toId = toId;
    this.amountCents = amountCents;
  }
}

/**
 * All the "who owes who" math. Works on plain lists of expenses and
 * settlements, so it is easy to test without a browser.
 */
export class BalanceService {
  /**
   * Net balance per person.
   * Positive = they should get money back. Negative = they owe money.
   * @returns {Map<string, number>}
   */
  static netBalances(expenses, settlements = []) {
    const net = new Map();
    const add = (id, cents) => net.set(id, (net.get(id) ?? 0) + cents);

    for (const expense of expenses) {
      let total = 0;
      for (const [id, cents] of Object.entries(expense.shares)) {
        add(id, -cents);
        total += cents;
      }
      add(expense.payerId, total);
    }
    for (const payment of settlements) {
      add(payment.fromId, payment.amountCents);
      add(payment.toId, -payment.amountCents);
    }
    return net;
  }

  /**
   * Turns net balances into the fewest payments that settle everyone.
   * Greedy: the biggest debtor pays the biggest creditor, repeat.
   * @returns {Transfer[]}
   */
  static simplify(net) {
    const byAmount = (a, b) => b.cents - a.cents || a.id.localeCompare(b.id);
    const creditors = [];
    const debtors = [];
    for (const [id, cents] of net) {
      if (cents > 0) creditors.push({ id, cents });
      if (cents < 0) debtors.push({ id, cents: -cents });
    }

    const transfers = [];
    while (creditors.length && debtors.length) {
      creditors.sort(byAmount);
      debtors.sort(byAmount);
      const creditor = creditors[0];
      const debtor = debtors[0];
      const amount = Math.min(creditor.cents, debtor.cents);
      transfers.push(new Transfer(debtor.id, creditor.id, amount));
      creditor.cents -= amount;
      debtor.cents -= amount;
      if (creditor.cents === 0) creditors.shift();
      if (debtor.cents === 0) debtors.shift();
    }
    return transfers;
  }

  /**
   * Direct balance between two people across everything.
   * Positive = `otherId` owes `meId`. Negative = `meId` owes `otherId`.
   */
  static pairwise(meId, otherId, expenses, settlements = []) {
    let balance = 0;
    for (const expense of expenses) {
      if (expense.payerId === meId) balance += expense.shares[otherId] ?? 0;
      else if (expense.payerId === otherId) balance -= expense.shares[meId] ?? 0;
    }
    for (const payment of settlements) {
      if (payment.fromId === otherId && payment.toId === meId) balance -= payment.amountCents;
      else if (payment.fromId === meId && payment.toId === otherId) balance += payment.amountCents;
    }
    return balance;
  }

  /**
   * Spending per category, biggest first.
   * If `personId` is given, counts only that person's share.
   * @returns {{category: Category, cents: number}[]}
   */
  static categoryTotals(expenses, personId = null) {
    const sums = new Map();
    for (const expense of expenses) {
      const cents = personId ? expense.shares[personId] ?? 0 : expense.amountCents;
      if (cents > 0) sums.set(expense.categoryId, (sums.get(expense.categoryId) ?? 0) + cents);
    }
    return [...sums]
      .map(([id, cents]) => ({ category: Category.byId(id), cents }))
      .sort((a, b) => b.cents - a.cents);
  }
}
