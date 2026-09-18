import type { AssetClass } from '@ft/contracts';

/**
 * Venue registry.
 *
 * The venue axis of a SymbolId uses ISO 10383 MIC codes where one exists, the
 * exchange slug for crypto (which has no MIC), and OTC for FX.
 *
 * Sessions are not decoration. Polling cadence is derived from them: 5s while
 * the relevant venue is open, 60s pre/post, 300s closed. IDX and the US
 * sessions barely overlap, so a naive uniform 5s poll would burn roughly four
 * times the necessary free-tier budget for no benefit.
 */

export interface Session {
  /** Local venue time, 24h "HH:MM". */
  readonly open: string;
  readonly close: string;
}

export interface Venue {
  readonly mic: string;
  readonly name: string;
  readonly country: string;
  /** IANA timezone. Sessions are expressed in this zone. */
  readonly tz: string;
  readonly currency: string;
  readonly assetClasses: readonly AssetClass[];
  /** ISO weekdays the venue trades. 1 = Monday. */
  readonly days: readonly number[];
  /** Empty means always open. */
  readonly sessions: readonly Session[];
}

const WEEKDAYS = [1, 2, 3, 4, 5] as const;

export const VENUES: Record<string, Venue> = {
  XNAS: {
    mic: 'XNAS',
    name: 'Nasdaq',
    country: 'US',
    tz: 'America/New_York',
    currency: 'USD',
    assetClasses: ['equity', 'etf'],
    days: WEEKDAYS,
    sessions: [{ open: '09:30', close: '16:00' }],
  },
  XNYS: {
    mic: 'XNYS',
    name: 'New York Stock Exchange',
    country: 'US',
    tz: 'America/New_York',
    currency: 'USD',
    assetClasses: ['equity', 'etf'],
    days: WEEKDAYS,
    sessions: [{ open: '09:30', close: '16:00' }],
  },
  ARCX: {
    mic: 'ARCX',
    name: 'NYSE Arca',
    country: 'US',
    tz: 'America/New_York',
    currency: 'USD',
    assetClasses: ['etf'],
    days: WEEKDAYS,
    sessions: [{ open: '09:30', close: '16:00' }],
  },
  XIDX: {
    mic: 'XIDX',
    name: 'Indonesia Stock Exchange',
    country: 'ID',
    tz: 'Asia/Jakarta',
    currency: 'IDR',
    assetClasses: ['equity', 'etf', 'index'],
    days: WEEKDAYS,
    // IDX breaks for lunch. Modelling both sessions keeps the polling cadence
    // honest rather than paying for quotes during a 2-hour halt.
    sessions: [
      { open: '09:00', close: '11:30' },
      { open: '13:30', close: '15:50' },
    ],
  },
  XSES: {
    mic: 'XSES',
    name: 'Singapore Exchange',
    country: 'SG',
    tz: 'Asia/Singapore',
    currency: 'SGD',
    assetClasses: ['equity', 'etf', 'index'],
    days: WEEKDAYS,
    sessions: [
      { open: '09:00', close: '12:00' },
      { open: '13:00', close: '17:00' },
    ],
  },
  XKLS: {
    mic: 'XKLS',
    name: 'Bursa Malaysia',
    country: 'MY',
    tz: 'Asia/Kuala_Lumpur',
    currency: 'MYR',
    assetClasses: ['equity', 'etf', 'index'],
    days: WEEKDAYS,
    sessions: [
      { open: '09:00', close: '12:30' },
      { open: '14:30', close: '17:00' },
    ],
  },
  XCEC: {
    mic: 'XCEC',
    name: 'COMEX',
    country: 'US',
    tz: 'America/New_York',
    currency: 'USD',
    assetClasses: ['commodity'],
    days: WEEKDAYS,
    sessions: [{ open: '18:00', close: '17:00' }],
  },
  XNYM: {
    mic: 'XNYM',
    name: 'NYMEX',
    country: 'US',
    tz: 'America/New_York',
    currency: 'USD',
    assetClasses: ['commodity'],
    days: WEEKDAYS,
    sessions: [{ open: '18:00', close: '17:00' }],
  },
  XCBT: {
    mic: 'XCBT',
    name: 'Chicago Board of Trade',
    country: 'US',
    tz: 'America/Chicago',
    currency: 'USD',
    assetClasses: ['commodity'],
    days: WEEKDAYS,
    sessions: [{ open: '19:00', close: '13:20' }],
  },
  OTC: {
    mic: 'OTC',
    name: 'Interbank FX',
    country: 'XX',
    tz: 'UTC',
    currency: 'USD',
    assetClasses: ['fx'],
    // FX runs continuously from Sunday evening to Friday evening ET. Modelled
    // as weekdays-always-open, which is accurate enough for polling cadence.
    days: [0, 1, 2, 3, 4, 5],
    sessions: [],
  },
  FRED: {
    mic: 'FRED',
    name: 'Federal Reserve Economic Data',
    country: 'US',
    tz: 'America/Chicago',
    currency: 'USD',
    assetClasses: ['macro'],
    days: WEEKDAYS,
    sessions: [],
  },
  BINANCE: {
    mic: 'BINANCE',
    name: 'Binance',
    country: 'XX',
    tz: 'UTC',
    currency: 'USDT',
    assetClasses: ['crypto'],
    days: [0, 1, 2, 3, 4, 5, 6],
    sessions: [],
  },
  COINBASE: {
    mic: 'COINBASE',
    name: 'Coinbase',
    country: 'US',
    tz: 'UTC',
    currency: 'USD',
    assetClasses: ['crypto'],
    days: [0, 1, 2, 3, 4, 5, 6],
    sessions: [],
  },
  KRAKEN: {
    mic: 'KRAKEN',
    name: 'Kraken',
    country: 'US',
    tz: 'UTC',
    currency: 'USD',
    assetClasses: ['crypto'],
    days: [0, 1, 2, 3, 4, 5, 6],
    sessions: [],
  },
};

/**
 * Friendly names people actually type, mapped to the canonical venue key.
 * The Bloomberg-style command line accepts the right-hand column.
 */
export const VENUE_ALIASES: Record<string, string> = {
  COMEX: 'XCEC',
  NYMEX: 'XNYM',
  CBOT: 'XCBT',
  NASDAQ: 'XNAS',
  NYSE: 'XNYS',
  ARCA: 'ARCX',
  IDX: 'XIDX',
  JKT: 'XIDX',
  SGX: 'XSES',
  KLSE: 'XKLS',
  FX: 'OTC',
  FOREX: 'OTC',
};

/** Two-letter country codes as used by the Bloomberg command grammar. */
export const COUNTRY_TO_VENUES: Record<string, readonly string[]> = {
  US: ['XNAS', 'XNYS', 'ARCX'],
  IJ: ['XIDX'],
  ID: ['XIDX'],
  SP: ['XSES'],
  MK: ['XKLS'],
};

export function resolveVenue(input: string): Venue | undefined {
  const key = input.toUpperCase();
  return VENUES[key] ?? VENUES[VENUE_ALIASES[key] ?? ''];
}

export function venueCurrency(mic: string): string | undefined {
  return resolveVenue(mic)?.currency;
}
