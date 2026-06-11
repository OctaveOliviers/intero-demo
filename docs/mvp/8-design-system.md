# Design System

This is the **single source of visual truth** for the product. Every color, shape, size,
font, and icon comes from here. Nothing in a component hard-codes a raw value that a token
covers. This is the "one standard template for colors, shapes, fonts that everything
references" the team set out to build.

The token set below originated in the demo's design system
([`docs/demo/DESIGN-SYSTEM.md`](../demo/DESIGN-SYSTEM.md), ChatGPT-calm, near-monochrome);
this doc is the **canonical product version**. The reference look stays the same: calm,
neutral, hairline borders, one restrained accent reserved for interactive/traceable
affordances, and one consistent family of monochrome line icons.

---

## Principles

1. **Tokens, never raw values.** Every component references `var(--…)`. No scattered hex,
   no ad-hoc px a token already covers.
2. **One accent, neutral everything else.** The blue accent is reserved for *interactive /
   traceable* affordances (links, clickable cells, focus). Everything else is neutral gray.
3. **One icon set.** Simple monochrome line icons (Lucide/Heroicons-style, ~1.75px stroke),
   uniform size, drawn in `currentColor`. **No colored emojis, no ad-hoc Unicode arrows.**
   One shared `Icon.svelte`.
4. **Consistency over cleverness.** Same radius, border, shadow, button shape, icon size
   everywhere. If two things do the same job, they look identical.
5. **Subtraction.** If an element carries no information or action, cut it.

---

## Tokens

Live in `:root` in [`app/src/app.css`](../../app/src/app.css). Every component references
them.

```css
:root {
  /* Neutrals */
  --color-bg:#ffffff; --color-sidebar:#f9f9f9; --color-surface:#ffffff;
  --color-surface-muted:#f4f4f4; --color-hover:#ececec;
  --color-border:#e3e3e3; --color-border-strong:#d4d4d4;
  /* Text */
  --color-text:#0d0d0d; --color-text-secondary:#5d5d5d;
  --color-text-muted:#8f8f8f; --color-text-faint:#b4b4b4;
  /* Primary action */
  --color-primary:#0d0d0d; --color-primary-hover:#2f2f2f; --color-on-primary:#ffffff;
  /* Accent — interactive / traceable only */
  --color-accent:#2563eb; --color-accent-hover:#1d4ed8;
  --color-accent-weak:#eff4ff; --color-accent-border:#c7d7fe;
  /* Status (muted, text-only badges) */
  --color-success:#15803d; --color-success-weak:#dcfce7;
  --color-warning:#b45309; --color-warning-weak:#fef3c7;
  --color-danger:#b91c1c;  --color-danger-weak:#fee2e2;
  --color-highlight:#fff3cd; --color-highlight-edge:#f4d35e; /* note highlight */
  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Fira Code", Menlo, Consolas, monospace;
  --text-xs:11px; --text-sm:13px; --text-base:14px; --text-md:15px; --text-lg:17px; --text-xl:22px; --text-2xl:28px;
  --weight-normal:400; --weight-medium:500; --weight-semibold:600; --weight-bold:700;
  /* Spacing (4px base) */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:20px; --space-6:24px; --space-8:32px; --space-10:40px; --space-12:48px;
  /* Radius */
  --radius-sm:6px; --radius-md:8px; --radius-lg:12px; --radius-xl:16px; --radius-pill:999px;
  /* Shadow */
  --shadow-sm:0 1px 2px rgba(13,13,13,.05); --shadow-md:0 4px 16px rgba(13,13,13,.08); --shadow-lg:0 20px 60px rgba(13,13,13,.18);
  /* Motion */
  --ease:cubic-bezier(.4,0,.2,1); --dur-fast:.12s; --dur:.18s;
  /* Icons */
  --icon-sm:16px; --icon-md:20px; --icon-lg:24px; --icon-stroke:1.75;
  /* Layout */
  --content-width:640px;  /* shared reading-column width — the home prompt field's width,
                             reused to constrain library pages and other long-form text so
                             content never spans the full viewport. */
}
```

**Reading width.** Long-form / list content (the home prompt, the Library pages and the
audit-detail sections) is constrained to **`--content-width`** and centered, rather than
spanning the full viewport. The home input prompt field defines this width; everything that
should read at the same measure references the token (single source of truth).

The full base-element styling (buttons, inputs, the icon set) is in the demo design-system
doc; reuse it verbatim. Migrate any remaining raw values in components to the nearest token.

---

## Audit-specific semantic tokens

The product's trust signals (docs [2](./2-product-flows.md) and
[6-traceability-evidence.md](./6-traceability-evidence.md)) need their own **named** tokens,
so the meaning is defined once and components never invent their own colors for them.

```css
:root {
  /* Cell kind */
  --cell-direct: <neutral, no special tint>;          /* direct values read as settled */
  --cell-interpret: var(--color-accent-weak);          /* interpret values stand out gently */

  /* Confidence heat-map: word -> tint (front end maps low/medium/high to these) */
  --confidence-high:   <quietest>;                     /* settled */
  --confidence-medium: var(--color-warning-weak);      /* worth a look */
  --confidence-low:    var(--color-danger-weak);       /* loudest, needs eyes */

  /* Interpret review state */
  --review-unreviewed: var(--color-warning);           /* flag: not yet reviewed */
  --review-reviewed:   var(--color-success);           /* flag: reviewed */

  /* Indexing / status */
  --status-indexing: var(--color-text-muted);          /* "indexing…" badge */
  --status-ready:    var(--color-success);

  /* Run status (doc 10) — blocked cells are NOT styled in the workbook; they stay empty */
  --status-queued:          var(--color-text-muted);
  --status-in-progress:     var(--color-accent);
  --status-blocked:         var(--color-danger);
  --status-in-verification: var(--color-warning);
  --status-complete:        var(--color-success);
}
```

Rules:
- **Confidence** is the word `low` / `medium` / `high` in the data; the front end parses it
  to the `--confidence-*` token. Components never branch on raw colors.
- The kind marker, the two review-state flags, and the confidence tint must remain legible
  **together** on one cell (doc 6) — keep them distinct (a tint, a marker, a flag), not three
  competing fills.
- These are placeholders for the exact palette — pick values that stay calm and
  colorblind-safe; do not exceed the one-accent principle by inventing new saturated hues.

---

## Components the MVP needs

Each follows the tokens above; none re-styles from scratch.

- **Output-spec chip** — the template (or template-to-be) in the input box. States:
  `indexing…` badge, ready, and (Flow B) a one-or-two-word name with a **hover preview** of
  the fields. *(doc 2.)*
- **Filter chips** — editable inclusion/exclusion criteria; add/remove without layout jump.
- **`+` menu** — upload new template / select existing.
- **Activity feed** — collapsed = one fixed-height status line; expanded = fixed-height
  scroll window. Heights never jump. *(doc 5.)*
- **Workbook grid cell** — carries kind marker + review-state flag + confidence tint;
  **click = open evidence, double-click = edit** (make the affordance visible). *(doc 6.)*
- **Right (evidence) panel** — explanation, query/queries, structured result (direct) or
  full notes with verbatim highlights (interpret).
- **Empty / loading / error / partial states** for every surface. *(doc 2 state table.)*
- **Status board (Kanban)** — columns by run status (Queued / In progress / Blocked / In
  verification / Complete); cards = audit runs showing the blocked count + most common
  reason/owner. *(doc 10; deferred — next phase.)*
- **Status chip** — the audit's current status, shown on cards and anywhere the audit is listed.
- **Status counters** — the top band's compact blocked / needs-review counters (far right,
  hidden at zero, clickable); reuse the review-status semantic tokens. *(doc 11.)*
- **Run summary message** — the agent's final structured summary, rendered as the **terminal
  entry of the agent-activity feed** (doc 10, doc 11): states completion and **lists any
  blocked values + owners**. Blocked cells are **not** marked in the grid; they are simply
  empty.
- **Blocked-items list** — grouped by owner, with a **draft-reminder** action (sending is
  human-initiated). *(doc 10; deferred — next phase.)*
- **Toasts** — indexing done, errors, blocked cells resolved on re-run.

---

## Acceptance (design system)

- All product colors/shapes/sizes/fonts come from tokens in `app.css`; no component
  hard-codes a value a token covers.
- The confidence heat-map, kind marker, and the two review-state flags each map to named
  semantic tokens and stay legible together on one cell.
- One icon family throughout; no emojis or ad-hoc arrow glyphs.
- The "click for evidence, double-click to edit" affordance is visible on the grid.
