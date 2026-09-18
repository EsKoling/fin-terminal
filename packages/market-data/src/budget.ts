import type { RateBudget } from './provider';

/**
 * Rate-budget accounting, as pure state.
 *
 * The ceilings in CLAUDE.md are the vendors' hard limits. We spend to a
 * fraction of them, because the alerts worker and the daily probe job draw on
 * the same quota as a browsing user, and because a provider that 429s is worse
 * than one we simply declined to call.
 *
 * Windows are aligned to wall-clock boundaries rather than rolling, because
 * that is how the vendors themselves reset — Twelve Data's 800 credits come
 * back at UTC midnight, not 24 hours after your first call. A rolling window
 * here would drift out of step with the thing it is modelling.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Fraction of a vendor's published ceiling we allow ourselves. */
export const DEFAULT_UTILISATION = 0.7;

export interface BudgetWindow {
  readonly startedAt: number;
  readonly units: number;
}

export interface BudgetState {
  readonly minute: BudgetWindow;
  readonly day: BudgetWindow;
}

function minuteStart(now: number): number {
  return Math.floor(now / MINUTE_MS) * MINUTE_MS;
}

function dayStart(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

export function newBudget(now: number): BudgetState {
  return {
    minute: { startedAt: minuteStart(now), units: 0 },
    day: { startedAt: dayStart(now), units: 0 },
  };
}

/** Reset any window whose boundary has passed. Idempotent. */
export function rollWindows(s: BudgetState, now: number): BudgetState {
  const m = minuteStart(now);
  const d = dayStart(now);
  if (s.minute.startedAt === m && s.day.startedAt === d) return s;
  return {
    minute: s.minute.startedAt === m ? s.minute : { startedAt: m, units: 0 },
    day: s.day.startedAt === d ? s.day : { startedAt: d, units: 0 },
  };
}

export function charge(s: BudgetState, units: number, now: number): BudgetState {
  const r = rollWindows(s, now);
  return {
    minute: { startedAt: r.minute.startedAt, units: r.minute.units + units },
    day: { startedAt: r.day.startedAt, units: r.day.units + units },
  };
}

/**
 * 0..1, where 1 is untouched and 0 is at or past our self-imposed ceiling.
 * The tightest configured window wins: 8 requests/minute exhausts long before
 * 800/day does, and the router needs to feel that immediately.
 *
 * A provider with no declared limits has full headroom — the keyless exchange
 * sockets are genuinely unmetered, and pretending otherwise would rank them
 * below providers we are actually rationing.
 */
export function headroom(
  s: BudgetState,
  budget: RateBudget,
  now: number,
  utilisation: number = DEFAULT_UTILISATION,
): number {
  const r = rollWindows(s, now);
  let h = 1;

  if (budget.perMinute !== undefined) {
    const cap = budget.perMinute * utilisation;
    h = Math.min(h, cap <= 0 ? 0 : 1 - r.minute.units / cap);
  }
  if (budget.perDay !== undefined) {
    const cap = budget.perDay * utilisation;
    h = Math.min(h, cap <= 0 ? 0 : 1 - r.day.units / cap);
  }

  return Math.max(0, Math.min(1, h));
}

/** Would spending `units` now cross a ceiling? Checked before the call, not after. */
export function wouldExceed(
  s: BudgetState,
  budget: RateBudget,
  units: number,
  now: number,
  utilisation: number = DEFAULT_UTILISATION,
): boolean {
  const r = rollWindows(s, now);

  if (budget.perMinute !== undefined && r.minute.units + units > budget.perMinute * utilisation) {
    return true;
  }
  if (budget.perDay !== undefined && r.day.units + units > budget.perDay * utilisation) {
    return true;
  }
  return false;
}

/** Percent of the vendor's *hard* ceiling used today. What `/budget-audit` reports. */
export function dayUtilisation(
  s: BudgetState,
  budget: RateBudget,
  now: number,
): number | undefined {
  if (budget.perDay === undefined || budget.perDay <= 0) return undefined;
  return rollWindows(s, now).day.units / budget.perDay;
}
