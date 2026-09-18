# Roadmap

Gate for every phase: `npm run verify` green.

## Phase 0 — Foundations

- [x] Repo at a space-free path, git, npm workspaces + Turborepo
- [x] `@ft/contracts` — `Sourced<T>`, `Provenance`, `Quote`, `Bar`, `BarSeries`, `Tick`
- [x] `@ft/symbology` — `SymbolId`, MIC/venue registry, sessions, six vendor codecs
- [x] `@ft/ui` — design tokens, `ProvenanceChip`, numeric primitives
- [x] Next.js 15 shell, builds clean
- [x] Claude Code agents, hooks, commands
- [x] Live provider probes; reachability findings in `docs/DATA-SOURCES.md`
- [ ] Deployed to Vercel on a public URL **(needs your Vercel account)**
- [ ] Public GitHub repo + CI green **(needs `gh` installed, or create it in the browser)**

## Phase 1 — The hero workspace

- [ ] `@ft/market-data`: registry, capability matrix, router scoring, circuit breaker
- [ ] Budget ledger with write-coalescing, L0 LRU / L1 Redis / L2 Neon cache tiers
- [ ] Crypto WS ladder: Binance to Coinbase to Kraken, 2.5s probe timeout
- [ ] Yahoo adapter: server-only, single-flight coalescer, Redis crumb jar
- [ ] Finnhub and Twelve Data adapters
- [ ] SSE multiplexer at `/api/stream`, self-closing at 280s
- [ ] `MarketFeed` unifying WS and SSE, client-side `BarAggregator`
- [ ] Dockview workspace, panel registry, link groups, IndexedDB persistence
- [ ] Panels: Chart, Watchlist, Quote/Detail, Time and Sales
- [ ] Cmd+K palette: fuzzy search plus the Bloomberg command grammar
- [ ] Four seeded preset workspaces
- [ ] `?chaos=<provider>` flag to force-trip a breaker on demand

**Gate — the hero moment.** Press Cmd+K, type `BBCA IJ Equity GP`, hit Enter: the whole
linked workspace retargets to an Indonesian bank in one motion while a Binance BTC panel
ticks live beside it and every panel wears an honest provenance chip.

Do not start Phase 2 until that is genuinely beautiful.

## Phase 2 — Quant engine and chart depth

## Phase 3 — AI layer

## Phase 4 — Alerts and backtesting

## Phase 5 — Polish and the pitch

See the approved plan for the full breakdown.
