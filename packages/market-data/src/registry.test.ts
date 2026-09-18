import { parseSid } from '@ft/symbology';
import { describe, expect, it } from 'vitest';
import { disable, newBreaker, type Breaker } from './breaker';
import { charge, newBudget, type BudgetState } from './budget';
import type { MarketDataProvider } from './provider';
import { buildChain, createRegistry, type ProviderRuntime } from './registry';
import { usableChain } from './scoring';

const T = 1_750_000_000_000;

const finnhub: MarketDataProvider = {
  id: 'finnhub',
  budget: { perMinute: 60 },
  capabilities: { equity: { quote: { latencyClass: 'realtime', quality: 0.9, cost: 1 } } },
};

const twelvedata: MarketDataProvider = {
  id: 'twelvedata',
  budget: { perMinute: 8, perDay: 800 },
  capabilities: {
    equity: {
      // The correction that cost us a live probe to learn: the free tier
      // resolves IDX symbols but will not quote them.
      quote: {
        latencyClass: 'delayed15',
        quality: 0.8,
        cost: 1,
        venues: ['XNAS', 'XNYS', 'ARCX'],
      },
    },
  },
};

const yahoo: MarketDataProvider = {
  id: 'yahoo',
  budget: { perMinute: 30 },
  capabilities: {
    equity: { quote: { latencyClass: 'delayed15', quality: 0.7, cost: 1 } },
    crypto: { quote: { latencyClass: 'delayed15', quality: 0.6, cost: 1 } },
  },
};

const binance: MarketDataProvider = {
  id: 'binance',
  budget: {},
  capabilities: { crypto: { quote: { latencyClass: 'realtime', quality: 1, cost: 0 } } },
};

const coinbase: MarketDataProvider = {
  id: 'coinbase',
  budget: {},
  capabilities: { crypto: { quote: { latencyClass: 'realtime', quality: 1, cost: 0 } } },
};

const healthy: Breaker = newBreaker();
const fresh: BudgetState = newBudget(T);

function runtimes(over: Partial<Record<string, Partial<ProviderRuntime>>> = {}) {
  return (id: string): ProviderRuntime => ({
    breaker: healthy,
    budget: fresh,
    observedLatencyMs: 100,
    ...over[id],
  });
}

describe('createRegistry', () => {
  it('refuses a duplicate provider rather than silently shadowing one', () => {
    expect(() => createRegistry([yahoo, yahoo])).toThrow(/Duplicate provider/);
  });

  it('offers only providers that advertise the requested cell', () => {
    const r = createRegistry([finnhub, yahoo, binance]);
    expect(r.serving('crypto', 'quote').map((p) => p.id)).toEqual(['yahoo', 'binance']);
    expect(r.serving('macro', 'quote')).toEqual([]);
  });
});

describe('buildChain', () => {
  it('routes an IDX quote to Yahoo, and says why each other source lost', () => {
    // This is the whole IDX routing story in one assertion. Finnhub cannot
    // express a non-US ticker at all; Twelve Data can express it but is not
    // entitled to quote it; Yahoo is the only free source left standing.
    const registry = createRegistry([finnhub, twelvedata, yahoo]);
    const chain = buildChain(
      registry,
      { sid: parseSid('equity:XIDX:BBCA'), kind: 'quote' },
      runtimes(),
      T,
    );

    expect(chain[0]).toMatchObject({ provider: 'yahoo', fidelity: 'exact' });
    expect(chain.find((c) => c.provider === 'finnhub')?.excluded).toBe('no-symbol');
    expect(chain.find((c) => c.provider === 'twelvedata')?.excluded).toBe('venue-unsupported');
    expect(usableChain(chain).map((c) => c.provider)).toEqual(['yahoo']);
  });

  it('still prefers Twelve Data for a US quote, where it is entitled', () => {
    const registry = createRegistry([twelvedata, yahoo]);
    const chain = buildChain(
      registry,
      { sid: parseSid('equity:XNAS:AAPL'), kind: 'quote' },
      runtimes(),
      T,
    );
    // Same provider, same asset class, different venue, opposite outcome.
    expect(usableChain(chain).map((c) => c.provider)).toEqual(['twelvedata', 'yahoo']);
  });

  it('prefers the venue quoting the pair we actually asked for', () => {
    const registry = createRegistry([binance, coinbase, yahoo]);
    const chain = buildChain(
      registry,
      { sid: parseSid('crypto:BINANCE:BTC/USDT'), kind: 'quote' },
      runtimes(),
      T,
    );

    expect(chain[0]!.provider).toBe('binance');
    expect(chain[0]!.fidelity).toBe('exact');

    // Coinbase can only offer BTC-USD. That is a different price, so it is
    // usable but demoted, and it carries the reason to the UI.
    const cb = chain.find((c) => c.provider === 'coinbase')!;
    expect(cb.fidelity).toBe('proxy');
    expect(cb.note).toContain('USDT');
  });

  it('falls through to the next venue when the primary is disabled', () => {
    // What `?chaos=binance` does in the demo.
    const registry = createRegistry([binance, coinbase]);
    const chain = buildChain(
      registry,
      { sid: parseSid('crypto:BINANCE:BTC/USDT'), kind: 'quote' },
      runtimes({ binance: { breaker: disable(healthy, 'chaos flag') } }),
      T,
    );

    expect(chain[0]!.provider).toBe('coinbase');
    expect(chain.find((c) => c.provider === 'binance')?.excluded).toBe('breaker-open');
  });

  it('drops a provider that has spent its quota, and keeps one that has not', () => {
    const registry = createRegistry([twelvedata, yahoo]);
    const chain = buildChain(
      registry,
      { sid: parseSid('equity:XNAS:AAPL'), kind: 'quote' },
      runtimes({ twelvedata: { budget: charge(fresh, 6, T) } }),
      T,
    );

    expect(chain.find((c) => c.provider === 'twelvedata')?.excluded).toBe('budget-exhausted');
    expect(usableChain(chain).map((c) => c.provider)).toEqual(['yahoo']);
  });

  it('lets a tripped provider back in once its cooldown has expired', () => {
    // buildChain advances the breaker itself, so a caller cannot forget to.
    const tripped: Breaker = {
      state: 'tripped',
      health: 0.4,
      consecutiveFailures: 3,
      trips: 1,
      openedAt: T,
    };
    const registry = createRegistry([yahoo]);
    const req = { sid: parseSid('equity:XIDX:BBCA'), kind: 'quote' } as const;

    const during = buildChain(registry, req, runtimes({ yahoo: { breaker: tripped } }), T + 10_000);
    expect(during[0]!.excluded).toBe('breaker-open');

    const after = buildChain(registry, req, runtimes({ yahoo: { breaker: tripped } }), T + 30_000);
    expect(after[0]!.excluded).toBeUndefined();
  });

  it('does not spend a realtime provider on a request that only needs end-of-day', () => {
    const registry = createRegistry([finnhub, yahoo]);
    const eod = buildChain(
      registry,
      { sid: parseSid('equity:XNAS:AAPL'), kind: 'quote', want: 'eod' },
      runtimes(),
      T,
    );
    // Both now fully satisfy the need, so raw quality decides rather than speed.
    expect(eod.map((c) => c.provider)).toEqual(['finnhub', 'yahoo']);
    expect(eod[0]!.score).toBeGreaterThan(0);
  });
});
