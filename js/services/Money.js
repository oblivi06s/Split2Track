/**
 * Money helpers. We store money as whole cents (integers) so math never
 * has rounding errors like 0.1 + 0.2 = 0.30000000000000004.
 */
export class Money {
  static CURRENCIES = ['PHP', 'USD', 'AUD', 'EUR', 'GBP', 'SGD', 'CAD'];

  static #formatters = new Map();

  /** 125050 -> "₱1,250.50" */
  static format(cents, currency = 'PHP') {
    if (!Money.#formatters.has(currency)) {
      Money.#formatters.set(
        currency,
        new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 }),
      );
    }
    return Money.#formatters.get(currency).format((cents || 0) / 100);
  }

  /** "₱" for PHP, "$" for USD, and so on. */
  static symbol(currency = 'PHP') {
    const part = new Intl.NumberFormat(undefined, { style: 'currency', currency })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part ? part.value : currency;
  }

  /** 125050 -> "1250.50" (for pre-filling inputs). */
  static toInput(cents) {
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(Math.round(cents));
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  }

  /**
   * Reads what the user typed and returns cents, or null if it is not valid.
   * Accepts "1,250.50", "1250.5", "12,50" (comma as decimal) and "99".
   */
  static parse(text) {
    let cleaned = String(text ?? '').trim().replace(/\s/g, '');
    if (!cleaned) return null;

    if (cleaned.includes('.')) {
      cleaned = cleaned.replace(/,/g, '');
    } else {
      const parts = cleaned.split(',');
      cleaned = parts.length === 2 && parts[1].length <= 2 ? parts.join('.') : parts.join('');
    }

    if (!/^\d*(\.\d*)?$/.test(cleaned) || cleaned === '.') return null;
    const [whole = '0', fraction = ''] = cleaned.split('.');
    // Work with digits instead of floats so "0.29" never becomes 28 cents.
    const cents = Number(whole || '0') * 100 + Number((fraction + '00').slice(0, 2));
    const roundUp = fraction.length > 2 && Number(fraction[2]) >= 5 ? 1 : 0;
    const result = cents + roundUp;
    return Number.isSafeInteger(result) ? result : null;
  }

  /** Reads a percentage like "33.3" or "33,3". Returns null if invalid. */
  static parsePercent(text) {
    const cleaned = String(text ?? '').trim().replace(',', '.');
    if (!/^\d*(\.\d*)?$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
    return Number(cleaned);
  }
}
