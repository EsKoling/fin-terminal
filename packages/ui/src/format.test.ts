import { describe, expect, it } from 'vitest';
import {
  directionOf,
  formatAge,
  formatCompact,
  formatPct,
  formatPrice,
  priceDecimals,
} from './format';

describe('price precision', () => {
  it('keeps FX at pip precision', () => {
    // A pip is the fourth decimal. Two decimals would render EUR/USD as
    // "1.08" and throw away the entire working precision of the instrument.
    expect(priceDecimals(1.0842, 'USD', 'fx')).toBe(5);
    expect(formatPrice(1.0842, 'USD', 'fx')).toBe('1.08420');
    // JPY crosses put the pip at the second decimal instead.
    expect(priceDecimals(157.23, 'JPY', 'fx')).toBe(3);
    expect(formatPrice(157.234, 'JPY', 'fx')).toBe('157.234');
  });

  it('drops decimals for currencies that are not quoted with them', () => {
    // BBCA trades near 9,375 IDR. Two decimals would be two columns of noise.
    expect(priceDecimals(9375, 'IDR', 'equity')).toBe(0);
    expect(formatPrice(9375, 'IDR', 'equity')).toBe('9,375');
  });

  it('quotes equities in cents', () => {
    expect(priceDecimals(227.52, 'USD', 'equity')).toBe(2);
    expect(formatPrice(227.52, 'USD', 'equity')).toBe('227.52');
    // Penny stocks get more room.
    expect(priceDecimals(0.42, 'USD', 'equity')).toBe(4);
  });

  it('holds roughly six significant figures across crypto magnitudes', () => {
    expect(priceDecimals(97412.5, 'USD', 'crypto')).toBe(2);
    expect(priceDecimals(3.4821, 'USD', 'crypto')).toBe(4);
    // 0.0042 shown to 8dp is 0.00420000, which is six significant figures.
    // Six DECIMALS would only be four, so the ladder bottoms out at eight.
    expect(priceDecimals(0.0042, 'USD', 'crypto')).toBe(8);
    // Rounding SHIB to two decimals would erase the price entirely.
    expect(priceDecimals(0.000018, 'USD', 'crypto')).toBe(8);
    expect(formatPrice(0.000018, 'USD', 'crypto')).toBe('0.00001800');
  });

  it('falls back to cents when the asset class is unknown', () => {
    expect(priceDecimals(227.52, 'USD')).toBe(2);
  });
});

describe('formatting', () => {
  it('signs positive percentages so direction is never ambiguous', () => {
    expect(formatPct(2.11)).toBe('+2.11%');
    expect(formatPct(-1.32)).toBe('-1.32%');
    expect(formatPct(0)).toBe('0.00%');
  });

  it('compacts large figures', () => {
    expect(formatCompact(1.16e12)).toBe('1.16T');
    expect(formatCompact(3.44e12)).toBe('3.44T');
    expect(formatCompact(52_100_000)).toBe('52.10M');
    expect(formatCompact(999)).toBe('999');
  });

  it('renders provenance ages compactly', () => {
    expect(formatAge(2_000)).toBe('2s');
    expect(formatAge(41_000)).toBe('41s');
    expect(formatAge(900_000)).toBe('15m');
    expect(formatAge(7_200_000)).toBe('2h');
  });

  it('treats a negligible move as flat rather than as a direction', () => {
    expect(directionOf(0)).toBe('flat');
    expect(directionOf(1e-12)).toBe('flat');
    expect(directionOf(0.01)).toBe('up');
    expect(directionOf(-0.01)).toBe('down');
  });
});
