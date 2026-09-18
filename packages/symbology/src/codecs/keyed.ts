import type { SymbolId } from '../symbol-id';
import { exact, proxy, type CodecResult, type SymbolCodec } from '../codec';

const US_VENUES = new Set(['XNAS', 'XNYS', 'ARCX']);

/**
 * Finnhub. Real-time US quotes on the free tier at 60 calls/min, plus company
 * news and basic fundamentals. International equity coverage is a paid
 * feature, so IDX and the rest of SE Asia return null here and route to
 * Twelve Data or Yahoo instead.
 */
export const finnhubCodec: SymbolCodec = {
  id: 'finnhub',
  toVendor(sid): CodecResult | null {
    switch (sid.assetClass) {
      case 'equity':
      case 'etf':
        return US_VENUES.has(sid.venue) ? exact(sid.base) : null;
      case 'crypto': {
        const quote = sid.quote ?? 'USDT';
        const vendor = 'BINANCE:' + sid.base + quote;
        return sid.venue === 'BINANCE'
          ? exact(vendor)
          : proxy(vendor, 'Binance book, not ' + sid.venue);
      }
      case 'fx':
        // Finnhub serves FX through broker feeds. An OANDA rate is a dealer
        // quote, close to but not identical with the interbank mid.
        return sid.quote
          ? proxy('OANDA:' + sid.base + '_' + sid.quote, 'OANDA dealer quote, not interbank mid')
          : null;
      default:
        return null;
    }
  },
  fromVendor(vendor): SymbolId | null {
    const v = vendor.toUpperCase();
    if (v.startsWith('BINANCE:')) {
      const rest = v.slice(8);
      const quote = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH'].find(
        (q) => rest.endsWith(q) && rest.length > q.length,
      );
      if (!quote) return null;
      return { assetClass: 'crypto', venue: 'BINANCE', base: rest.slice(0, -quote.length), quote };
    }
    if (v.startsWith('OANDA:')) {
      const [base, quote] = v.slice(6).split('_') as [string, string?];
      if (!quote) return null;
      return { assetClass: 'fx', venue: 'OTC', base, quote };
    }
    if (v.includes(':')) return null;
    return { assetClass: 'equity', venue: 'XNAS', base: v };
  },
};

/**
 * Twelve Data. 800 credits/day and 8/min on the free tier.
 *
 * It lists all 943 IDX symbols in reference data, so this codec can express
 * `BBCA:XIDX` — but a free-tier *quote* for one returns "available starting
 * with the Pro or Venture plan". The symbol is expressible and the entitlement
 * is missing, which is a capability limit rather than a codec one: see the
 * `venues` field on `Capability` in @ft/market-data. Yahoo is the only free
 * IDX price source.
 */
export const twelveDataCodec: SymbolCodec = {
  id: 'twelvedata',
  toVendor(sid): CodecResult | null {
    switch (sid.assetClass) {
      case 'equity':
      case 'etf':
        return US_VENUES.has(sid.venue) ? exact(sid.base) : exact(sid.base + ':' + sid.venue);
      case 'fx':
        return sid.quote ? exact(sid.base + '/' + sid.quote) : null;
      case 'crypto':
        return exact(sid.base + '/' + (sid.quote ?? 'USD'));
      case 'commodity': {
        // Twelve Data has no futures on the free tier. Spot metals are the
        // closest available instrument, and they are not the same thing:
        // different price, no roll, no contango. Flagged loudly as a proxy.
        const spot: Record<string, string> = { GC: 'XAU/USD', SI: 'XAG/USD', PL: 'XPT/USD' };
        const s = spot[sid.base];
        return s ? proxy(s, 'spot metal, not the ' + sid.base + ' futures contract') : null;
      }
      default:
        return null;
    }
  },
  fromVendor(vendor, hint): SymbolId | null {
    const v = vendor.toUpperCase();
    if (v.includes('/')) {
      const [base, quote] = v.split('/') as [string, string];
      const assetClass =
        hint?.assetClass ?? (quote === 'USD' || quote === 'USDT' ? 'crypto' : 'fx');
      return {
        assetClass,
        venue: assetClass === 'fx' ? 'OTC' : (hint?.venue ?? 'BINANCE'),
        base,
        quote,
      };
    }
    if (v.includes(':')) {
      const [base, venue] = v.split(':') as [string, string];
      return { assetClass: hint?.assetClass ?? 'equity', venue, base };
    }
    return { assetClass: hint?.assetClass ?? 'equity', venue: hint?.venue ?? 'XNAS', base: v };
  },
};

/** FRED series are their own namespace: no venue, no ticker convention. */
export const fredCodec: SymbolCodec = {
  id: 'fred',
  toVendor(sid): CodecResult | null {
    return sid.assetClass === 'macro' ? exact(sid.base) : null;
  },
  fromVendor(vendor): SymbolId | null {
    return { assetClass: 'macro', venue: 'FRED', base: vendor.toUpperCase() };
  },
};
