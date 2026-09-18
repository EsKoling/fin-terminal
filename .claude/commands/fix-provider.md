---
description: Diagnose and repair a failing data provider
argument-hint: <provider-id>
---

The `$1` provider is failing. Work through this in order:

1. Run `npm run probe` to see the current live behaviour. Do not rely on `PROVIDER_STATUS.md`
   alone; it may be up to a day stale.
2. WebFetch the vendor's status page and changelog. Free providers change auth schemes,
   rename fields, and tighten limits without notice.
3. Classify the failure: rate limit, auth, shape change, or transport. The circuit breaker
   treats these differently, and so should the fix.
4. Use the `market-data-adapter` agent to patch the adapter.
5. Confirm every `(assetClass, dataKind)` this provider served still has a working route. If
   it was the only source for one, that is the real bug - add a fallback.
6. Update `docs/PROVIDER_STATUS.md`.

Never disable the panel. Degrade it. A panel showing an amber cache-only chip is the product
working correctly.
