import type { ProviderId } from '@ft/contracts';
import type { SymbolCodec } from '../codec';
import { binanceCodec, coinbaseCodec, krakenCodec } from './crypto';
import { yahooCodec } from './yahoo';
import { finnhubCodec, fredCodec, twelveDataCodec } from './keyed';

export {
  binanceCodec,
  coinbaseCodec,
  krakenCodec,
  yahooCodec,
  finnhubCodec,
  twelveDataCodec,
  fredCodec,
};

export const CODECS: Partial<Record<ProviderId, SymbolCodec>> = {
  binance: binanceCodec,
  coinbase: coinbaseCodec,
  kraken: krakenCodec,
  yahoo: yahooCodec,
  finnhub: finnhubCodec,
  twelvedata: twelveDataCodec,
  fred: fredCodec,
};

export function codecFor(provider: ProviderId): SymbolCodec | undefined {
  return CODECS[provider];
}
