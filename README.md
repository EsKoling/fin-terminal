# fin-terminal

A multi-asset market terminal: crypto, US equities, FX and commodities, and Indonesian (IDX)
equities in one keyboard-driven, multi-panel workspace. TradingView-grade charting with a
Bloomberg-style command line, built entirely on free-tier data.

> Demo project. Delayed and approximate data. Not investment advice.

## The constraint, and why it shaped everything

Every data source here is free. Free financial data is fragmented, rate-limited, and
unreliable: Yahoo's endpoints are unofficial and actively defended, Alpha Vantage fell from
500 requests a day to 25, and Google's Gemini free tier collapsed to roughly 20 requests a
day while this was being planned.

So the architecture treats source fragility as the primary design problem rather than an
afterthought:

- **Every value carries its provenance.** `Sourced<T>` wraps everything that crosses the
  network with the provider, the timestamp, the latency class, whether the symbol match was
  exact or a proxy, and whether it is stale. Nothing renders a number without that in scope.
- **Providers are interchangeable.** A capability matrix plus a scoring function picks a
  chain per request; a circuit breaker drops a failing source and the next one takes over.
- **Degradation is visible, never silent.** When a provider dies the chip turns amber and
  says `cache-only`. The app never shows a stale number as if it were live, and never shows
  a red error screen.

Swapping a vendor is one adapter file and one routing-table line. Given a verified pattern of
free tiers degrading, that is not speculative generality; it is the load-bearing response.

## Stack

Next.js 15 · TypeScript · Tailwind v4 · lightweight-charts v5 · dockview · npm workspaces +
Turborepo. Deploys to Vercel Hobby.

| Package         | Owns                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `@ft/contracts` | `Sourced<T>`, `Provenance`, `Quote`, `Bar`, `BarSeries`. Platform-free. |
| `@ft/symbology` | `SymbolId`, MIC/venue registry, session windows, per-vendor codecs.     |
| `@ft/ui`        | Design tokens, `ProvenanceChip`, asset-class-aware numeric primitives.  |
| `apps/web`      | The only deployable.                                                    |

`@ft/market-data`, `@ft/quant`, `@ft/ai` and `@ft/alerts` land in later phases.

## Getting started

```bash
npm install
cp .env.example .env.local     # every key is optional; the app degrades without them
npm run dev
npm run verify                 # typecheck + lint + test
npm run probe                  # live provider health, rewrites docs/PROVIDER_STATUS.md
```

The repo must live at a **space-free path** such as `C:\dev\fin-terminal`. Spaces plus nested
workspace symlinks break npm lifecycle scripts on Windows in ways that look unrelated.

## Data sources

All free tier. Binance, Coinbase, Kraken and SEC EDGAR need no key at all.

| Source                         | Covers                          | Free limit            |
| ------------------------------ | ------------------------------- | --------------------- |
| Binance / Coinbase / Kraken WS | Crypto, real-time               | Unlimited, no key     |
| Finnhub                        | US equities, news, fundamentals | 60 calls/min          |
| Twelve Data                    | IDX, FX, equities               | 800 credits/day       |
| Yahoo                          | Everything, 15-min delayed      | Undocumented, fragile |
| FRED                           | Macro series                    | 120 req/min           |
| SEC EDGAR                      | Filings, XBRL                   | No key, UA required   |

See `docs/DATA-SOURCES.md` for live reachability results, including which exchanges are
blocked from an Indonesian ISP and what that means for the failover ladder.

## Agent tooling

The repo is set up to build itself. `.claude/` carries seven specialist subagents (the most
useful being `finance-correctness-reviewer`, which hunts look-ahead bias, timezone errors and
adjustment bugs), plus hooks that inject live provider health into every prompt, block
secrets and destructive commands, and run the verification gate before finishing a turn.

## Status

Phase 0 complete. See `docs/ROADMAP.md`.
