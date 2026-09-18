import { describe, expect, it } from 'vitest';
import {
  displaySymbol,
  formatSid,
  parseSid,
  sidEquals,
  SymbolParseError,
  tryParseSid,
  type SymbolId,
} from './symbol-id';

const CASES: ReadonlyArray<[string, SymbolId]> = [
  [
    'crypto:BINANCE:BTC/USDT',
    { assetClass: 'crypto', venue: 'BINANCE', base: 'BTC', quote: 'USDT' },
  ],
  ['equity:XNAS:AAPL', { assetClass: 'equity', venue: 'XNAS', base: 'AAPL' }],
  ['equity:XIDX:BBCA', { assetClass: 'equity', venue: 'XIDX', base: 'BBCA' }],
  ['fx:OTC:EUR/USD', { assetClass: 'fx', venue: 'OTC', base: 'EUR', quote: 'USD' }],
  [
    'commodity:XCEC:GC@FRONT',
    { assetClass: 'commodity', venue: 'XCEC', base: 'GC', contract: 'FRONT' },
  ],
  ['index:XIDX:COMPOSITE', { assetClass: 'index', venue: 'XIDX', base: 'COMPOSITE' }],
  ['macro:FRED:CPIAUCSL', { assetClass: 'macro', venue: 'FRED', base: 'CPIAUCSL' }],
];

describe('SymbolId', () => {
  it.each(CASES)('parses %s', (str, expected) => {
    expect(parseSid(str)).toEqual(expected);
  });

  it.each(CASES)('round-trips %s', (str) => {
    expect(formatSid(parseSid(str))).toBe(str);
  });

  it('treats identical symbols as equal and different venues as distinct', () => {
    expect(sidEquals(parseSid('equity:XNAS:AAPL'), parseSid('equity:XNAS:AAPL'))).toBe(true);
    // The same ticker on two venues is two instruments, not one.
    expect(sidEquals(parseSid('equity:XNAS:AAPL'), parseSid('equity:XNYS:AAPL'))).toBe(false);
  });

  it.each([
    ['AAPL', 'too few parts'],
    ['equity:XNAS:AAPL:extra', 'too many parts'],
    ['stonks:XNAS:AAPL', 'unknown asset class'],
    ['equity::AAPL', 'empty venue'],
    ['equity:XNAS:', 'empty base'],
    ['fx:OTC:EUR/', 'empty quote'],
  ])('rejects %s (%s)', (bad) => {
    expect(() => parseSid(bad)).toThrow(SymbolParseError);
    expect(tryParseSid(bad)).toBeNull();
  });

  it('renders a compact label for dense UI', () => {
    expect(displaySymbol(parseSid('crypto:BINANCE:BTC/USDT'))).toBe('BTC/USDT');
    expect(displaySymbol(parseSid('equity:XIDX:BBCA'))).toBe('BBCA');
  });
});
