import type { SymbolId } from '../symbol-id';
import { exact, proxy, type CodecResult, type SymbolCodec } from '../codec';

/**
 * Yahoo is the broadest free source we have: it is the only one that covers
 * US equities, IDX, FX and commodities from a single endpoint. It is also
 * unofficial, undocumented, actively rate-limited, and will break. It is
 * therefore never the sole provider for any (assetClass, dataKind) pair.
 *
 * Suffix conventions:
 *   US listings   AAPL          (no suffix)
 *   IDX           BBCA.JK
 *   Singapore     D05.SI
 *   Malaysia      1155.KL
 *   FX            EURUSD=X
 *   Futures       GC=F          (front month)
 *   Crypto        BTC-USD       (USD only, never USDT)
 *   Indices       ^JKSE
 */

const VENUE_SUFFIX: Record<string, string> = {
  XNAS: '',
  XNYS: '',
  ARCX: '',
  XIDX: '.JK',
  XSES: '.SI',
  XKLS: '.KL',
};

const SUFFIX_VENUE: Record<string, string> = {
  JK: 'XIDX',
  SI: 'XSES',
  KL: 'XKLS',
};

const INDEX_TO_YAHOO: Record<string, string> = {
  'XIDX:COMPOSITE': '^JKSE',
  'XIDX:LQ45': '^JKLQ45',
  'XNAS:NDX': '^NDX',
  'XNYS:SPX': '^GSPC',
  'XNYS:DJI': '^DJI',
  'OTC:VIX': '^VIX',
  'OTC:DXY': 'DX-Y.NYB',
};

const YAHOO_TO_INDEX: Record<string, SymbolId> = Object.fromEntries(
  Object.entries(INDEX_TO_YAHOO).map(([sid, y]) => {
    const [venue, base] = sid.split(':') as [string, string];
    return [y, { assetClass: 'index', venue, base } satisfies SymbolId];
  }),
);

export const yahooCodec: SymbolCodec = {
  id: 'yahoo',
  toVendor(sid): CodecResult | null {
    switch (sid.assetClass) {
      case 'equity':
      case 'etf': {
        const suffix = VENUE_SUFFIX[sid.venue];
        return suffix === undefined ? null : exact(sid.base + suffix);
      }
      case 'fx':
        return sid.quote ? exact(sid.base + sid.quote + '=X') : null;
      case 'commodity':
        // Yahoo only exposes the continuous front-month contract.
        return !sid.contract || sid.contract === 'FRONT'
          ? exact(sid.base + '=F')
          : proxy(sid.base + '=F', 'front-month continuous, not contract ' + sid.contract);
      case 'crypto': {
        const from = sid.quote ?? 'USD';
        const vendor = sid.base + '-USD';
        return from === 'USD' ? exact(vendor) : proxy(vendor, 'quote currency USD, not ' + from);
      }
      case 'index': {
        const y = INDEX_TO_YAHOO[sid.venue + ':' + sid.base];
        return y ? exact(y) : null;
      }
      default:
        return null;
    }
  },

  fromVendor(vendor, hint): SymbolId | null {
    const v = vendor.toUpperCase();

    const idx = YAHOO_TO_INDEX[v];
    if (idx) return idx;

    if (v.endsWith('=X')) {
      const pair = v.slice(0, -2);
      if (pair.length !== 6) return null;
      return { assetClass: 'fx', venue: 'OTC', base: pair.slice(0, 3), quote: pair.slice(3) };
    }

    if (v.endsWith('=F')) {
      return {
        assetClass: 'commodity',
        venue: hint?.venue ?? 'XCEC',
        base: v.slice(0, -2),
        contract: 'FRONT',
      };
    }

    if (v.includes('-')) {
      const [base, quote] = v.split('-') as [string, string];
      return { assetClass: 'crypto', venue: hint?.venue ?? 'COINBASE', base, quote };
    }

    const dot = v.lastIndexOf('.');
    if (dot !== -1) {
      const venue = SUFFIX_VENUE[v.slice(dot + 1)];
      if (!venue) return null;
      return { assetClass: hint?.assetClass ?? 'equity', venue, base: v.slice(0, dot) };
    }

    // Bare ticker: a US listing. Which of XNAS/XNYS/ARCX it is cannot be known
    // from the ticker alone, so the hint decides and XNAS is the fallback.
    return { assetClass: hint?.assetClass ?? 'equity', venue: hint?.venue ?? 'XNAS', base: v };
  },
};
