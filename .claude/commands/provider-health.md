---
description: Probe every upstream live and refresh docs/PROVIDER_STATUS.md
---

Use the `provider-health-auditor` agent to probe every configured data provider right now
and rewrite `docs/PROVIDER_STATUS.md`.

Report which providers changed state since the last run, which capabilities are currently
unavailable, and which fallback is covering each gap.
