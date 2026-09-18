/**
 * Number formatting for a dense trading surface.
 *
 * Precision is decided per instrument, from asset class, currency and
 * magnitude together. A single global default would be wrong for three of the
 * four asset classes this terminal carries.
 */
import type { AssetClass } from '@ft/contracts';

/** Currencies conventionally quoted without a fractional part. */
const ZERO_DECIMAL = new Set(['IDR', 'JPY', 'KRW', 'VND', 'CLP', 'ISK']);

/**
 * How many decimals a price should show.
 *
 * Magnitude alone is not enough, and getting this wrong is not cosmetic:
 *
 *   - EUR/USD trades at 1.0842. A pip IS the fourth decimal, so rendering it
 *     with the two decimals that suit an equity gives "1.08" and throws away
 *     the entire working precision of the instrument.
 *   - BBCA trades near 9,375 IDR, which is never quoted with a fractional
 *     part, so two decimals would be two columns of pure noise.
 *   - SHIB trades near 0.000018. Two decimals rounds it to zero.
 *
 * All three appear in the same watchlist, so the asset class has to be part
 * of the decision.
 */
export function priceDecimals(value: number, currency = 'USD', assetClass?: AssetClass): number {
  if (assetClass === 'fx') {
    // FX convention: 5 decimals for most majors, 3 for JPY crosses, where a
    // pip sits at the second decimal rather than the fourth.
    return currency === 'JPY' ? 3 : 5;
  }

  if (ZERO_DECIMAL.has(currency)) return 0;

  const a = Math.abs(value);
  if (a === 0) return 2;

  if (assetClass === 'crypto') {
    // Crypto spans nine orders of magnitude, so hold roughly six significant
    // figures rather than a fixed decimal count.
    if (a >= 1000) return 2;
    if (a >= 1) return 4;
    if (a >= 0.01) return 6;
    return 8;
  }

  // Equities, ETFs, commodities and indices: cents, with more room only for
  // sub-dollar instruments such as penny stocks.
  if (a >= 1) return 2;
  if (a >= 0.01) return 4;
  return 6;
}

export function formatPrice(
  value: number,
  currency = 'USD',
  assetClass?: AssetClass,
  locale = 'en-US',
): string {
  const d = priceDecimals(value, currency, assetClass);
  return value.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function formatPct(value: number, decimals = 2, withSign = true): string {
  const s = value.toFixed(decimals) + '%';
  return withSign && value > 0 ? '+' + s : s;
}

export function formatSigned(
  value: number,
  currency = 'USD',
  assetClass?: AssetClass,
  locale = 'en-US',
): string {
  const s = formatPrice(value, currency, assetClass, locale);
  return value > 0 ? '+' + s : s;
}

const COMPACT_UNITS = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
] as const;

/** 1_160_000_000_000 becomes 1.16T. Used for market cap and volume. */
export function formatCompact(value: number): string {
  const a = Math.abs(value);
  for (const [scale, suffix] of COMPACT_UNITS) {
    if (a >= scale) {
      const n = value / scale;
      return (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2)) + suffix;
    }
  }
  return value.toFixed(0);
}

/** Relative age, for provenance chips: 2s, 41s, 15m, 3h, 2d. */
export function formatAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + 's';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h';
  return Math.round(h / 24) + 'd';
}

export type Direction = 'up' | 'down' | 'flat';

export function directionOf(change: number, epsilon = 1e-9): Direction {
  if (change > epsilon) return 'up';
  if (change < -epsilon) return 'down';
  return 'flat';
}

/** Arrow glyph. Direction is never carried by colour alone. */
export const DIRECTION_GLYPH: Record<Direction, string> = {
  up: '▲',
  down: '▼',
  flat: '–',
};
