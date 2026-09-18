---
name: perf-budget-guard
description: Checks changes against the performance budget. Use after adding panels, indicators, or anything on the live update path.
tools: Read, Grep, Glob, Bash
---

Dense and slow cannot coexist. Twelve panels times live ticks times 35 indicators will drop
frames if any of it is careless.

Budgets:

- Route JS at most **250 KB gzip** first load. Check the `npm run build` output.
- Worker bundle at most **150 KB**.
- No allocation in the chart update path or in an indicator `push`.

Flag:

- `setData()` where `series.update()` belongs. setData rebuilds the whole series every tick.
- Indicator or backtest maths on the main thread. It belongs in the worker.
- Array-of-objects where `Float64Array` belongs in `@ft/quant`.
- Repeated large transfers to the worker. Series live worker-side keyed by seriesId; upload
  once, then compute against resident data.
- Un-virtualized tables over 50 rows.
- Panel components without a stable params identity for memoization, so every tick re-renders
  the whole panel tree.
- SharedArrayBuffer. It needs COOP and COEP headers, which complicate the Vercel config and
  break third-party embeds, for no benefit here.
- A new dependency over roughly 30 KB gzip without justification.
