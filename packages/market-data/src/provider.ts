import type {
  AssetClass,
  BarRequest,
  BarSeries,
  DataKind,
  Fundamentals,
  LatencyClass,
  NewsItem,
  NewsRequest,
  ProviderId,
  Quote,
  Sourced,
  SymbolMatch,
} from '@ft/contracts';
import type { SymbolId } from '@ft/symbology';

/**
 * What one provider can do for one (assetClass, dataKind) pair.
 *
 * Free sources are wildly uneven: Finnhub serves real-time US quotes but has
 * never heard of an IDX ticker, Yahoo covers everything at fifteen minutes'
 * delay and no guarantee it will answer at all, FRED serves macro series and
 * nothing else. Capability is therefore declared per cell, not per provider —
 * "is Yahoo good?" is not a question with an answer, but "is Yahoo the best
 * remaining source for an IDX quote right now?" is.
 */
export interface Capability {
  readonly latencyClass: LatencyClass;
  /** 0..1. Field coverage and correctness, not speed — speed is measured. */
  readonly quality: number;
  /**
   * Budget units one call consumes. Usually 1, but Twelve Data bills credits
   * per symbol rather than per request, so a batched call is not free.
   */
  readonly cost: number;
  /**
   * Venues this cell is actually valid for. Undefined means every venue in the
   * asset class.
   *
   * This exists because capability is not uniform across a class. Twelve Data
   * lists all 943 IDX symbols in its reference data and its codec will happily
   * produce `BBCA:XIDX`, but a free-tier quote for it returns "available
   * starting with the Pro or Venture plan". Expressing that as a symbol failure
   * would be a lie — the symbol is fine, the entitlement is not — so it is a
   * venue restriction on the capability instead.
   */
  readonly venues?: readonly string[];
}

/**
 * Sparse by construction. A missing cell means "cannot serve this at all",
 * which is different from "serves it badly" — the router must not fall back to
 * a provider that would simply 404.
 */
export type CapabilityMatrix = Partial<Record<AssetClass, Partial<Record<DataKind, Capability>>>>;

/**
 * The vendor's hard ceiling, exactly as published. The utilisation fraction we
 * actually allow ourselves lives in the budget ledger, not here, so that this
 * stays a statement of fact about the vendor rather than a policy choice.
 */
export interface RateBudget {
  readonly perMinute?: number;
  readonly perDay?: number;
}

/**
 * Every upstream implements this. Methods are optional because capability is
 * declared in the matrix and enforced by the router: a provider that advertises
 * no `bars` cell has no reason to implement `bars`.
 *
 * Adapters are the only place a vendor ticker string may exist. They take and
 * return canonical types, and they return `Sourced<T>` — never a bare value,
 * which would strand the caller with no way to say where a number came from.
 */
export interface MarketDataProvider {
  readonly id: ProviderId;
  readonly capabilities: CapabilityMatrix;
  readonly budget: RateBudget;

  quote?(sid: SymbolId, signal?: AbortSignal): Promise<Sourced<Quote>>;
  bars?(req: BarRequest, signal?: AbortSignal): Promise<Sourced<BarSeries>>;
  search?(query: string, signal?: AbortSignal): Promise<Sourced<readonly SymbolMatch[]>>;
  fundamentals?(sid: SymbolId, signal?: AbortSignal): Promise<Sourced<Fundamentals>>;
  news?(req: NewsRequest, signal?: AbortSignal): Promise<Sourced<readonly NewsItem[]>>;
}

/** The capability cell for a request, or undefined if the provider cannot serve it. */
export function capabilityFor(
  provider: MarketDataProvider,
  assetClass: AssetClass,
  kind: DataKind,
): Capability | undefined {
  return provider.capabilities[assetClass]?.[kind];
}

export function canServe(
  provider: MarketDataProvider,
  assetClass: AssetClass,
  kind: DataKind,
): boolean {
  return capabilityFor(provider, assetClass, kind) !== undefined;
}

/** Whether a capability cell covers a specific venue. */
export function servesVenue(capability: Capability, venue: string): boolean {
  return capability.venues === undefined || capability.venues.includes(venue);
}
