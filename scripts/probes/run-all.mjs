#!/usr/bin/env node
/**
 * Live provider probes.
 *
 * Every data source this project uses is free, and most are unofficial or
 * aggressively rate-limited. Assuming they work is how a demo dies in front of
 * an audience. This script asks each one, right now, and checks not just that
 * it responds but that the response still has the shape the adapter expects -
 * a 200 with a renamed field is worse than a 500, because nothing throws.
 *
 * Output feeds docs/PROVIDER_STATUS.md, which is injected into every Claude
 * Code session.
 */

// Node does not read .env files on its own, so `npm run probe` would report
// UNKNOWN for every keyed provider even with the keys sitting on disk. Load
// .env.local when it is there; in CI it is not, and the keys arrive as Actions
// secrets instead, which the empty catch quietly allows.
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(new URL('../../.env.local', import.meta.url));
  } catch {
    // No .env.local. Fall through to whatever is already in process.env.
  }
}

const UA = process.env.SEC_USER_AGENT ?? 'fin-terminal/0.1 (contact@example.com)';
const TIMEOUT_MS = 10_000;

/** @type {Array<{id:string,needs?:string,url:string,headers?:Record<string,string>,check:(j:unknown)=>string}>} */
const PROBES = [
  {
    id: 'binance',
    url: 'https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT',
    check: (j) => (j?.price ? 'BTCUSDT ' + j.price : 'missing price field'),
  },
  {
    id: 'coinbase',
    url: 'https://api.exchange.coinbase.com/products/BTC-USD/ticker',
    check: (j) => (j?.price ? 'BTC-USD ' + j.price : 'missing price field'),
  },
  {
    id: 'kraken',
    url: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD',
    check: (j) => {
      const k = j?.result && Object.keys(j.result)[0];
      const p = k && j.result[k]?.c?.[0];
      return p ? 'XBTUSD ' + p : 'missing result.c';
    },
  },
  {
    // Indodax is the Bappebti-licensed Indonesian exchange, and the only
    // crypto venue besides Binance reachable from an Indonesian ISP. Quotes
    // are in IDR, so it is a proxy source, not a drop-in for a USD ladder.
    id: 'indodax',
    url: 'https://indodax.com/api/ticker/btcidr',
    check: (j) => (j?.ticker?.last ? 'BTC/IDR ' + j.ticker.last : 'missing ticker.last'),
  },
  {
    id: 'yahoo',
    // The IDX ticker is the important one: it is the symbol Yahoo is least
    // likely to keep serving, and the one with the weakest alternatives.
    url: 'https://query1.finance.yahoo.com/v8/finance/chart/BBCA.JK?interval=1d&range=5d',
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    check: (j) => {
      const r = j?.chart?.result?.[0];
      const px = r?.meta?.regularMarketPrice;
      return px != null ? 'BBCA.JK ' + px + ' ' + (r.meta.currency ?? '') : 'missing chart.result';
    },
  },
  {
    id: 'sec',
    url: 'https://data.sec.gov/submissions/CIK0000320193.json',
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    check: (j) => (j?.cik ? (j.name ?? 'cik ' + j.cik) : 'missing cik field'),
  },
  {
    id: 'finnhub',
    needs: 'FINNHUB_API_KEY',
    url: 'https://finnhub.io/api/v1/quote?symbol=AAPL&token=' + (process.env.FINNHUB_API_KEY ?? ''),
    check: (j) => (typeof j?.c === 'number' && j.c > 0 ? 'AAPL ' + j.c : 'missing or zero c'),
  },
  {
    // Deliberately a US symbol. The free tier lists all 943 IDX symbols in
    // reference data but refuses IDX quotes ("available starting with the Pro
    // or Venture plan"), so probing XIDX would report a sales message forever -
    // and worse, as OK, since it is not a 'missing field' shape failure. Twelve
    // Data is routed for US and reference data only, so probe what we use.
    id: 'twelvedata',
    needs: 'TWELVEDATA_API_KEY',
    url:
      'https://api.twelvedata.com/quote?symbol=AAPL&apikey=' +
      (process.env.TWELVEDATA_API_KEY ?? ''),
    check: (j) => (j?.close ? 'AAPL ' + j.close : (j?.message ?? 'missing close field')),
  },
  {
    id: 'fred',
    needs: 'FRED_API_KEY',
    url:
      'https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&sort_order=desc&limit=1&file_type=json&api_key=' +
      (process.env.FRED_API_KEY ?? ''),
    check: (j) => {
      const o = j?.observations?.[0];
      return o ? 'CPIAUCSL ' + o.date + ' ' + o.value : 'missing observations';
    },
  },
];

async function probe(p) {
  if (p.needs && !process.env[p.needs]) {
    return { id: p.id, state: 'UNKNOWN', detail: 'needs ' + p.needs, ms: 0 };
  }
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(p.url, { headers: p.headers ?? {}, signal: ac.signal });
    const ms = Date.now() - started;
    if (!res.ok) {
      return {
        id: p.id,
        state: res.status === 429 ? 'DEGRADED' : 'TRIPPED',
        detail: 'HTTP ' + res.status,
        ms,
      };
    }
    const detail = p.check(await res.json());
    const shapeOk = !/^missing|^unknown/i.test(detail);
    return {
      id: p.id,
      state: shapeOk ? (ms > 3000 ? 'DEGRADED' : 'OK') : 'DEGRADED',
      detail: shapeOk ? detail + ', ' + ms + 'ms' : 'shape changed: ' + detail,
      ms,
    };
  } catch (err) {
    return {
      id: p.id,
      state: 'TRIPPED',
      detail:
        err?.name === 'AbortError' ? 'timeout' : (err?.cause?.code ?? err?.message ?? 'failed'),
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = await Promise.all(PROBES.map(probe));

const pad = (s, n) => String(s).padEnd(n);
for (const r of results) {
  console.log(pad(r.id, 12) + pad(r.state, 10) + r.detail);
}

const rows = results
  .map((r) => '| `' + r.id + '` | ' + r.state + ' | ' + r.detail + ' |')
  .join('\n');
const md = `# Provider status

Regenerated by \`.github/workflows/provider-health.yml\` (daily) and by \`npm run probe\`.
A digest of this table is injected into every Claude Code session by
\`scripts/hooks/inject-context.mjs\`, so the agent always knows what is broken.

States: \`OK\` · \`DEGRADED\` (slow, throttled or shape-changed) · \`TRIPPED\` (unreachable) · \`UNKNOWN\` (no key)

| provider | state | detail |
|---|---|---|
${rows}

_Generated: ${new Date().toISOString()}_
`;

if (process.env.FT_PROBE_WRITE !== '0') {
  const { writeFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  writeFileSync(join(repo, 'docs', 'PROVIDER_STATUS.md'), md, 'utf8');
  console.log('\nWrote docs/PROVIDER_STATUS.md');
}

// A missing optional key is not a failure; an unreachable keyless endpoint is.
const hardFail = results.some((r) => r.state === 'TRIPPED');
process.exit(hardFail ? 1 : 0);
