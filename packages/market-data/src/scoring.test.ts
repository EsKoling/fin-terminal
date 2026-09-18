import { describe, expect, it } from 'vitest';
import {
  latencyMatch,
  rankCandidates,
  scoreProvider,
  usableChain,
  type Candidate,
} from './scoring';
import type { Capability } from './provider';

const REALTIME: Capability = { latencyClass: 'realtime', quality: 1, cost: 1 };
const DELAYED: Capability = { latencyClass: 'delayed15', quality: 1, cost: 1 };

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    provider: 'finnhub',
    capability: REALTIME,
    fidelity: 'exact',
    breaker: 'healthy',
    health: 1,
    budgetHeadroom: 1,
    observedLatencyMs: 0,
    ...over,
  };
}

describe('latencyMatch', () => {
  it('does not reward freshness nobody asked for', () => {
    // A daily chart gains nothing from a realtime feed, and spending realtime
    // quota on it starves the watchlist that does need it.
    expect(latencyMatch('realtime', 'eod')).toBe(1);
    expect(latencyMatch('realtime', 'realtime')).toBe(1);
  });

  it('penalises each step of missed freshness', () => {
    expect(latencyMatch('delayed15', 'realtime')).toBeCloseTo(0.7, 10);
    expect(latencyMatch('eod', 'realtime')).toBeCloseTo(0.4, 10);
  });

  it('floors rather than zeroes, so a stale source still beats nothing', () => {
    expect(latencyMatch('synthetic', 'realtime')).toBe(0.1);
  });
});

describe('scoreProvider', () => {
  it('scores a perfect exact realtime provider at 1', () => {
    expect(scoreProvider({ ...candidate(), want: 'realtime' })).toBe(1);
  });

  it('prefers the real instrument over a near one', () => {
    const real = scoreProvider({ ...candidate(), want: 'realtime' });
    const near = scoreProvider({ ...candidate({ fidelity: 'proxy' }), want: 'realtime' });

    expect(near).toBeCloseTo(real * 0.75, 10);
    // Penalised, not rejected: spot gold is worth showing when COMEX is not
    // available, as long as the chip says so.
    expect(near).toBeGreaterThan(0);
  });

  it('removes a provider entirely once its budget is gone', () => {
    // Multiplicative, so no amount of quality can outvote an exhausted quota.
    expect(scoreProvider({ ...candidate({ budgetHeadroom: 0 }), want: 'realtime' })).toBe(0);
    expect(scoreProvider({ ...candidate({ health: 0 }), want: 'realtime' })).toBe(0);
  });

  it('treats observed latency as a tie-breaker, not a driver', () => {
    const fast = scoreProvider({ ...candidate({ observedLatencyMs: 0 }), want: 'realtime' });
    const slow = scoreProvider({ ...candidate({ observedLatencyMs: 2_000 }), want: 'realtime' });

    expect(slow).toBeCloseTo(fast * 0.8, 10);
    // Capped, so a 30-second timeout does not score worse than a 2-second one
    // and drag the ordering around.
    const awful = scoreProvider({ ...candidate({ observedLatencyMs: 30_000 }), want: 'realtime' });
    expect(awful).toBeCloseTo(slow, 10);
  });
});

describe('rankCandidates', () => {
  it('puts the best usable provider first', () => {
    const ranked = rankCandidates(
      [
        candidate({ provider: 'yahoo', capability: DELAYED }),
        candidate({ provider: 'finnhub', capability: REALTIME }),
      ],
      'realtime',
    );
    expect(ranked.map((c) => c.provider)).toEqual(['finnhub', 'yahoo']);
  });

  it('sorts excluded providers last but still reports them', () => {
    const ranked = rankCandidates(
      [
        candidate({ provider: 'yahoo', breaker: 'tripped' }),
        candidate({ provider: 'finnhub', capability: DELAYED }),
      ],
      'realtime',
    );

    expect(ranked[0]!.provider).toBe('finnhub');
    // Kept rather than filtered: the chip needs to explain the fallback, and a
    // chain that silently shortens hides exactly what we want to show.
    expect(ranked[1]).toMatchObject({ provider: 'yahoo', excluded: 'breaker-open', score: 0 });
  });

  it('honours an exclusion the caller already decided', () => {
    const ranked = rankCandidates(
      [candidate({ provider: 'twelvedata', excluded: 'venue-unsupported' })],
      'realtime',
    );
    expect(ranked[0]!.excluded).toBe('venue-unsupported');
    expect(usableChain(ranked)).toHaveLength(0);
  });

  it('breaks ties deterministically so the chip does not flap', () => {
    const order = rankCandidates(
      [candidate({ provider: 'yahoo' }), candidate({ provider: 'finnhub' })],
      'realtime',
    ).map((c) => c.provider);

    const reversed = rankCandidates(
      [candidate({ provider: 'finnhub' }), candidate({ provider: 'yahoo' })],
      'realtime',
    ).map((c) => c.provider);

    expect(order).toEqual(reversed);
  });

  it('carries the proxy note through to whatever renders the chip', () => {
    const ranked = rankCandidates(
      [candidate({ provider: 'yahoo', fidelity: 'proxy', note: 'quote currency USD, not USDT' })],
      'realtime',
    );
    expect(ranked[0]!.note).toBe('quote currency USD, not USDT');
    expect(ranked[0]!.fidelity).toBe('proxy');
  });
});
