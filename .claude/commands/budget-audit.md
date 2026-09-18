---
description: Project daily free-tier consumption per provider and flag anything over 70%
---

Audit projected free-tier consumption against the verified ceilings in `CLAUDE.md`.

1. Read every provider's declared `RateBudget` and `CapabilityMatrix` in
   `packages/market-data/src/providers/`.
2. Read the routing table and the polling cadences in `@ft/symbology` session logic.
3. Estimate calls per day per provider for a realistic session: four preset workspaces, about
   40 watchlist symbols, both the US and IDX sessions open at some point in the day, plus the
   alerts worker ticking on its QStash schedule.
4. Compare against the hard limits. **Flag anything projected above 70%.**

Twelve Data at 800 credits/day and Upstash at 500K commands/month are the two that bind
first. Alpha Vantage at 25/day is already a rounding error and must never be on a hot path.

Report a table of provider, projected/day, ceiling, percentage, and a verdict. For anything
over budget, propose the specific fix: a longer TTL, a coarser cadence, a batch, or moving
the data to the L2 Neon store where it only needs fetching once.
