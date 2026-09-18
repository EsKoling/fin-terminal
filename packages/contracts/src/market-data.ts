import { z } from 'zod';

/** Bar intervals the app understands. Providers advertise which they can serve. */
export const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1D': 86_400_000,
  // Calendar-based; these are nominal and only used for bucket sizing hints.
  '1W': 604_800_000,
  '1M': 2_592_000_000,
};

export const ASSET_CLASSES = [
  'equity',
  'etf',
  'crypto',
  'fx',
  'commodity',
  'index',
  'macro',
] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/** What a provider can be asked for. Drives the capability matrix. */
export const DATA_KINDS = ['quote', 'bars', 'search', 'fundamentals', 'news', 'stream'] as const;
export type DataKind = (typeof DATA_KINDS)[number];

export type MarketState = 'pre' | 'open' | 'post' | 'closed';

export interface Quote {
  /** Canonical SymbolId string, see @ft/symbology. */
  readonly sid: string;
  readonly last: number;
  readonly bid?: number;
  readonly ask?: number;
  readonly open?: number;
  readonly high?: number;
  readonly low?: number;
  readonly prevClose?: number;
  readonly change: number;
  readonly changePct: number;
  readonly volume?: number;
  readonly currency: string;
  readonly marketState?: MarketState;
}

export interface Bar {
  /**
   * Bucket OPEN time, ms epoch, UTC. Never the close time. That ambiguity is a
   * classic source of off-by-one-bar bugs when mixing providers.
   */
  readonly t: number;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
}

/**
 * Columnar bar storage. Typed arrays, not an array of objects.
 *
 * The quant engine runs indicators and backtests over these in a Web Worker,
 * where array-of-objects costs roughly an order of magnitude in throughput and
 * generates constant GC pressure in the hot loop. The buffers are also
 * transferable, so moving a series to the worker is zero-copy.
 */
export interface BarSeries {
  readonly sid: string;
  readonly tf: Timeframe;
  readonly n: number;
  readonly t: Float64Array;
  readonly o: Float64Array;
  readonly h: Float64Array;
  readonly l: Float64Array;
  readonly c: Float64Array;
  readonly v: Float64Array;
  /**
   * Whether prices are adjusted for splits and dividends. Mixing adjusted and
   * unadjusted series silently corrupts every return calculation downstream,
   * so this travels with the data rather than living in a convention.
   */
  readonly adjusted: boolean;
}

export interface Tick {
  readonly sid: string;
  readonly t: number;
  readonly price: number;
  readonly size?: number;
  readonly side?: 'buy' | 'sell';
  readonly venue: string;
}

export interface SymbolMatch {
  readonly sid: string;
  readonly name: string;
  readonly venue: string;
  readonly assetClass: AssetClass;
  /** 0..1 relevance. Comparable within one result set, not across providers. */
  readonly score: number;
}

/** Every field optional. Free providers cover wildly different subsets. */
export interface Fundamentals {
  readonly sid: string;
  readonly currency?: string;
  readonly marketCap?: number;
  readonly sharesOutstanding?: number;
  readonly peTtm?: number;
  readonly pbRatio?: number;
  readonly psRatio?: number;
  readonly epsTtm?: number;
  readonly revenueTtm?: number;
  readonly grossMargin?: number;
  readonly netMargin?: number;
  readonly revGrowthYoy?: number;
  readonly divYield?: number;
  readonly beta?: number;
  readonly week52High?: number;
  readonly week52Low?: number;
  readonly sector?: string;
  readonly industry?: string;
}

export interface NewsItem {
  readonly id: string;
  readonly ts: number;
  readonly headline: string;
  readonly summary?: string;
  readonly url: string;
  readonly source: string;
  /** Canonical SymbolId strings this item is about. */
  readonly sids: readonly string[];
  /** -1..1 when the provider supplies one, or after our own classification pass. */
  readonly sentiment?: number;
}

export interface BarRequest {
  readonly sid: string;
  readonly tf: Timeframe;
  readonly from?: number;
  readonly to?: number;
  readonly limit?: number;
  readonly adjusted?: boolean;
}

export interface NewsRequest {
  readonly sids?: readonly string[];
  readonly from?: number;
  readonly to?: number;
  readonly limit?: number;
}

// Runtime validation --------------------------------------------------------
// Used at the trust boundary: parsing a vendor response, and restoring a saved
// layout. Not used on internal calls, which the type system already covers.

export const TimeframeSchema = z.enum(TIMEFRAMES);
export const AssetClassSchema = z.enum(ASSET_CLASSES);
export const DataKindSchema = z.enum(DATA_KINDS);

export const BarSchema = z.object({
  t: z.number().int().nonnegative(),
  o: z.number().finite(),
  h: z.number().finite(),
  l: z.number().finite(),
  c: z.number().finite(),
  v: z.number().nonnegative(),
});

export const QuoteSchema = z.object({
  sid: z.string().min(1),
  last: z.number().finite(),
  bid: z.number().finite().optional(),
  ask: z.number().finite().optional(),
  open: z.number().finite().optional(),
  high: z.number().finite().optional(),
  low: z.number().finite().optional(),
  prevClose: z.number().finite().optional(),
  change: z.number().finite(),
  changePct: z.number().finite(),
  volume: z.number().nonnegative().optional(),
  currency: z.string().min(1),
  marketState: z.enum(['pre', 'open', 'post', 'closed']).optional(),
});

// Helpers -------------------------------------------------------------------

/** Allocate an empty columnar series. */
export function emptySeries(sid: string, tf: Timeframe, n: number, adjusted = true): BarSeries {
  return {
    sid,
    tf,
    n,
    t: new Float64Array(n),
    o: new Float64Array(n),
    h: new Float64Array(n),
    l: new Float64Array(n),
    c: new Float64Array(n),
    v: new Float64Array(n),
    adjusted,
  };
}

/** Convert row-oriented bars, which is how providers return them, to columns. */
export function toSeries(
  sid: string,
  tf: Timeframe,
  bars: readonly Bar[],
  adjusted = true,
): BarSeries {
  const s = emptySeries(sid, tf, bars.length, adjusted);
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    s.t[i] = b.t;
    s.o[i] = b.o;
    s.h[i] = b.h;
    s.l[i] = b.l;
    s.c[i] = b.c;
    s.v[i] = b.v;
  }
  return s;
}

export function barAt(s: BarSeries, i: number): Bar {
  if (i < 0 || i >= s.n) {
    throw new RangeError('barAt: index ' + i + ' out of range [0, ' + s.n + ')');
  }
  return { t: s.t[i]!, o: s.o[i]!, h: s.h[i]!, l: s.l[i]!, c: s.c[i]!, v: s.v[i]! };
}

/** The underlying buffers, for a zero-copy postMessage to the quant worker. */
export function seriesTransferables(s: BarSeries): ArrayBuffer[] {
  return [s.t, s.o, s.h, s.l, s.c, s.v].map((a) => a.buffer as ArrayBuffer);
}

/**
 * Floor a timestamp to the open of its bucket, UTC. Calendar timeframes (1W,
 * 1M) are approximate here and must be bucketed by the caller, which knows the
 * session calendar for the venue.
 */
export function bucketStart(t: number, tf: Timeframe): number {
  const ms = TIMEFRAME_MS[tf];
  return Math.floor(t / ms) * ms;
}
