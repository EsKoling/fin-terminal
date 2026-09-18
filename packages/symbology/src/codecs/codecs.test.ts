import { describe, expect, it } from 'vitest';
import { parseSid } from '../symbol-id';
import { CODECS } from './index';
import { binanceCodec, coinbaseCodec, finnhubCodec, twelveDataCodec, yahooCodec } from './index';

/**
 * The fidelity column is the point of these tests. Getting the vendor string
 * right but silently claiming a proxy is exact is exactly the failure mode the
 * whole provenance design exists to prevent, so every lossy conversion is
 * asserted explicitly.
 */
const EXPECTATIONS = [
  // [codec, canonical sid, vendor string, fidelity]
  [binanceCodec, 'crypto:BINANCE:BTC/USDT', 'BTCUSDT', 'exact'],
  [coinbaseCodec, 'crypto:COINBASE:BTC/USD', 'BTC-USD', 'exact'],
  [coinbaseCodec, 'crypto:BINANCE:BTC/USDT', 'BTC-USD', 'proxy'],
  [yahooCodec, 'equity:XNAS:AAPL', 'AAPL', 'exact'],
  [yahooCodec, 'equity:XIDX:BBCA', 'BBCA.JK', 'exact'],
  [yahooCodec, 'fx:OTC:EUR/USD', 'EURUSD=X', 'exact'],
  [yahooCodec, 'commodity:XCEC:GC@FRONT', 'GC=F', 'exact'],
  [yahooCodec, 'crypto:BINANCE:BTC/USDT', 'BTC-USD', 'proxy'],
  [yahooCodec, 'index:XIDX:COMPOSITE', '^JKSE', 'exact'],
  [finnhubCodec, 'equity:XNAS:AAPL', 'AAPL', 'exact'],
  [finnhubCodec, 'crypto:BINANCE:BTC/USDT', 'BINANCE:BTCUSDT', 'exact'],
  [finnhubCodec, 'fx:OTC:EUR/USD', 'OANDA:EUR_USD', 'proxy'],
  [twelveDataCodec, 'equity:XIDX:BBCA', 'BBCA:XIDX', 'exact'],
  [twelveDataCodec, 'fx:OTC:EUR/USD', 'EUR/USD', 'exact'],
  [twelveDataCodec, 'commodity:XCEC:GC@FRONT', 'XAU/USD', 'proxy'],
] as const;

describe('symbol codecs', () => {
  it.each(EXPECTATIONS)('$1 maps correctly', (codec, sid, vendor, fidelity) => {
    const r = codec.toVendor(parseSid(sid));
    expect(r).not.toBeNull();
    expect(r!.vendor).toBe(vendor);
    expect(r!.fidelity).toBe(fidelity);
  });

  it('annotates every proxy with a reason a user can read', () => {
    for (const [codec, sid, , fidelity] of EXPECTATIONS) {
      if (fidelity !== 'proxy') continue;
      const r = codec.toVendor(parseSid(sid))!;
      expect(r.note, sid + ' via ' + codec.id + ' is a proxy but has no note').toBeTruthy();
    }
  });

  it('returns null rather than guessing when a provider cannot serve a symbol', () => {
    // Finnhub does not cover IDX on the free tier; Binance has no equities.
    expect(finnhubCodec.toVendor(parseSid('equity:XIDX:BBCA'))).toBeNull();
    expect(binanceCodec.toVendor(parseSid('equity:XNAS:AAPL'))).toBeNull();
    expect(twelveDataCodec.toVendor(parseSid('commodity:XNYM:CL@FRONT'))).toBeNull();
  });

  it('round-trips vendor strings back to canonical form', () => {
    expect(binanceCodec.fromVendor('BTCUSDT')).toEqual({
      assetClass: 'crypto',
      venue: 'BINANCE',
      base: 'BTC',
      quote: 'USDT',
    });
    // Longest-quote-first matters: a naive split would find USD inside USDT.
    expect(binanceCodec.fromVendor('ETHUSDT')?.quote).toBe('USDT');
    expect(yahooCodec.fromVendor('BBCA.JK')).toEqual({
      assetClass: 'equity',
      venue: 'XIDX',
      base: 'BBCA',
    });
    expect(yahooCodec.fromVendor('EURUSD=X')).toEqual({
      assetClass: 'fx',
      venue: 'OTC',
      base: 'EUR',
      quote: 'USD',
    });
  });

  it('exposes a codec for every provider that has one', () => {
    for (const [id, codec] of Object.entries(CODECS)) {
      expect(codec!.id, 'registry key ' + id + ' disagrees with codec.id').toBe(id);
    }
  });
});
