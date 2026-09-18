import { describe, expect, it } from 'vitest';
import {
  isStale,
  mapSourced,
  provenance,
  sourced,
  weakestProvenance,
  type Provenance,
} from './provenance';

const T = 1_750_000_000_000;

function p(over: Partial<Provenance> = {}): Provenance {
  return {
    provider: 'finnhub',
    asOf: T,
    fetchedAt: T,
    latencyClass: 'realtime',
    fidelity: 'exact',
    stale: false,
    ...over,
  };
}

describe('provenance', () => {
  it('derives staleness from the data class rather than trusting the caller', () => {
    // A quote goes stale in a minute; a daily bar does not go stale in an hour.
    expect(isStale(T - 90_000, 'quote', T)).toBe(true);
    expect(isStale(T - 90_000, 'bar_daily', T)).toBe(false);

    const fresh = provenance({
      provider: 'finnhub',
      asOf: T - 5_000,
      latencyClass: 'realtime',
      freshness: 'quote',
      now: T,
    });
    expect(fresh.stale).toBe(false);

    const old = provenance({
      provider: 'yahoo',
      asOf: T - 600_000,
      latencyClass: 'delayed15',
      freshness: 'quote',
      now: T,
    });
    expect(old.stale).toBe(true);
  });

  it('omits optional fields rather than setting them undefined', () => {
    const clean = provenance({
      provider: 'fred',
      asOf: T,
      latencyClass: 'eod',
      freshness: 'bar_daily',
      now: T,
    });
    expect('degraded' in clean).toBe(false);
    expect('note' in clean).toBe(false);
  });

  it('preserves origin when a value is transformed', () => {
    const s = sourced(100, p({ provider: 'yahoo' }));
    const doubled = mapSourced(s, (n) => n * 2);
    expect(doubled.data).toBe(200);
    // The whole point: transforming a number must not launder where it came from.
    expect(doubled.prov).toBe(s.prov);
  });

  describe('weakestProvenance', () => {
    it('takes the worst latency class and reports that provider', () => {
      const combined = weakestProvenance([
        p({ provider: 'binance', latencyClass: 'realtime' }),
        p({ provider: 'yahoo', latencyClass: 'delayed15' }),
      ]);
      expect(combined.latencyClass).toBe('delayed15');
      expect(combined.provider).toBe('yahoo');
    });

    it('is proxy if any input was proxy', () => {
      const combined = weakestProvenance([p({ fidelity: 'exact' }), p({ fidelity: 'proxy' })]);
      expect(combined.fidelity).toBe('proxy');
    });

    it('is stale if any input was stale, and takes the oldest asOf', () => {
      const combined = weakestProvenance([
        p({ asOf: T, stale: false }),
        p({ asOf: T - 60_000, stale: true }),
      ]);
      expect(combined.stale).toBe(true);
      expect(combined.asOf).toBe(T - 60_000);
    });

    it('propagates a degradation reason from any input', () => {
      const combined = weakestProvenance([p(), p({ degraded: 'cache-only' })]);
      expect(combined.degraded).toBe('cache-only');
    });

    it('refuses to invent provenance from nothing', () => {
      expect(() => weakestProvenance([])).toThrow();
    });
  });
});
