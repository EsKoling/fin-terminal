import { describe, expect, it } from 'vitest';
import {
  advance,
  cooldownMs,
  disable,
  enable,
  isUsable,
  newBreaker,
  recordFailure,
  recordSuccess,
  type Breaker,
} from './breaker';

const T = 1_750_000_000_000;

/** Drive n consecutive failures from a fresh breaker. */
function failTimes(n: number, at = T): Breaker {
  let b = newBreaker();
  for (let i = 0; i < n; i++) b = recordFailure(b, at, 'HTTP 429');
  return b;
}

describe('breaker', () => {
  it('tolerates a blip but trips on the third consecutive failure', () => {
    // Free providers flake constantly. Tripping on the first 429 would take
    // Yahoo out of rotation permanently for no good reason.
    expect(failTimes(1).state).toBe('healthy');
    expect(failTimes(2).state).toBe('degraded');
    expect(failTimes(3).state).toBe('tripped');
  });

  it('keeps routing to a degraded provider, because slow beats absent', () => {
    const b = failTimes(2);
    expect(b.state).toBe('degraded');
    // The IDX panel showing a late number with an amber chip is the product
    // working. Showing nothing is not.
    expect(isUsable(b)).toBe(true);
  });

  it('stops routing to a tripped provider', () => {
    expect(isUsable(failTimes(3))).toBe(false);
  });

  it('records why it opened, so the chip and the runbook can say', () => {
    const b = failTimes(3);
    expect(b.lastError).toBe('HTTP 429');
    expect(b.openedAt).toBe(T);
  });

  describe('recovery', () => {
    it('holds the provider out for the full cooldown, then probes once', () => {
      const tripped = failTimes(3);
      expect(advance(tripped, T + 29_999).state).toBe('tripped');
      expect(advance(tripped, T + 30_000).state).toBe('probing');
    });

    it('restores a provider whose probe succeeds, and forgives its trip count', () => {
      const probing = advance(failTimes(3), T + 30_000);
      const recovered = recordSuccess(probing, T + 30_001);

      expect(recovered.state).toBe('healthy');
      // Without this reset, a provider that recovers still carries a punitive
      // cooldown into its next blip and effectively never comes back.
      expect(recovered.trips).toBe(0);
      expect(recovered.consecutiveFailures).toBe(0);
    });

    it('re-opens immediately when the probe fails, rather than spending three more calls', () => {
      const probing = advance(failTimes(3), T + 30_000);
      const reopened = recordFailure(probing, T + 30_001, 'timeout');

      expect(reopened.state).toBe('tripped');
      expect(reopened.trips).toBe(2);
    });

    it('backs off exponentially and then stops growing', () => {
      expect(cooldownMs(1)).toBe(30_000);
      expect(cooldownMs(2)).toBe(60_000);
      expect(cooldownMs(3)).toBe(120_000);
      // Each probe costs real quota, so the interval is capped rather than
      // doubling into hours.
      expect(cooldownMs(20)).toBe(15 * 60_000);
    });

    it('applies the longer cooldown after a second trip', () => {
      const second = recordFailure(advance(failTimes(3), T + 30_000), T + 30_001, 'timeout');
      const openedAt = second.openedAt!;

      expect(advance(second, openedAt + 30_000).state).toBe('tripped');
      expect(advance(second, openedAt + 60_000).state).toBe('probing');
    });
  });

  describe('disabled', () => {
    it('cannot be revived by success, only by an explicit enable', () => {
      const off = disable(newBreaker(), 'chaos flag');
      expect(off.state).toBe('disabled');
      expect(isUsable(off)).toBe(false);

      // This is what makes `?chaos=yahoo` a reliable demo rather than a race
      // against the next successful background poll.
      expect(recordSuccess(off, T).state).toBe('disabled');
      expect(recordFailure(off, T, 'whatever').state).toBe('disabled');
      expect(enable(off).state).toBe('healthy');
    });

    it('does not advance out of disabled when time passes', () => {
      const off = disable(failTimes(3), 'manual');
      expect(advance(off, T + 10 * 60_000).state).toBe('disabled');
    });
  });
});
