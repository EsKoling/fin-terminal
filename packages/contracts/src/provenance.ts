/**
 * Provenance is the spine of this application.
 *
 * Every free market-data source we use is rate-limited, unofficial, or both.
 * Rather than hide that, we make the origin and freshness of every value a
 * first-class part of its type. Nothing renders a number without provenance
 * in scope, which gives us three things for free: honest per-panel data chips,
 * the grounding ledger for the AI layer, and a visible demonstration of
 * graceful degradation.
 *
 * The invariant: we never present a stale number as if it were live.
 */

/** Identifiers for every upstream we can talk to. */
export const PROVIDER_IDS = [
  'binance',
  'coinbase',
  'kraken',
  'yahoo',
  'finnhub',
  'twelvedata',
  'fred',
  'sec',
  'stooq',
  'cache',
  'derived',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * How close to the exchange this value is.
 *
 * - `realtime`   — streamed from the venue, sub-second
 * - `delayed15`  — the standard free-tier 15-minute delay
 * - `eod`        — end-of-day close, will not change again
 * - `derived`    — computed by us from other sourced values (e.g. a quote
 *                  synthesized from the last 1m bar when no quote endpoint
 *                  is reachable)
 * - `synthetic`  — fixture or demo data, never from a live source
 */
export type LatencyClass = 'realtime' | 'delayed15' | 'eod' | 'derived' | 'synthetic';

/**
 * Whether the symbol we asked for is the symbol we got.
 *
 * `proxy` means the provider could not express our SymbolId exactly and we
 * accepted the nearest equivalent — Binance's BTC/USDT requested from Yahoo
 * comes back as BTC-USD, a different quote currency. The UI renders these
 * with a `≈` badge. Silently treating a proxy as exact is the kind of quiet
 * wrongness this whole type exists to prevent.
 */
export type Fidelity = 'exact' | 'proxy';

/** Why a value is worse than the happy path. Absent means it is not. */
export type DegradationReason = 'fallback-provider' | 'cache-only' | 'partial' | 'budget-exhausted';

export interface Provenance {
  readonly provider: ProviderId;
  /** Exchange or source timestamp, ms epoch. When the data is true as of. */
  readonly asOf: number;
  /** When we retrieved it, ms epoch. Differs from asOf by the delay plus transit. */
  readonly fetchedAt: number;
  readonly latencyClass: LatencyClass;
  readonly fidelity: Fidelity;
  /** asOf is older than this data class's freshness budget. */
  readonly stale: boolean;
  readonly degraded?: DegradationReason;
  readonly note?: string;
}

/** Every value that crosses the network is wrapped in this. No exceptions. */
export interface Sourced<T> {
  readonly data: T;
  readonly prov: Provenance;
}

/** Freshness budget per data class, in milliseconds. Drives `Provenance.stale`. */
export const FRESHNESS_BUDGET_MS = {
  quote: 60_000,
  bar_intraday: 300_000,
  bar_daily: 26 * 3_600_000,
  fundamentals: 7 * 24 * 3_600_000,
  news: 3_600_000,
  search: 30 * 24 * 3_600_000,
} as const;

export type FreshnessClass = keyof typeof FRESHNESS_BUDGET_MS;

export function isStale(asOf: number, cls: FreshnessClass, now = Date.now()): boolean {
  return now - asOf > FRESHNESS_BUDGET_MS[cls];
}

/** Build a Provenance, deriving `stale` rather than trusting a caller to set it. */
export function provenance(input: {
  provider: ProviderId;
  asOf: number;
  latencyClass: LatencyClass;
  freshness: FreshnessClass;
  fidelity?: Fidelity;
  degraded?: DegradationReason;
  note?: string;
  now?: number;
}): Provenance {
  const now = input.now ?? Date.now();
  return {
    provider: input.provider,
    asOf: input.asOf,
    fetchedAt: now,
    latencyClass: input.latencyClass,
    fidelity: input.fidelity ?? 'exact',
    stale: isStale(input.asOf, input.freshness, now),
    ...(input.degraded !== undefined ? { degraded: input.degraded } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
}

export function sourced<T>(data: T, prov: Provenance): Sourced<T> {
  return { data, prov };
}

/**
 * Map a Sourced value without losing its origin. Use this instead of
 * unwrapping, transforming, and re-wrapping with a fresh Provenance — that
 * pattern is how provenance gets quietly falsified.
 */
export function mapSourced<A, B>(s: Sourced<A>, f: (a: A) => B): Sourced<B> {
  return { data: f(s.data), prov: s.prov };
}

/**
 * Combine provenance from several sources into one. The result is as weak as
 * its weakest input: oldest asOf, worst latency class, proxy if any input was,
 * stale if any input was.
 */
export function weakestProvenance(parts: readonly Provenance[]): Provenance {
  if (parts.length === 0) throw new Error('weakestProvenance: no inputs');
  const rank: Record<LatencyClass, number> = {
    realtime: 0,
    delayed15: 1,
    eod: 2,
    derived: 3,
    synthetic: 4,
  };
  return parts.reduce((worst, p) => {
    const worseLatency = rank[p.latencyClass] > rank[worst.latencyClass];
    return {
      provider: worseLatency ? p.provider : worst.provider,
      asOf: Math.min(worst.asOf, p.asOf),
      fetchedAt: Math.max(worst.fetchedAt, p.fetchedAt),
      latencyClass: worseLatency ? p.latencyClass : worst.latencyClass,
      fidelity: worst.fidelity === 'proxy' || p.fidelity === 'proxy' ? 'proxy' : 'exact',
      stale: worst.stale || p.stale,
      ...((worst.degraded ?? p.degraded) !== undefined
        ? { degraded: worst.degraded ?? p.degraded! }
        : {}),
    };
  });
}
