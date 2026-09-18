import type { SymbolId } from '../symbol-id';
import { exact, proxy, type CodecResult, type SymbolCodec } from '../codec';

/**
 * Quote assets Binance actually lists, longest first so that splitting
 * BTCUSDT finds USDT rather than stopping at USD. Order matters.
 */
const BINANCE_QUOTES = [
  'USDT',
  'FDUSD',
  'TUSD',
  'USDC',
  'BUSD',
  'TRY',
  'EUR',
  'BRL',
  'BTC',
  'ETH',
  'BNB',
  'DAI',
] as const;

function splitConcatenated(v: string, quotes: readonly string[]): [string, string] | null {
  const up = v.toUpperCase();
  for (const q of quotes) {
    if (up.length > q.length && up.endsWith(q)) return [up.slice(0, -q.length), q];
  }
  return null;
}

/**
 * Re-quoting a pair changes its price. BTC/USDT and BTC/USD differ by the
 * USDT peg, usually a few basis points but not always, so any venue swap that
 * also changes the quote currency is reported as a proxy.
 */
function requote(sid: SymbolId, targetQuote: string, vendorFmt: (b: string, q: string) => string) {
  const from = sid.quote ?? 'USD';
  const vendor = vendorFmt(sid.base, targetQuote);
  return from === targetQuote
    ? exact(vendor)
    : proxy(vendor, 'quote currency ' + targetQuote + ', not ' + from);
}

export const binanceCodec: SymbolCodec = {
  id: 'binance',
  toVendor(sid): CodecResult | null {
    if (sid.assetClass !== 'crypto') return null;
    return requote(sid, sid.venue === 'BINANCE' ? (sid.quote ?? 'USDT') : 'USDT', (b, q) => b + q);
  },
  fromVendor(vendor): SymbolId | null {
    const parts = splitConcatenated(vendor, BINANCE_QUOTES);
    if (!parts) return null;
    return { assetClass: 'crypto', venue: 'BINANCE', base: parts[0], quote: parts[1] };
  },
};

export const coinbaseCodec: SymbolCodec = {
  id: 'coinbase',
  toVendor(sid): CodecResult | null {
    if (sid.assetClass !== 'crypto') return null;
    return requote(sid, 'USD', (b, q) => b + '-' + q);
  },
  fromVendor(vendor): SymbolId | null {
    const [base, quote] = vendor.toUpperCase().split('-');
    if (!base || !quote) return null;
    return { assetClass: 'crypto', venue: 'COINBASE', base, quote };
  },
};

export const krakenCodec: SymbolCodec = {
  id: 'kraken',
  toVendor(sid): CodecResult | null {
    if (sid.assetClass !== 'crypto') return null;
    return requote(sid, 'USD', (b, q) => b + '/' + q);
  },
  fromVendor(vendor): SymbolId | null {
    const [base, quote] = vendor.toUpperCase().split('/');
    if (!base || !quote) return null;
    return { assetClass: 'crypto', venue: 'KRAKEN', base, quote };
  },
};
