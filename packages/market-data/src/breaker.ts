/**
 * Per-provider circuit breaker.
 *
 * Every transition is a pure function of the previous state, the outcome, and
 * the clock. Nothing here touches Redis, and nothing reads `Date.now()` on its
 * own. That is deliberate on two counts: the state has to survive a serverless
 * cold start by round-tripping through Redis as plain JSON (B2), and a breaker
 * whose behaviour depends on real elapsed time is a breaker nobody can test.
 *
 * The states are not decoration either:
 *
 * - `healthy`  — serving normally
 * - `degraded` — answering, but the success rate has decayed. Still usable, and
 *                deliberately still preferred over nothing, because a slow
 *                Yahoo beats an empty IDX chart.
 * - `tripped`  — failing. Excluded from routing until the cooldown expires.
 * - `probing`  — cooldown expired; the next call is a live probe. One request
 *                decides whether it goes back to healthy or trips again with a
 *                longer cooldown.
 * - `disabled` — switched off by a human or by the `?chaos=` flag. Sticky: no
 *                sequence of successes brings it back, only an explicit
 *                `enable`. This is the state the runbook means by "trip the
 *                breaker rather than deleting the adapter".
 */
export type BreakerState = 'healthy' | 'degraded' | 'tripped' | 'probing' | 'disabled';

export interface Breaker {
  readonly state: BreakerState;
  /** EWMA of recent outcomes, 1 = every call succeeded. */
  readonly health: number;
  readonly consecutiveFailures: number;
  /** How many times this breaker has opened. Drives exponential cooldown. */
  readonly trips: number;
  readonly openedAt?: number;
  readonly lastError?: string;
}

export const BREAKER_TUNING = {
  /** EWMA weight on the newest outcome. Higher reacts faster and flaps more. */
  alpha: 0.25,
  tripAfterConsecutiveFailures: 3,
  degradeBelowHealth: 0.6,
  recoverAboveHealth: 0.9,
  baseCooldownMs: 30_000,
  maxCooldownMs: 15 * 60_000,
} as const;

export function newBreaker(): Breaker {
  return { state: 'healthy', health: 1, consecutiveFailures: 0, trips: 0 };
}

/**
 * Exponential backoff, capped. A provider that has tripped five times today is
 * not one to keep poking every thirty seconds — each probe costs real budget.
 */
export function cooldownMs(trips: number): number {
  if (trips <= 0) return BREAKER_TUNING.baseCooldownMs;
  const grown = BREAKER_TUNING.baseCooldownMs * 2 ** (trips - 1);
  return Math.min(grown, BREAKER_TUNING.maxCooldownMs);
}

function ewma(previous: number, outcome: 0 | 1): number {
  const { alpha } = BREAKER_TUNING;
  return alpha * outcome + (1 - alpha) * previous;
}

export function recordSuccess(b: Breaker, _now: number): Breaker {
  if (b.state === 'disabled') return b;

  const health = ewma(b.health, 1);
  // A probe that succeeds clears the slate, including the trip count, so a
  // provider that recovers does not carry a punitive cooldown forever.
  const state: BreakerState =
    b.state === 'probing' || health >= BREAKER_TUNING.recoverAboveHealth ? 'healthy' : 'degraded';

  return {
    state,
    health,
    consecutiveFailures: 0,
    trips: b.state === 'probing' ? 0 : b.trips,
    ...(state === 'healthy' ? {} : b.lastError !== undefined ? { lastError: b.lastError } : {}),
  };
}

export function recordFailure(b: Breaker, now: number, error: string): Breaker {
  if (b.state === 'disabled') return b;

  const health = ewma(b.health, 0);
  const consecutiveFailures = b.consecutiveFailures + 1;

  // A failed probe re-opens immediately: we already gave it a whole cooldown.
  const shouldTrip =
    b.state === 'probing' || consecutiveFailures >= BREAKER_TUNING.tripAfterConsecutiveFailures;

  if (shouldTrip) {
    return {
      state: 'tripped',
      health,
      consecutiveFailures,
      trips: b.trips + 1,
      openedAt: now,
      lastError: error,
    };
  }

  return {
    state: health < BREAKER_TUNING.degradeBelowHealth ? 'degraded' : b.state,
    health,
    consecutiveFailures,
    trips: b.trips,
    lastError: error,
  };
}

/**
 * Advance time without an outcome. Call before routing so an expired cooldown
 * promotes `tripped` to `probing` and the provider gets its one chance back.
 */
export function advance(b: Breaker, now: number): Breaker {
  if (b.state !== 'tripped' || b.openedAt === undefined) return b;
  if (now - b.openedAt < cooldownMs(b.trips)) return b;

  return {
    state: 'probing',
    health: b.health,
    consecutiveFailures: b.consecutiveFailures,
    trips: b.trips,
    ...(b.lastError !== undefined ? { lastError: b.lastError } : {}),
  };
}

/** Sticky off. Used by the runbook and by `?chaos=<provider>` in the demo. */
export function disable(b: Breaker, reason: string): Breaker {
  return {
    state: 'disabled',
    health: b.health,
    consecutiveFailures: b.consecutiveFailures,
    trips: b.trips,
    lastError: reason,
  };
}

export function enable(b: Breaker): Breaker {
  if (b.state !== 'disabled') return b;
  return { state: 'healthy', health: b.health, consecutiveFailures: 0, trips: b.trips };
}

/**
 * Whether the router may send traffic here. `degraded` is usable on purpose —
 * excluding it would turn a slow provider into no provider, which for IDX means
 * an empty chart rather than a chart with an honest amber chip.
 */
export function isUsableState(state: BreakerState): boolean {
  return state === 'healthy' || state === 'degraded' || state === 'probing';
}

export function isUsable(b: Breaker): boolean {
  return isUsableState(b.state);
}
