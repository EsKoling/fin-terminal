---
description: Add or repair a market-data provider adapter
argument-hint: <vendor-name>
---

Use the `market-data-adapter` agent to add or repair the `$1` provider adapter.

Start by WebFetching the vendor's current API documentation - free-tier terms change often
enough that training data cannot be trusted here. Confirm the endpoint, auth, exact rate
limits and response shape before writing any code.

The adapter must pass `packages/market-data/src/__contract__/suite.ts` before you report done,
and it must not become the sole source for any (assetClass, dataKind) pair.
