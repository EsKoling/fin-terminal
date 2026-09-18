import type { DataKind, LatencyClass, ProviderId } from '@ft/contracts';
import { codecFor, type SymbolId } from '@ft/symbology';
import { advance, type Breaker } from './breaker';
import { headroom, wouldExceed, type BudgetState } from './budget';
import { capabilityFor, canServe, servesVenue, type MarketDataProvider } from './provider';
import {
  rankCandidates,
  type Candidate,
  type ExclusionReason,
  type ScoredCandidate,
} from './scoring';

/**
 * The provider registry and the routing decision.
 *
 * `buildChain` is the seam between the pure scoring maths and the messy world.
 * It stays pure itself by taking runtime state through a lookup function and
 * the clock as a parameter, so the whole routing decision — including breaker
 * recovery and budget exhaustion — is testable without a network or a fake
 * timer. Actually *calling* the chain, with retries and cache tiers, is B2.
 */

export interface Registry {
  readonly providers: readonly MarketDataProvider[];
  get(id: ProviderId): MarketDataProvider | undefined;
  /** Providers advertising a capability for this cell, in registration order. */
  serving(assetClass: SymbolId['assetClass'], kind: DataKind): readonly MarketDataProvider[];
}

export function createRegistry(providers: readonly MarketDataProvider[]): Registry {
  const byId = new Map<ProviderId, MarketDataProvider>();
  for (const p of providers) {
    if (byId.has(p.id)) {
      throw new Error('Duplicate provider registered: ' + p.id);
    }
    byId.set(p.id, p);
  }

  return {
    providers,
    get: (id) => byId.get(id),
    serving: (assetClass, kind) => providers.filter((p) => canServe(p, assetClass, kind)),
  };
}

export interface ResolveRequest {
  readonly sid: SymbolId;
  readonly kind: DataKind;
  /**
   * The freshness the caller actually needs. A watchlist wants `realtime`; a
   * two-year daily chart is perfectly happy with `eod` and should not burn a
   * realtime provider's quota to get it.
   */
  readonly want?: LatencyClass;
}

export interface ProviderRuntime {
  readonly breaker: Breaker;
  readonly budget: BudgetState;
  /** EWMA of observed round-trip latency, milliseconds. */
  readonly observedLatencyMs: number;
}

/**
 * Score every provider that could serve this request, in order.
 *
 * Symbol expressibility is resolved here rather than inside scoring, because it
 * is a hard gate rather than a weight: a provider with no codec entry for a
 * symbol would 404, and a provider whose codec returns a proxy is usable but
 * must carry that fact all the way to the chip. A provider with no codec at all
 * is treated as exact — FRED series ids and SEC CIKs are already canonical.
 */
export function buildChain(
  registry: Registry,
  req: ResolveRequest,
  runtimeFor: (id: ProviderId) => ProviderRuntime,
  now: number,
): readonly ScoredCandidate[] {
  const want = req.want ?? 'realtime';

  const candidates = registry.serving(req.sid.assetClass, req.kind).map((provider): Candidate => {
    // Guaranteed present: `serving` filtered on exactly this cell.
    const capability = capabilityFor(provider, req.sid.assetClass, req.kind)!;
    const runtime = runtimeFor(provider.id);
    const breaker = advance(runtime.breaker, now);

    const codec = codecFor(provider.id);
    const mapped = codec ? codec.toVendor(req.sid) : undefined;
    const cannotExpress = codec !== undefined && mapped === null;

    const budgetHeadroom = headroom(runtime.budget, provider.budget, now);
    const overBudget = wouldExceed(runtime.budget, provider.budget, capability.cost, now);

    const excluded: ExclusionReason | undefined = cannotExpress
      ? 'no-symbol'
      : !servesVenue(capability, req.sid.venue)
        ? 'venue-unsupported'
        : overBudget
          ? 'budget-exhausted'
          : undefined;

    return {
      provider: provider.id,
      capability,
      fidelity: mapped?.fidelity ?? 'exact',
      breaker: breaker.state,
      health: breaker.health,
      budgetHeadroom,
      observedLatencyMs: runtime.observedLatencyMs,
      ...(mapped?.note !== undefined ? { note: mapped.note } : {}),
      ...(excluded !== undefined ? { excluded } : {}),
    };
  });

  return rankCandidates(candidates, want);
}
