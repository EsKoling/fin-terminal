# fin-terminal

A multi-asset market terminal: crypto, US equities, FX/commodities and Indonesian (IDX)
equities in one keyboard-driven, multi-panel workspace. Portfolio showcase, built entirely
on free-tier data. Current phase: see `docs/ROADMAP.md`.

## Invariants

These are rules, not preferences. A change that breaks one is wrong even if it works.

1. **Every value that crosses the network is `Sourced<T>`.** No bare numbers in DTOs. Use
   `mapSourced` to transform; never unwrap and re-wrap with a fresh `Provenance`, which
   launders the origin.
2. **Never render a stale number as if it were live.** Degrade to an amber chip, a dash, or
   cached-and-labelled. Never a red error screen, never a silent substitution.
3. **`fidelity: 'proxy'` must reach the UI.** If a provider substituted a near-instrument
   (Yahoo `BTC-USD` for Binance `BTC/USDT`, spot `XAU/USD` for COMEX `GC`), say so.
4. **The AI never emits numerals.** It emits `{{token}}` references resolved server-side
   against a fact table. A bare numeral in model output is stripped and logged.
5. **Indicator math lives only in `@ft/quant`.** Chart, backtest and alerts all import it.
   Never reimplement an indicator; the RSI on the chart and the RSI that fires an alert must
   be the same code.
6. **`@ft/contracts` and `@ft/quant` are platform-free.** No `node:*`, no DOM. They run in a
   Web Worker, a browser, and a serverless function. Lint enforces this.
7. **Backtest default fill is `next-open`.** Look-ahead is a test failure, not a preference.
8. **UI components never name a vendor.** Provider identity arrives through `Provenance`.
9. **Hobby-tier discipline.** No sub-daily cron in `vercel.json` (it fails the _deployment_).
   No long-lived WebSocket from a Vercel function (hard-killed at 300s).
10. **Price precision is per asset class.** FX needs 5 decimals, IDR needs 0, crypto scales
    with magnitude. `priceDecimals` in `@ft/ui` owns this; do not format prices by hand.

## Monorepo

npm workspaces + Turborepo. Internal packages ship **raw TypeScript** (no build step) and are
compiled by Next via `transpilePackages`.

| Package           | Owns                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ |
| `@ft/contracts`   | `Sourced<T>`, `Provenance`, `Quote`, `Bar`, `BarSeries`, `Tick`. Zero platform deps. |
| `@ft/symbology`   | `SymbolId`, MIC/venue registry, session windows, per-vendor `SymbolCodec`s.          |
| `@ft/ui`          | Design tokens, `ProvenanceChip`, numeric primitives, formatters.                     |
| `@ft/market-data` | Provider registry, router, circuit breaker, cache tiers, budget ledger.              |
| `@ft/quant`       | Indicators and backtester. Pure, columnar, no platform APIs.                         |
| `@ft/ai`          | LLM provider router, grounding pipeline, screen DSL.                                 |
| `@ft/alerts`      | Rule schema and evaluator.                                                           |
| `apps/web`        | The only deployable.                                                                 |

**Dependency direction** (lint-enforced, see `packages/config/eslint.js`):
`contracts` → nothing · `symbology` → `contracts` · `quant` → `contracts` · `ui` → `contracts`
· `market-data` → `contracts`+`symbology` · `ai`/`alerts` → those four · `web` → everything.

**Relative imports are extensionless** (`./symbol-id`, not `./symbol-id.js`). Webpack does not
apply TypeScript's `.js`→`.ts` mapping to `transpilePackages` sources.

## Symbol identity

```
assetClass ':' venue ':' base [ '/' quote ] [ '@' contract ]

crypto:BINANCE:BTC/USDT   equity:XNAS:AAPL      equity:XIDX:BBCA
fx:OTC:EUR/USD            commodity:XCEC:GC@FRONT   macro:FRED:CPIAUCSL
```

Venue is an ISO 10383 MIC for listed venues, the exchange slug for crypto, `OTC` for FX.
Vendor ticker strings exist **only inside a provider adapter**. Convert with a `SymbolCodec`,
which reports `fidelity`.

## Verified free-tier ceilings (Sept 2026)

Never design past these. Target 70% utilisation to leave headroom for the alerts worker.

| Provider          | Hard limit                          | App ceiling                                              |
| ----------------- | ----------------------------------- | -------------------------------------------------------- |
| Finnhub           | 60/min                              | 40/min                                                   |
| Twelve Data       | 800/day, 8/min                      | 550/day, 5/min - **reference data only, NOT IDX quotes** |
| FRED              | 120/min                             | 60/min                                                   |
| Yahoo             | undocumented                        | 30/min, back off hard on any 401/429                     |
| Alpha Vantage     | **25/day**                          | 15/day, manual refresh only                              |
| SEC EDGAR         | ~10/s                               | 4/s, declared `User-Agent` required                      |
| Binance WS        | 1024 streams/conn                   | 300 conn attempts / 5 min / IP                           |
| Indodax           | undocumented                        | reachable from ID, quotes IDR (proxy)                    |
| Cerebras          | 1M tok/day, 8192 ctx                | bulk work                                                |
| Groq              | 30 RPM, ~100K tok/day               | interactive                                              |
| Gemini Flash-Lite | 15 RPM / 500 RPD                    | structured extraction only                               |
| Gemini Flash      | **20 RPD**                          | effectively unusable                                     |
| Upstash Redis     | 500K cmd/**month**                  | write-coalesce the budget ledger                         |
| Vercel Hobby      | 300s functions, **daily-only cron** | QStash drives the alerts worker                          |

**IDX prices have exactly one free source: Yahoo.** Twelve Data lists all 943 IDX symbols in its
reference data but a quote returns _"available starting with the Pro or Venture plan"_. Never
route an IDX quote to Twelve Data. This also makes the L2 durable bar cache load-bearing rather
than an optimisation: it is the only thing keeping IDX charts alive when Yahoo breaks.

## Crypto venue reachability

Coinbase, Kraken, Bybit, OKX, Bitfinex and Gemini are **unreachable from the development
machine's ISP** (TCP-level block, consistent with Indonesian exchange filtering). Binance's
market-data domains and Indodax work. The failover ladder still needs the foreign venues,
because the WebSocket runs in the _viewer's_ browser and the block inverts abroad, but
Indodax is the rung that lets you test locally. See `docs/DATA-SOURCES.md`.

## Design tokens

Defined once in `packages/ui/src/tokens.css`. Amber is **data emphasis only** — never chrome,
never a button. Every numeral carries `.tabular`. Nothing below 11px (`--text-2xs`). Direction
is signalled by colour _and_ an arrow glyph _and_ a sign, never colour alone.

## Commands

```
npm run dev        # turbo dev
npm run verify     # typecheck + lint + test, the gate for every phase
npm run build
npm run probe      # live provider health probes
```

## Windows notes

- Repo lives at a **space-free path** (`C:\dev\fin-terminal`). Spaces plus nested workspace
  symlinks break npm lifecycle scripts in ways that look unrelated to the cause.
- Hooks are `node scripts/hooks/*.mjs`, never `.sh` or inline shell. Only Node is portable here.
- PowerShell has no `&&`. Use `;` or the Bash tool.

## When a free provider breaks

It will. Yahoo especially. The runbook:

1. `npm run probe` (or `/provider-health`) to confirm which upstream is actually down.
2. Check `docs/PROVIDER_STATUS.md` — it is regenerated daily by CI and injected into every
   session, so the outage may already be known.
3. Trip the breaker in the provider's config rather than deleting the adapter.
4. Verify a fallback exists for every `(assetClass, dataKind)` that provider served. If it is
   the only source for one, that is the bug — add a second before shipping.
5. **Never disable the panel.** Degrade it. The panel showing an amber `cache-only` chip is
   the product working correctly.
