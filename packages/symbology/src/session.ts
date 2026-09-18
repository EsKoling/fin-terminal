import { resolveVenue, type Venue } from './venues';

/**
 * Market-hours awareness, which exists here for one concrete reason: polling
 * cadence. Quoting a closed venue every 5 seconds burns free-tier quota to
 * re-fetch a number that cannot change.
 *
 * Uses Intl for timezone conversion rather than a date library, so this stays
 * dependency-free and runs unchanged in a worker, a browser, and a function.
 *
 * Deliberately does NOT model exchange holidays. Getting those right for four
 * markets needs a maintained calendar feed we do not have on a free tier, and
 * being wrong about a holiday costs us only a few wasted polls. The alternative
 * (a stale hardcoded holiday table) would be quietly wrong instead of openly
 * approximate, which is worse.
 */

export type VenueState = 'open' | 'pre' | 'post' | 'closed';

/** Minutes before the first session that count as pre-market. */
const PRE_WINDOW_MIN = 90;
/** Minutes after the last session that count as post-market. */
const POST_WINDOW_MIN = 120;

interface LocalTime {
  /** ISO weekday, 0 = Sunday. */
  readonly weekday: number;
  /** Minutes since local midnight. */
  readonly minutes: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    formatterCache.set(tz, f);
  }
  return f;
}

export function localTimeAt(tz: string, at: Date): LocalTime {
  const parts = formatterFor(tz).formatToParts(at);
  let weekday = 0;
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === 'weekday') weekday = WEEKDAY_INDEX[p.value] ?? 0;
    else if (p.type === 'hour') hour = Number(p.value) % 24;
    else if (p.type === 'minute') minute = Number(p.value);
  }
  return { weekday, minutes: hour * 60 + minute };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/** True when `minutes` falls inside a session, handling overnight windows. */
function inWindow(minutes: number, openMin: number, closeMin: number): boolean {
  return openMin <= closeMin
    ? minutes >= openMin && minutes < closeMin
    : minutes >= openMin || minutes < closeMin;
}

export function venueStateFor(venue: Venue, at: Date = new Date()): VenueState {
  // No sessions means continuous trading on its trading days: crypto and FX.
  const { weekday, minutes } = localTimeAt(venue.tz, at);
  const tradesToday = venue.days.includes(weekday);

  if (venue.sessions.length === 0) return tradesToday ? 'open' : 'closed';
  if (!tradesToday) return 'closed';

  for (const s of venue.sessions) {
    if (inWindow(minutes, toMinutes(s.open), toMinutes(s.close))) return 'open';
  }

  const firstOpen = toMinutes(venue.sessions[0]!.open);
  const lastClose = toMinutes(venue.sessions[venue.sessions.length - 1]!.close);

  if (minutes >= firstOpen - PRE_WINDOW_MIN && minutes < firstOpen) return 'pre';
  if (minutes >= lastClose && minutes < lastClose + POST_WINDOW_MIN) return 'post';
  // Between two sessions (a lunch break) reads as post: the venue is live
  // today but not trading right now, so a slow poll is the right behaviour.
  if (minutes >= firstOpen && minutes < lastClose) return 'post';
  return 'closed';
}

export function venueState(mic: string, at: Date = new Date()): VenueState {
  const v = resolveVenue(mic);
  return v ? venueStateFor(v, at) : 'closed';
}

/** Polling interval for a venue in its current state. */
export const CADENCE_MS: Record<VenueState, number> = {
  open: 5_000,
  pre: 60_000,
  post: 60_000,
  closed: 300_000,
};

export function pollCadenceMs(mic: string, at: Date = new Date()): number {
  return CADENCE_MS[venueState(mic, at)];
}

/**
 * The cadence for a mixed set of venues: the fastest any of them needs. A
 * watchlist holding BTC and AAPL polls at crypto speed, which is correct,
 * because the BTC row genuinely changes every second.
 */
export function cadenceForVenues(mics: readonly string[], at: Date = new Date()): number {
  if (mics.length === 0) return CADENCE_MS.closed;
  return Math.min(...mics.map((m) => pollCadenceMs(m, at)));
}
