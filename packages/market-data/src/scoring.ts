import type { Fidelity, LatencyClass, ProviderId } from '@ft/contracts';
import { isUsableState, type BreakerState } from './breaker';
import type { Capability } from './provider';

/**
 * Provider scoring.
 *
 * This is the single decision that determines which free source answers a
 * request, and it is deliberately a pure function of plain numbers: no I/O, no
 * clock, no registry lookups. Everything it needs is passed in. That means the
 * interesting cases — a tripped Yahoo during IDX hours, Twelve Data at 95% of
 * its daily credits, a proxy symbol that is nearly but not quite right — are
 * ordinary unit tests rather than something you can only observe in production
 * against a vendor you cannot control.
 *
 *   score = quality
 *         × latencyMatch      how well the freshness on offer meets the need
 *         × health            EWMA success rate from the breaker
 *         × budgetHeadroom    how much of our self-imposed quota is left
 *         × fidelity          proxy symbols are penalised, not rejected
 *         × speed             mild preference for the faster of two equals
 *
 * Multiplicative, not additive, so any single term going to zero removes the
 * provider entirely. An exhausted budget cannot be outvoted by high quality.
 */

/** Freshness ordering. Lower is closer to the exchange. */
export const LATENCY_RANK: Record<LatencyClass, number> = {
  realtime: 0,
  delayed15: 1,
  eod: 2,
  derived: 3,
  synthetic: 4,
};

export const SCORING = {
  /** A near-instrument is worth having, but never over the real one. */
  proxyPenalty: 0.75,
  /** Cost per step of missed freshness (realtime asked, delayed15 offered). */
  latencyStepPenalty: 0.3,
  /** Floor, so a stale source still outranks nothing at all. */
  minLatencyMatch: 0.1,
  referenceLatencyMs: 2_000,
  /** Observed latency is a tie-breaker, not a driver. */
  observedLatencyWeight: 0.2,
} as const;

export type ExclusionReason =
  | 'breaker-open'
  | 'budget-exhausted'
  /** The provider cannot express this symbol at all. */
  | 'no-symbol'
  /** The symbol is expressible, but this venue is outside the capability. */
  | 'venue-unsupported';

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * 1 when the provider is at least as fresh as asked for. Asking for `eod` and
 * being offered `realtime` is not a penalty — it is a bonus we decline to pay
 * for, since a realtime source costs the same budget either way.
 */
export function latencyMatch(got: LatencyClass, want: LatencyClass): number {
  const steps = LATENCY_RANK[got] - LATENCY_RANK[want];
  if (steps <= 0) return 1;
  return Math.max(SCORING.minLatencyMatch, 1 - steps * SCORING.latencyStepPenalty);
}

export interface ScoreInput {
  readonly capability: Capability;
  readonly want: LatencyClass;
  readonly fidelity: Fidelity;
  /** 0..1 EWMA success rate, from the breaker. */
  readonly health: number;
  /** 0..1 remaining quota, from the budget ledger. */
  readonly budgetHeadroom: number;
  readonly observedLatencyMs: number;
}

export function scoreProvider(i: ScoreInput): number {
  const speed =
    1 -
    Math.min(i.observedLatencyMs / SCORING.referenceLatencyMs, 1) * SCORING.observedLatencyWeight;

  return (
    clamp01(i.capability.quality) *
    latencyMatch(i.capability.latencyClass, i.want) *
    clamp01(i.health) *
    clamp01(i.budgetHeadroom) *
    (i.fidelity === 'exact' ? 1 : SCORING.proxyPenalty) *
    speed
  );
}

export interface Candidate {
  readonly provider: ProviderId;
  readonly capability: Capability;
  readonly fidelity: Fidelity;
  readonly breaker: BreakerState;
  readonly health: number;
  readonly budgetHeadroom: number;
  readonly observedLatencyMs: number;
  /** Why the symbol is a proxy, e.g. "quote currency IDR, not USDT". */
  readonly note?: string;
  /** Set by the caller when the provider cannot express the symbol at all. */
  readonly excluded?: ExclusionReason;
}

export interface ScoredCandidate {
  readonly provider: ProviderId;
  readonly score: number;
  readonly fidelity: Fidelity;
  readonly latencyClass: LatencyClass;
  readonly excluded?: ExclusionReason;
  readonly note?: string;
}

/**
 * Rank a chain, usable providers first by descending score.
 *
 * Excluded providers are returned rather than filtered out, carrying the reason
 * they lost. The degradation chip needs to say *why* it fell back, `/budget-audit`
 * needs to see who is near a ceiling, and a chain that silently shortens is
 * exactly the kind of invisible failure this architecture exists to avoid.
 *
 * Ties break on provider id so the order is stable across calls — a chain that
 * reshuffles between two equal providers would flap the UI chip for no reason.
 */
export function rankCandidates(
  candidates: readonly Candidate[],
  want: LatencyClass,
): readonly ScoredCandidate[] {
  const scored = candidates.map((c): ScoredCandidate => {
    const excluded: ExclusionReason | undefined =
      c.excluded ?? (isUsableState(c.breaker) ? undefined : 'breaker-open');

    return {
      provider: c.provider,
      score: excluded ? 0 : scoreProvider({ ...c, want }),
      fidelity: c.fidelity,
      latencyClass: c.capability.latencyClass,
      ...(excluded !== undefined ? { excluded } : {}),
      ...(c.note !== undefined ? { note: c.note } : {}),
    };
  });

  return scored.sort((a, b) => {
    const aOut = a.excluded !== undefined;
    const bOut = b.excluded !== undefined;
    if (aOut !== bOut) return aOut ? 1 : -1;
    if (a.score !== b.score) return b.score - a.score;
    return a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0;
  });
}

/** The chain the router will actually try, in order. */
export function usableChain(ranked: readonly ScoredCandidate[]): readonly ScoredCandidate[] {
  return ranked.filter((c) => c.excluded === undefined && c.score > 0);
}
