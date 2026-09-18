import { describe, expect, it } from 'vitest';
import { charge, dayUtilisation, headroom, newBudget, rollWindows, wouldExceed } from './budget';
import type { RateBudget } from './provider';

const T = 1_750_000_000_000;
const MINUTE = 60_000;
const DAY = 86_400_000;

/** Twelve Data's published free tier. */
const TWELVE_DATA: RateBudget = { perMinute: 8, perDay: 800 };
/** An exchange socket: no key, no published ceiling. */
const UNMETERED: RateBudget = {};

describe('budget', () => {
  it('gives an unmetered provider full headroom rather than rationing it by default', () => {
    // Binance's public socket really is free. Treating "no declared limit" as
    // "unknown, assume scarce" would rank it below providers we are rationing.
    const s = charge(newBudget(T), 5_000, T);
    expect(headroom(s, UNMETERED, T)).toBe(1);
  });

  it('spends against 70% of the vendor ceiling, not 100%', () => {
    // 8/min hard, so our ceiling is 5.6. Six calls in a minute is already over.
    const s = charge(newBudget(T), 5, T);
    expect(wouldExceed(s, TWELVE_DATA, 1, T)).toBe(true);

    const under = charge(newBudget(T), 4, T);
    expect(wouldExceed(under, TWELVE_DATA, 1, T)).toBe(false);
  });

  it('reports the tightest window, because per-minute bites long before per-day', () => {
    const s = charge(newBudget(T), 4, T);
    // 4 of 5.6 per minute is far tighter than 4 of 560 per day.
    expect(headroom(s, TWELVE_DATA, T)).toBeCloseTo(1 - 4 / 5.6, 10);
  });

  it('never reports negative headroom', () => {
    const blown = charge(newBudget(T), 1_000, T);
    expect(headroom(blown, TWELVE_DATA, T)).toBe(0);
  });

  it('resets the minute window on the wall-clock boundary', () => {
    const s = charge(newBudget(T), 5, T);
    expect(headroom(s, TWELVE_DATA, T)).toBeLessThan(1);

    const next = rollWindows(s, T + MINUTE);
    expect(next.minute.units).toBe(0);
    // The daily spend survives the minute rolling over.
    expect(next.day.units).toBe(5);
  });

  it('resets the daily window at UTC midnight, the way the vendors do', () => {
    const s = charge(newBudget(T), 700, T);
    const tomorrow = rollWindows(s, T + DAY);
    expect(tomorrow.day.units).toBe(0);
  });

  it('is idempotent within a window, so repeated reads do not lose spend', () => {
    const s = charge(newBudget(T), 3, T);
    expect(rollWindows(rollWindows(s, T), T)).toBe(s);
  });

  it('reports utilisation against the hard ceiling, which is what an audit asks', () => {
    const s = charge(newBudget(T), 400, T);
    // 400 of 800 published, not 400 of our self-imposed 560.
    expect(dayUtilisation(s, TWELVE_DATA, T)).toBeCloseTo(0.5, 10);
    expect(dayUtilisation(s, UNMETERED, T)).toBeUndefined();
  });
});
