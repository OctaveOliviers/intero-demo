# Design System

This is the **single source of visual truth** for the product. Every color, shape, size,
font, and icon comes from here. Nothing in a component hard-codes a raw value that a token
covers. This is the "one standard template for colors, shapes, fonts that everything
references" the team set out to build.

The reference look is **ChatGPT-calm**: calm, neutral, near-monochrome, hairline borders, one
restrained blue accent reserved for interactive/traceable affordances, and one consistent family
of monochrome line icons. This is the **canonical product version** of the design system (the
token set was first explored in an early front-end demo and promoted here).

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

Live in `:root` in [`app/src/app.css`](../../../app/src/app.css). Every component references
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

---

## Base elements

- **Body:** `var(--font-sans)`, `var(--text-base)`, `color: var(--color-text)`,
  `background: var(--color-bg)`.
- **Buttons:** reset the native look; use the shared button classes (below).
- **Inputs / selects / textareas:** one shared look — `border: 1px solid var(--color-border-strong)`,
  `radius: var(--radius-md)`, `padding: var(--space-2) var(--space-3)`, focus ring
  `box-shadow: 0 0 0 3px var(--color-accent-weak); border-color: var(--color-accent)`. Same
  height/font everywhere.

Migrate any remaining raw value in a component (`#3b82f6`, `#0066cc`, `#1a1a1a`, `#888`, mixed
radii, …) to the nearest token. Aim for zero raw values a token already covers.

## The icon set — one shared `Icon.svelte`

A single component holds an inline-SVG registry of Lucide/Heroicons-style line icons, all one
family (~1.75px stroke, `currentColor`, `fill: none`, round caps), sized via `--icon-*`. Usage:
`<Icon name="search" size={20} />`. **No colored emojis, no ad-hoc Unicode arrows** — arrows and
chevrons are the single canonical icon, used identically everywhere. The baseline registry:

| name | used for |
|---|---|
| `logo` | company logo placeholder (an eye glyph) |
| `new` | New thread (compose / plus-square) |
| `search` | Search (magnifying glass) |
| `settings` | Settings (gear) |
| `sidebar` | collapse/expand the left panel |
| `more` | options menu (horizontal ellipsis) |
| `close` | dismiss (x) |
| `chevron` | the one disclosure caret (rotated via transform) |
| `download` | chip / table download |
| `table` | the file chip's spreadsheet glyph |
| `stop` | stop the running agent (square) |
| `rename` | rename in menus |
| `trash` | delete in menus |

If a component needs an icon not in the registry, **add it to `Icon.svelte`** rather than inlining
a one-off SVG or a Unicode glyph.

## Component patterns

- **Buttons — one family.** Identical geometry (`radius-md`, `padding: 8px 16px`, `--text-sm`,
  `--weight-semibold`): **Primary** (`--color-primary` fill, white text), **Secondary** (surface
  fill, `1px solid --color-border-strong`), **Ghost** (transparent — menu items, icon buttons),
  **Icon button** (ghost, square, centers an `<Icon>`). Disabled: `opacity: 0.5; cursor: not-allowed`.
  No other button shapes.
- **Cards.** `background: var(--color-surface)`, `1px solid var(--color-border)`,
  `radius: var(--radius-lg)`, `padding: var(--space-5) var(--space-6)`. Hover → `border-strong` +
  `--shadow-sm`; selected/expanded → `--color-accent` border + `--shadow-md`.
- **File chip.** `table` icon + filename (`--weight-medium`) + optional muted type suffix; surface
  bg, hairline border, `radius-md`. Hover → `--color-accent-border` / `--color-accent-weak`. A
  download affordance is the `download` icon button — never a raw `↓`.
- **Badges (status).** Pill, `--text-xs`, `--weight-semibold`, **text only** (no `✓`/`✗`):
  `Indexing` (warning), `Ready` (success), `Error` (danger).
- **Overflow / "more actions" menu.** Trigger = an icon button with the `more` glyph, revealed on
  row/card hover. Dropdown = a surface card with `--shadow-md`; items are full-width ghost buttons
  with a small leading icon; the destructive item uses `--color-danger`.
- **Disclosure.** The single canonical `chevron`, rotated via `transform` with a `--dur`
  transition — the same component everywhere. Never mix Unicode `▸▾«»`.
- **Close / dismiss.** A ghost icon button with the `close` icon; Esc also closes modals/panels.
- **Loading / progress.** A CSS spinner (track `--color-border`, head `--color-accent`); the stop
  control is the `stop` icon button. **Cell fill flash:** on populate, briefly set
  `background: var(--color-accent-weak)` and fade to transparent over ~600 ms.
- **Toasts.** Surface + `--shadow-md` + a 3px left status border. Text only.

## Surface specifics

- **Right (evidence) panel — one clean column:** (1) **Explanation** in an accent-weak box with a
  small uppercase accent label; (2) **SQL** in `--font-mono` on `--color-surface-muted`; (3)
  **result** — a structured table (direct) or full notes with highlighted spans (interpret). The
  note highlight uses `--color-highlight` fill; keep "scroll the first highlight into view".
- **Spreadsheet grid:** clickable/traceable cells use the **accent** as a subtle affordance (never
  a raw hex, never an in-cell icon); newly populated cells get the fill flash.
- **Left panel:** background `--color-sidebar`, right edge a `--color-border` hairline. Expanded =
  header (logo + `sidebar` collapse) → menu rows (`new`, `search`) → the threads list (name only,
  gray-box hover, a `more` menu with rename/delete) → `settings` pinned at the bottom. Collapsed =
  a thin rail of icon buttons only (logo, `new`, `search`, `settings` at the bottom). The collapse
  control is the single `sidebar` icon in both states.

---

## Audit-specific semantic tokens

The product's trust signals (specs [product-flows.md](../product-flows.md) and
[traceability-and-evidence.md](traceability-and-evidence.md)) need their own **named** tokens,
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

  /* Run status (status-and-blocked-items.md) — blocked cells are NOT styled in the table; they stay empty */
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
  **together** on one cell (traceability-and-evidence.md) — keep them distinct (a tint, a marker, a flag), not three
  competing fills.
- These are placeholders for the exact palette — pick values that stay calm and
  colorblind-safe; do not exceed the one-accent principle by inventing new saturated hues.

---

## Components the product needs

Each follows the tokens above; none re-styles from scratch.

- **Table spec element** — the structured, editable table spec in the thread (fields and
  grain), with a **persist** action and an `indexing…` / `mapping…` badge while a persisted template
  builds. *(Dashboards deferred.)* *(product-flows.md, library-and-sources.md.)*
- **Filter chips** — a Dataset's editable inclusion criteria (label + value chip) plus the empty
  add-filter row; add/remove without layout jump. *(library-and-sources.md.)*
- **Table-spec entry** — select existing / upload Excel / describe.
- **Activity feed** — collapsed = one fixed-height status line; expanded = fixed-height
  scroll window. Heights never jump. *(table-population.md.)*
- **Table grid cell** — carries kind marker + review-state flag + confidence tint;
  **click = open evidence, double-click = edit** (make the affordance visible). *(traceability-and-evidence.md.)*
- **Right (evidence) panel** — explanation, query/queries, structured result (direct) or
  full notes with verbatim highlights (interpret).
- **Empty / loading / error / partial states** for every surface. *(product-flows.md state table.)* The
  **unauthorized** ("you don't have access") state reuses the **error** pattern with fixed copy and no
  resource payload — it is not a separate visual pattern. *(auth-and-access.md §13.)*
- **Status board (Kanban)** — columns by table result status (Queued / In progress / Blocked / In
  verification / Complete); cards = tables showing the blocked count + most common
  reason/owner. *(status-and-blocked-items.md; deferred — next phase.)*
- **Status chip** — the audit's current status, shown on cards and anywhere the audit is listed.
- **Status counters** — the top band's compact blocked / needs-review counters (far right,
  hidden at zero, clickable); reuse the review-status semantic tokens. *(result-view.md.)*
- **Run summary message** — the agent's final structured summary, rendered as the **terminal
  entry of the agent-activity feed** (status-and-blocked-items.md, result-view.md): states completion and **lists any
  blocked values + owners**. Blocked cells are **not** marked in the grid; they are simply
  empty.
- **Blocked-items list** — grouped by owner, with a **draft-reminder** action (sending is
  human-initiated). *(status-and-blocked-items.md; deferred — next phase.)*
- **Toasts** — indexing done, errors, blocked cells resolved on re-run.

---

## Acceptance (design system)

- All product colors/shapes/sizes/fonts come from tokens in `app.css`; no component
  hard-codes a value a token covers.
- The confidence heat-map, kind marker, and the two review-state flags each map to named
  semantic tokens and stay legible together on one cell.
- One icon family throughout; no emojis or ad-hoc arrow glyphs.
- The "click for evidence, double-click to edit" affordance is visible on the grid.
