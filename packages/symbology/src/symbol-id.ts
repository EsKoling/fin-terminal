import { ASSET_CLASSES, type AssetClass } from '@ft/contracts';

/**
 * One symbol identity for the whole application.
 *
 * Four asset classes across six vendors means six incompatible ticker
 * conventions: Binance wants BTCUSDT, Yahoo wants BBCA.JK and EURUSD=X and
 * GC=F, Finnhub wants OANDA:EUR_USD. If vendor strings leak past the provider
 * boundary, every panel, cache key, and alert rule inherits that mess.
 *
 * So: exactly one canonical form lives in the app, vendor strings exist only
 * inside an adapter, and conversion goes through a SymbolCodec that reports
 * whether it was able to be exact.
 *
 * Canonical string grammar:
 *
 *     assetClass ':' venue ':' base [ '/' quote ] [ '@' contract ]
 *
 *     crypto:BINANCE:BTC/USDT
 *     equity:XNAS:AAPL
 *     equity:XIDX:BBCA
 *     fx:OTC:EUR/USD
 *     commodity:COMEX:GC@FRONT
 *     index:XIDX:COMPOSITE
 *     macro:FRED:CPIAUCSL
 *
 * The venue axis uses ISO 10383 MIC codes for listed venues, the exchange slug
 * for crypto (which has no MIC), and OTC for FX.
 */
export interface SymbolId {
  readonly assetClass: AssetClass;
  /** MIC for listed venues, exchange slug for crypto, OTC for FX. */
  readonly venue: string;
  /** AAPL | BBCA | BTC | EUR | GC */
  readonly base: string;
  /** Crypto and FX only. USDT | USD. */
  readonly quote?: string;
  /** Futures only. FRONT | 2026Z. */
  readonly contract?: string;
}

const ASSET_CLASS_SET = new Set<string>(ASSET_CLASSES);

/** Characters allowed in a venue or ticker component. */
const COMPONENT = /^[A-Z0-9][A-Z0-9._-]*$/;

export class SymbolParseError extends Error {
  constructor(
    readonly input: string,
    reason: string,
  ) {
    super('Invalid SymbolId "' + input + '": ' + reason);
    this.name = 'SymbolParseError';
  }
}

/**
 * Render a SymbolId to its canonical string. Stable, sortable, and URL-safe,
 * which matters because this string is also the cache key, the layout
 * persistence key, and the alert-rule foreign key.
 */
export function formatSid(s: SymbolId): string {
  let tail = s.base;
  if (s.quote) tail += '/' + s.quote;
  if (s.contract) tail += '@' + s.contract;
  return s.assetClass + ':' + s.venue + ':' + tail;
}

/** Parse a canonical string. Throws SymbolParseError on anything malformed. */
export function parseSid(input: string): SymbolId {
  const parts = input.split(':');
  if (parts.length !== 3) {
    throw new SymbolParseError(input, 'expected 3 colon-separated parts, got ' + parts.length);
  }
  const [assetClass, venue, tail] = parts as [string, string, string];

  if (!ASSET_CLASS_SET.has(assetClass)) {
    throw new SymbolParseError(input, 'unknown asset class "' + assetClass + '"');
  }
  if (!COMPONENT.test(venue)) {
    throw new SymbolParseError(input, 'malformed venue "' + venue + '"');
  }

  let rest = tail;
  let contract: string | undefined;
  const at = rest.indexOf('@');
  if (at !== -1) {
    contract = rest.slice(at + 1);
    rest = rest.slice(0, at);
    if (!COMPONENT.test(contract)) {
      throw new SymbolParseError(input, 'malformed contract "' + contract + '"');
    }
  }

  let quote: string | undefined;
  const slash = rest.indexOf('/');
  if (slash !== -1) {
    quote = rest.slice(slash + 1);
    rest = rest.slice(0, slash);
    if (!COMPONENT.test(quote)) {
      throw new SymbolParseError(input, 'malformed quote currency "' + quote + '"');
    }
  }

  if (!COMPONENT.test(rest)) {
    throw new SymbolParseError(input, 'malformed base "' + rest + '"');
  }

  return {
    assetClass: assetClass as AssetClass,
    venue,
    base: rest,
    ...(quote !== undefined ? { quote } : {}),
    ...(contract !== undefined ? { contract } : {}),
  };
}

/** Non-throwing parse, for untrusted input such as a restored layout. */
export function tryParseSid(input: string): SymbolId | null {
  try {
    return parseSid(input);
  } catch {
    return null;
  }
}

export function sidEquals(a: SymbolId, b: SymbolId): boolean {
  return (
    a.assetClass === b.assetClass &&
    a.venue === b.venue &&
    a.base === b.base &&
    a.quote === b.quote &&
    a.contract === b.contract
  );
}

/** A short label for dense UI, e.g. BTC/USDT, BBCA, EUR/USD. */
export function displaySymbol(s: SymbolId): string {
  return s.quote ? s.base + '/' + s.quote : s.base;
}

/** A disambiguating label for lists, e.g. "BBCA · XIDX". */
export function displayWithVenue(s: SymbolId): string {
  return displaySymbol(s) + ' · ' + s.venue;
}

export function isCryptoLike(s: SymbolId): boolean {
  return s.assetClass === 'crypto';
}

export function isEquityLike(s: SymbolId): boolean {
  return s.assetClass === 'equity' || s.assetClass === 'etf';
}
