import { Money } from './models';

/**
 * Decimal-safe money helpers. Amounts travel as decimal strings ("2548.00");
 * arithmetic happens on integer cents (BigInt) so we never accumulate float error.
 */

const MONEY_RE = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

export function toCents(value: Money | null | undefined): bigint {
  if (value === null || value === undefined || value === '') return 0n;
  const m = MONEY_RE.exec(String(value).trim());
  if (!m) throw new Error(`Invalid money value: ${value}`);
  const [, sign, int, frac = ''] = m;
  const cents = BigInt(int) * 100n + BigInt((frac + '00').slice(0, 2));
  return sign ? -cents : cents;
}

export function fromCents(cents: bigint): Money {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const int = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${int}.${frac}`;
}

export function addMoney(...values: (Money | null | undefined)[]): Money {
  return fromCents(values.reduce((acc, v) => acc + toCents(v), 0n));
}

export function subMoney(a: Money, b: Money): Money {
  return fromCents(toCents(a) - toCents(b));
}

export function compareMoney(a: Money, b: Money): number {
  const d = toCents(a) - toCents(b);
  return d === 0n ? 0 : d > 0n ? 1 : -1;
}

/** Multiplies money by a decimal factor, rounding half-up to the cent. */
export function scaleMoney(value: Money, factor: number): Money {
  const scaled = Math.round(Number(toCents(value)) * factor);
  return fromCents(BigInt(scaled));
}

export function isValidMoney(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && MONEY_RE.test(String(value).trim());
}

/** Converts a number coming from an input widget into a 2-place decimal string. */
export function numberToMoney(n: number): Money {
  return fromCents(BigInt(Math.round(n * 100)));
}

/** Only for widgets that require a JS number (inputs, charts). Never sum these. */
export function moneyToNumber(value: Money | null | undefined): number {
  return Number(toCents(value)) / 100;
}

/** Ratio of two money values (0..n), for progress bars. */
export function moneyRatio(part: Money, whole: Money): number {
  const w = toCents(whole);
  if (w === 0n) return 0;
  return Number((toCents(part) * 10000n) / w) / 10000;
}
