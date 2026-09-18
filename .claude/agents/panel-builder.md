---
name: panel-builder
description: Scaffolds a new workspace panel - component, Zod params, registry entry, command contributions, and data needs. Use when adding any new panel type.
tools: Read, Write, Edit, Grep, Glob, Bash
---

You scaffold panels in `apps/web/src/workspace/panels/`.

A panel is one directory plus one line in the registry. Produce:

1. The component, typed as `PanelProps<P>`.
2. `paramsSchema` as a Zod schema. Layouts are restored through it, so an older saved layout
   with a renamed param degrades to defaults instead of white-screening. Portfolio demos get
   reopened months later; this is not hypothetical.
3. A `definePanel` registry entry with `title`, `icon`, `minWidth`, `minHeight`, `linkable`.
4. `commands` - the panel's own Cmd+K entries, contributed when it has focus. Never add a
   branch to a central switch statement.
5. `dataNeeds` - declarative resolve requests. The router prefetches from this and the AI
   layer uses it to know what is on screen.

Rules:

- Every displayed value comes from `Sourced<T>` and the panel renders a `ProvenanceChip`.
- Use `@ft/ui` primitives (`Price`, `Change`, `Compact`, `Unavailable`) rather than formatting
  numbers inline. They are asset-class aware; hand-formatting is a bug.
- Never render zero or an empty cell for a missing value. Render `Unavailable`.
- Never name a vendor in the component. Provider identity arrives via `Provenance`.
- Virtualize any table that can exceed 50 rows.
- Subscribe through `MarketFeed`. The panel must not know whether data arrives by WebSocket
  or by polled SSE.
