import { Money } from './Money.js';

/** Result of splitting a bill: either `shares` or an `error` message. */
export class SplitResult {
  constructor(shares, error = null) {
    this.shares = shares;
    this.error = error;
  }

  get ok() {
    return this.error === null;
  }

  static success(shares) {
    return new SplitResult(shares);
  }

  static failure(message) {
    return new SplitResult(null, message);
  }
}

/**
 * Strategy pattern: each way of splitting a bill is its own class with the
 * same `split()` method. The form does not care which one it is using.
 *
 * Every strategy makes sure the shares add up to the exact total.
 */
export class SplitStrategy {
  /** @returns {string} */
  get id() {
    throw new Error('Subclass must implement id');
  }

  /** @returns {string} */
  get label() {
    throw new Error('Subclass must implement label');
  }

  /**
   * @param {number} totalCents
   * @param {{participantIds: string[], values?: Object<string, string>}} input
   *   participantIds: people in the order they are shown.
   *   values: what the user typed for each person (exact amounts or percents).
   * @param {string} currency
   * @returns {SplitResult}
   */
  // eslint-disable-next-line no-unused-vars
  split(totalCents, input, currency = 'PHP') {
    throw new Error('Subclass must implement split()');
  }

  static #registry = new Map();

  static register(strategy) {
    SplitStrategy.#registry.set(strategy.id, strategy);
  }

  static for(id) {
    const strategy = SplitStrategy.#registry.get(id);
    if (!strategy) throw new Error(`Unknown split method: ${id}`);
    return strategy;
  }

  static all() {
    return [...SplitStrategy.#registry.values()];
  }

  /** Shared check used by all strategies. */
  static checkTotal(totalCents) {
    if (!Number.isInteger(totalCents) || totalCents <= 0) {
      return SplitResult.failure('Enter an amount greater than zero.');
    }
    return null;
  }
}

/** Everyone ticked pays the same. Extra cents go to the first people. */
export class EqualSplit extends SplitStrategy {
  get id() {
    return 'equal';
  }

  get label() {
    return 'Equally';
  }

  split(totalCents, { participantIds }) {
    const invalid = SplitStrategy.checkTotal(totalCents);
    if (invalid) return invalid;
    if (!participantIds?.length) return SplitResult.failure('Pick at least one person.');

    const base = Math.floor(totalCents / participantIds.length);
    let remainder = totalCents - base * participantIds.length;
    const shares = {};
    for (const id of participantIds) {
      shares[id] = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    }
    return SplitResult.success(shares);
  }
}

/** Each person pays an exact amount. Amounts must add up to the total. */
export class ExactSplit extends SplitStrategy {
  get id() {
    return 'exact';
  }

  get label() {
    return 'Exact';
  }

  split(totalCents, { participantIds, values = {} }, currency = 'PHP') {
    const invalid = SplitStrategy.checkTotal(totalCents);
    if (invalid) return invalid;

    const shares = {};
    let sum = 0;
    for (const id of participantIds) {
      const text = values[id] ?? '';
      if (String(text).trim() === '') continue;
      const cents = Money.parse(text);
      if (cents === null) return SplitResult.failure('One of the amounts is not a valid number.');
      if (cents > 0) {
        shares[id] = cents;
        sum += cents;
      }
    }

    const diff = totalCents - sum;
    if (diff > 0) return SplitResult.failure(`${Money.format(diff, currency)} left to assign.`);
    if (diff < 0) return SplitResult.failure(`${Money.format(-diff, currency)} over the total.`);
    return SplitResult.success(shares);
  }
}

/** Each person pays a percentage. Percentages must add up to 100. */
export class PercentSplit extends SplitStrategy {
  get id() {
    return 'percent';
  }

  get label() {
    return 'Percent';
  }

  split(totalCents, { participantIds, values = {} }) {
    const invalid = SplitStrategy.checkTotal(totalCents);
    if (invalid) return invalid;

    const percents = [];
    for (const id of participantIds) {
      const text = values[id] ?? '';
      if (String(text).trim() === '') continue;
      const pct = Money.parsePercent(text);
      if (pct === null) return SplitResult.failure('One of the percentages is not a valid number.');
      if (pct > 0) percents.push([id, pct]);
    }

    const sum = percents.reduce((acc, [, pct]) => acc + pct, 0);
    if (Math.abs(sum - 100) > 0.001) {
      const left = Math.round((100 - sum) * 100) / 100;
      return SplitResult.failure(left > 0 ? `${left}% left to assign.` : `${-left}% over 100%.`);
    }

    // Round down first, then hand out leftover cents to the biggest remainders.
    const shares = {};
    const fractions = [];
    let assigned = 0;
    for (const [id, pct] of percents) {
      const exact = (totalCents * pct) / 100;
      const floored = Math.floor(exact);
      shares[id] = floored;
      assigned += floored;
      fractions.push([id, exact - floored]);
    }
    let remainder = totalCents - assigned;
    fractions.sort((a, b) => b[1] - a[1]);
    for (const [id] of fractions) {
      if (remainder <= 0) break;
      shares[id] += 1;
      remainder -= 1;
    }
    return SplitResult.success(shares);
  }
}

SplitStrategy.register(new EqualSplit());
SplitStrategy.register(new ExactSplit());
SplitStrategy.register(new PercentSplit());
