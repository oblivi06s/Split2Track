import { Money } from './Money.js';

/**
 * Fills in the people you haven't typed an amount for.
 *
 * Example: ₱400 between John and Ana. Type 260 for John and Ana is
 * filled with 140. With more people, what's left is shared equally
 * among everyone you haven't typed for.
 *
 * Works in whole units so nothing is lost to rounding:
 * cents for exact amounts, hundredths of a percent for percentages.
 */
export class SplitAutofill {
  /**
   * @param {{ids: string[], values: Object<string,string>, manual: Set<string>,
   *          totalUnits: number, parse: (text: string) => number|null, format: (units: number) => string}} options
   *   ids: everyone in the split, in order.
   *   values: what is in each box now.
   *   manual: people whose box the user typed in (these are never changed).
   * @returns {Object<string,string>} new box values for the other people
   *   (empty if nothing can be worked out yet, like when the total is missing).
   */
  static fill({ ids, values, manual, totalUnits, parse, format }) {
    const autoIds = ids.filter((id) => !manual.has(id));
    if (!autoIds.length || !Number.isInteger(totalUnits) || totalUnits <= 0) return {};

    let typed = 0;
    for (const id of ids) {
      if (!manual.has(id)) continue;
      const text = String(values[id] ?? '').trim();
      if (text === '') continue;
      const units = parse(text);
      if (units === null) return {}; // wait until the typed value is valid
      typed += units;
    }

    // If the typed amounts are already too much, the others get 0
    // and the form shows how much it is over.
    const remaining = Math.max(0, totalUnits - typed);
    const base = Math.floor(remaining / autoIds.length);
    let extra = remaining - base * autoIds.length;
    const result = {};
    for (const id of autoIds) {
      result[id] = format(base + (extra > 0 ? 1 : 0));
      if (extra > 0) extra -= 1;
    }
    return result;
  }

  /** Exact amounts: total in cents. */
  static exact({ ids, values, manual, totalCents }) {
    return SplitAutofill.fill({
      ids,
      values,
      manual,
      totalUnits: totalCents,
      parse: (text) => Money.parse(text),
      format: (cents) => Money.toInput(cents),
    });
  }

  /** Percentages: always out of 100%. */
  static percent({ ids, values, manual }) {
    return SplitAutofill.fill({
      ids,
      values,
      manual,
      totalUnits: 10000,
      parse: (text) => {
        const pct = Money.parsePercent(text);
        return pct === null ? null : Math.round(pct * 100);
      },
      format: (hundredths) => String(hundredths / 100),
    });
  }
}
