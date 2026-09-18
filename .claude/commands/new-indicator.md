---
description: Implement a technical indicator with both APIs and the equivalence test
argument-hint: <indicator-name>
---

Use the `quant-indicator` agent to implement `$1` in `@ft/quant`.

Both the vectorized and incremental paths are required, along with the equivalence test over
5000 random bars at 1e-9 tolerance and a golden-value fixture. Do not report done until both
are green.
