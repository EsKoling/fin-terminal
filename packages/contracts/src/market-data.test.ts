import { describe, expect, it } from 'vitest';
import { barAt, bucketStart, seriesTransferables, toSeries, type Bar } from './market-data';

const BARS: Bar[] = [
  { t: 1_750_000_000_000, o: 100, h: 105, l: 99, c: 104, v: 1000 },
  { t: 1_750_000_060_000, o: 104, h: 108, l: 103, c: 107, v: 1500 },
  { t: 1_750_000_120_000, o: 107, h: 107, l: 101, c: 102, v: 2000 },
];

describe('BarSeries', () => {
  it('converts rows to columns without losing a value', () => {
    const s = toSeries('crypto:BINANCE:BTC/USDT', '1m', BARS);
    expect(s.n).toBe(3);
    expect(Array.from(s.c)).toEqual([104, 107, 102]);
    expect(Array.from(s.v)).toEqual([1000, 1500, 2000]);
    expect(s.adjusted).toBe(true);
  });

  it('round-trips a row through the columnar form', () => {
    const s = toSeries('equity:XNAS:AAPL', '1D', BARS);
    expect(barAt(s, 1)).toEqual(BARS[1]);
  });

  it('throws rather than returning garbage for an out-of-range index', () => {
    const s = toSeries('equity:XNAS:AAPL', '1D', BARS);
    expect(() => barAt(s, 3)).toThrow(RangeError);
    expect(() => barAt(s, -1)).toThrow(RangeError);
  });

  it('exposes six distinct buffers for a zero-copy worker transfer', () => {
    const s = toSeries('equity:XNAS:AAPL', '1D', BARS);
    const buffers = seriesTransferables(s);
    expect(buffers).toHaveLength(6);
    expect(new Set(buffers).size).toBe(6);
  });

  it('carries the adjusted flag, because mixing adjusted and raw corrupts returns', () => {
    expect(toSeries('equity:XNAS:AAPL', '1D', BARS, false).adjusted).toBe(false);
  });
});

describe('bucketStart', () => {
  it('floors to the bucket open, never the close', () => {
    const t = 1_750_000_137_000; // 2m17s past a minute boundary
    expect(bucketStart(t, '1m')).toBe(1_750_000_080_000);
    expect(bucketStart(t, '5m')).toBe(1_749_999_900_000);
  });

  it('is idempotent on a value already at a boundary', () => {
    const b = bucketStart(1_750_000_137_000, '1h');
    expect(bucketStart(b, '1h')).toBe(b);
  });
});
