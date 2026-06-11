# Intero Demo — Design System

Read [`README.md`](README.md) first. This file is the **single source of visual
truth**. The reference look is **ChatGPT (chatgpt.com)**: calm, near-monochrome,
generous spacing, hairline borders, light-gray sidebar with a gray hover box on
list items, and a single consistent family of **simple monochrome line icons**.

Today the app is inconsistent (clashing colors, button styles, fonts, widths) and
full of colored emojis and mismatched arrow glyphs. We replace all of that with
the tokens, the shared icon set, and the patterns below.

## 0. Principles

1. **ChatGPT-calm, monochrome.** Neutral grays, near-black text, near-black
   primary buttons, one restrained blue accent reserved for *interactive /
   traceable* affordances (links, clickable cells, focus rings).
2. **Icons: yes — but one consistent set, never colored emojis.** All icons are
   simple monochrome **line icons** (Lucide/Heroicons-style, ~1.75px stroke),
   sized uniformly, drawn in `currentColor` so they inherit text color. They all
   come from the shared `Icon.svelte` (§1.3). No 📊/＋/🗄️/✦/✓ emojis; no
   ad-hoc Unicode arrows — arrows and chevrons are the canonical icons used
   identically everywhere.
3. **One accent, neutral everything else.** Use tokens; never scatter raw hex.
4. **Consistency over cleverness.** Same radius, border, shadow, button shape,
   icon size everywhere. If two things do the same job, they look identical.
5. **Remove the useless.** Delete elements carrying no info or action (e.g. the
   `→` arrow on each template card).

---

## 1. Foundations

### 1.1 Tokens

Added to `:root` in [`app/src/app.css`](../../app/src/app.css) by the **DS** task.
Every other task references them via `var(--…)` and must not hard-code raw
hex/px that a token covers.

```css
:root {
  /* Neutrals (ChatGPT-like) */
  --color-bg:            #ffffff;   /* main content area */
  --color-sidebar:       #f9f9f9;   /* left panel */
  --color-surface:       #ffffff;   /* cards, panels, menus */
  --color-surface-muted: #f4f4f4;   /* code blocks, subtle fills */
  --color-hover:         #ececec;   /* the gray hover box on list items */
  --color-border:        #e3e3e3;   /* hairline borders */
  --color-border-strong: #d4d4d4;   /* inputs, dropzones */

  /* Text */
  --color-text:          #0d0d0d;   /* primary */
  --color-text-secondary:#5d5d5d;   /* labels */
  --color-text-muted:    #8f8f8f;   /* descriptions, hints */
  --color-text-faint:    #b4b4b4;   /* placeholders, disabled */

  /* Primary action (ChatGPT black button) */
  --color-primary:       #0d0d0d;
  --color-primary-hover: #2f2f2f;
  --color-on-primary:    #ffffff;

  /* Accent — interactive / traceable only (links, clickable cells, focus) */
  --color-accent:        #2563eb;
  --color-accent-hover:  #1d4ed8;
  --color-accent-weak:   #eff4ff;   /* selected rows, fill-flash, tinted bg */
  --color-accent-border: #c7d7fe;

  /* Status (muted, used sparingly, text-only badges) */
  --color-success: #15803d; --color-success-weak: #dcfce7;
  --color-warning: #b45309; --color-warning-weak: #fef3c7;
  --color-danger:  #b91c1c; --color-danger-weak:  #fee2e2;
  --color-highlight: #fff3cd; --color-highlight-edge: #f4d35e; /* note highlight */

  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Fira Code", Menlo, Consolas, monospace;
  --text-xs: 11px;  --text-sm: 13px;  --text-base: 14px;
  --text-md: 15px;  --text-lg: 17px;  --text-xl: 22px;  --text-2xl: 28px;
  --weight-normal: 400; --weight-medium: 500; --weight-semibold: 600; --weight-bold: 700;

  /* Spacing (4px base) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px;

  /* Radius */
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px; --radius-pill: 999px;

  /* Shadow (restrained) */
  --shadow-sm: 0 1px 2px rgba(13, 13, 13, 0.05);
  --shadow-md: 0 4px 16px rgba(13, 13, 13, 0.08);
  --shadow-lg: 0 20px 60px rgba(13, 13, 13, 0.18);

  /* Motion */
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --dur-fast: 0.12s; --dur: 0.18s;

  /* Icons */
  --icon-sm: 16px; --icon-md: 20px; --icon-lg: 24px; --icon-stroke: 1.75;
}
```

> Migrate every existing raw value (`#3b82f6`, `#0066cc`, `#1a1a1a`, `#888`,
> `#ddd`, mixed radii `8/12/20px`, etc.) to the nearest token. Aim for zero raw
> values a token already covers.

### 1.2 Base elements

The **DS** task normalizes base styles in `app.css`:

- **Body:** `var(--font-sans)`, `var(--text-base)`, `color: var(--color-text)`,
  `background: var(--color-bg)`.
- **Buttons:** reset native look; provide the shared classes in §3.1.
- **Inputs / selects / textareas:** one shared look —
  `border: 1px solid var(--color-border-strong)`, `radius: var(--radius-md)`,
  `padding: var(--space-2) var(--space-3)`, focus ring
  `box-shadow: 0 0 0 3px var(--color-accent-weak); border-color: var(--color-accent)`.
  Same height/font everywhere.

### 1.3 The icon set — `Icon.svelte`

DS creates **`app/src/components/Icon.svelte`**: a single component holding an
inline-SVG registry of Lucide/Heroicons-style line icons. Usage:
`<Icon name="search" size={20} />` (defaults: `--icon-md`, `currentColor`,
`stroke-width: var(--icon-stroke)`, `fill: none`, round line caps/joins).

Required icons (extend as needed, but keep them one visual family):

| name | used for |
|---|---|
| `logo` | company logo placeholder — **an eye** glyph (per the brief) |
| `new` | New analysis (a pencil/compose or plus-square — ChatGPT "new chat" style) |
| `search` | Search analyses (magnifying glass) |
| `settings` | Settings (gear) |
| `sidebar` | collapse/expand the left panel (panel/sidebar toggle) |
| `more` | options menu (three **horizontal** dots / ellipsis) |
| `close` | dismiss (x) |
| `chevron` | the one disclosure caret (rotate via transform) |
| `download` | chip download (down-tray) |
| `table` | the file chip's spreadsheet glyph (a simple table/grid outline) |
| `stop` | stop the running agent (square) |
| `rename` | rename in menus (pencil) |
| `trash` | delete in menus |

Do **not** introduce a second icon style elsewhere. If a component needs an icon
not in the registry, add it to `Icon.svelte` (coordinate with DS) rather than
inlining a one-off SVG or a Unicode glyph.

---

## 2. Color usage

- App content background `--color-bg` (white); the **left panel** uses
  `--color-sidebar`.
- **Primary buttons are near-black** (`--color-primary`) with white text — the
  ChatGPT look. The blue **accent** is reserved for links, the clickable/traceable
  cell affordance, focus rings, selected states, and the fill-flash.
- Hairline dividers `--color-border`. List-item hover uses the gray box
  `--color-hover`.

---

## 3. Component patterns

### 3.1 Buttons — one family

Identical geometry (`radius-md`, `padding: 8px 16px`, `--text-sm`,
`--weight-semibold`, `transition: background var(--dur-fast) var(--ease)`):

- **Primary** — `--color-primary` fill, `--color-on-primary` text, hover
  `--color-primary-hover`. (Run analysis, New analysis, Find data.)
- **Secondary** — `--color-surface` fill, `1px solid var(--color-border-strong)`,
  `--color-text`. Hover `--color-surface-muted`.
- **Ghost** — transparent, `--color-text-secondary`. Hover `--color-hover`.
  (Menu items, icon buttons, Settings, Close.)
- **Icon button** — ghost, square, centers a `<Icon>`; `--color-text-secondary`
  resting, `--color-text` on hover.

Disabled: `opacity: 0.5; cursor: not-allowed`. No other button shapes.

### 3.2 Cards

`background: var(--color-surface)`, `border: 1px solid var(--color-border)`,
`radius: var(--radius-lg)`, `padding: var(--space-5) var(--space-6)`. Interactive
hover: `border-color: var(--color-border-strong)` + `--shadow-sm`.
Selected/expanded: `border-color: var(--color-accent)` + `--shadow-md`.

### 3.3 File chip

A clean chip: optional `table` line icon (monochrome, inherits text color) +
filename in `--color-text` `--weight-medium` + optional muted type suffix
(`.xlsx`) in `--color-text-faint`. `background: var(--color-surface)`,
`1px solid var(--color-border)`, `radius: var(--radius-md)`,
`padding: var(--space-2) var(--space-3)`. Hover →
`border-color: var(--color-accent-border); background: var(--color-accent-weak)`.
A download affordance, if kept, is the `download` icon button (ghost) — never a
raw `↓`.

### 3.4 Badges (status)

Pill, `--text-xs`, `--weight-semibold`, **text only** (no `✓`/`✗`):
- `Indexing` → `--color-warning-weak` / `--color-warning`
- `Ready` → `--color-success-weak` / `--color-success`
- `Error` → `--color-danger-weak` / `--color-danger`

### 3.5 Overflow / "more actions" menu

Trigger = an **icon button with the `more` (horizontal ellipsis) icon**, shown on
hover of the row/card (ChatGPT style). The dropdown is a `--color-surface` card
with `--shadow-md`, `radius-md`; items are ghost buttons, full-width,
left-aligned, each with its small leading icon (`rename`, `trash`); the
destructive item uses `--color-danger` text + `--color-danger-weak` hover.

### 3.6 Disclosure (expand / collapse)

Use the single canonical `chevron` icon, rotated via `transform` (e.g. 0° / 90°)
with a `--dur` transition — the same component everywhere (agent-activity card,
template card). Never mix Unicode `▸▾«»`. The left-panel collapse uses the
`sidebar` icon (§6).

### 3.7 Close / dismiss

A ghost **icon button with the `close` icon** for the right panel and the
settings modal. List-item removal lives in the row's `more` menu (Delete). Esc
still closes modals/panels.

### 3.8 Loading / progress

- **Spinner** (agent working): a CSS spinner (progress, not an icon) — restyle to
  tokens (`--color-border` track, `--color-accent` head). The stop control is an
  icon button using the `stop` icon.
- **Cell fill flash:** on populate, briefly set `background: var(--color-accent-weak)`
  and fade to transparent over ~600 ms (`transition: background var(--dur) var(--ease)`).

### 3.9 Tabs (settings modal)

Ghost buttons; active tab gets `--color-surface` bg, `--color-text`,
`--shadow-sm`.

### 3.10 Toasts

`--color-surface` with `--shadow-md` and a 3px left status border. Text only.

---

## 4. Right panel ("Cell source") specifics

One clean column (README §3 steps 8–9):

1. **Explanation** — `--color-accent-weak` bg, `--color-accent-border` border,
   `radius-md`; a small uppercase `--text-xs`/`--color-accent` label
   ("How this value was derived") then the text in `--color-text-secondary`.
2. **SQL** (`SqlDisplay`) — `--font-mono`, `--text-sm`, `--color-surface-muted`
   bg, `radius-md`, scroll if long.
3. **Result / evidence:**
   - direct → `SqlResultViewer` structured table (hairline borders, `--text-sm`).
   - interpretive → `NoteEvidenceView` full notes, highlighted spans
     (`--color-highlight` fill, `--color-highlight-edge` edge); keep
     "scroll first highlight into view".

---

## 5. Spreadsheet viewer specifics

- Clickable/traceable cells use the **accent** (`--color-accent`) as a subtle
  underline/affordance — never a raw `#0066cc`, never an icon inside the cell.
- Apply the **fill flash** (§3.8) to newly populated cells.

---

## 6. Left panel — ChatGPT-style spec (LEFT task)

Rebuild [`LeftPanel.svelte`](../../app/src/components/LeftPanel.svelte) to match
the reference. Background `--color-sidebar`; right edge `1px var(--color-border)`.

### Expanded state (top → bottom)

1. **Header row:** the company **logo** (`Icon name="logo"` — the eye placeholder)
   on the left; the **`sidebar`** collapse icon button on the right.
2. **Menu items** (ghost rows, leading icon + label, full-width, gray-box hover
   `--color-hover`, `radius-md`):
   - **New analysis** — `new` icon. Starts a fresh analysis (go home / clear).
   - **Search analyses** — `search` icon. (For the demo, a simple filter of the
     list below is enough; a non-functional affordance is acceptable if time is
     short, but prefer a working client-side name filter.)
3. **Analyses list:** the past analyses, **name only** (no date, no status text).
   Each row:
   - default: just the name, truncated with ellipsis.
   - **hover:** the gray box (`--color-hover`) appears, signalling it's clickable,
     and the **`more`** (horizontal ellipsis) icon button appears at the right.
   - **active:** gray box persists (slightly stronger if needed).
   - the `more` menu offers **Rename** (`rename`) and **Delete** (`trash`).
   - keep the running/error status dot subtle, or drop it — name-only is the goal.
4. **Footer:** the **Settings** row pinned to the bottom (`settings` gear icon +
   "Settings"), ghost row.

### Collapsed state (thin rail)

A narrow bar containing only icon buttons, vertically:

1. **Logo** (`logo`/eye) at the top.
2. **New analysis** (`new`) and **Search analyses** (`search`) icons.
3. (The analyses list is hidden when collapsed.)
4. **Settings** (`settings`) gear pinned at the **bottom**.

The collapse/expand control is the single `sidebar` icon, consistent in both
states. Keep the existing resize/persisted-width behavior; just restyle.

---

## 7. Icon / emoji replacement inventory (exhaustive)

Replace every colored emoji and stray glyph with the corresponding **monochrome
line icon from `Icon.svelte`** (or delete where noted).

| File | Current | Replace with |
|---|---|---|
| `SpreadsheetChip.svelte` | `📊` | `table` icon (monochrome) — §3.3 |
| `SpreadsheetChip.svelte` | `↓` download | `download` icon button, or omit |
| `HomeScreen.svelte` | `＋` upload-card icon | remove; title carries the action (or `new` if an icon helps) |
| `HomeScreen.svelte` | `✦` describe-card icon | remove |
| `HomeScreen.svelte` | "Generate" button | "Run analysis" (README §7) |
| `TemplateCard.svelte` | `→` arrow | **delete entirely** (useless) |
| `TemplateCard.svelte` | `⋯` menu | `more` icon button (§3.5) |
| `TemplateCard.svelte` | `ready ✓` badge | text "Ready" badge (§3.4) |
| `SettingsModal.svelte` | `🗄️` database icon | remove (text), or a neutral `table`/db line icon |
| `SettingsModal.svelte` | `＋` add cards (×2) | remove; title carries action |
| `SettingsModal.svelte` | `⋯` / `&times;` | `more` / `close` icons (§3.5, §3.7) |
| `SettingsModal.svelte` | `ready ✓` badge | text "Ready" badge |
| `LeftPanel.svelte` | `⚙` gear | `settings` icon |
| `LeftPanel.svelte` | `«` / `»` | `sidebar` collapse icon (§6) |
| `LeftPanel.svelte` | `×` per-row delete | `more` menu → Delete (§6) |
| `LeftPanel.svelte` | `+ New` text / rail `+` | "New analysis" row with `new` icon (§6) |
| `ResultsView.svelte` | `▾` / `▸` | `chevron` icon, rotated (§3.6) |
| `ResultsView.svelte` | spinner + square stop | restyle spinner to tokens; `stop` icon (§3.8) |
| `RightPanel.svelte` | `×` close | `close` icon button (§3.7) |

> Sidebar collapsed-rail **initials** are no longer needed — the collapsed rail
> shows only the icon buttons in §6, not per-analysis entries.

---

## 8. Acceptance (visual)

A change is done when, for its component:

- No colored emoji and no stray Unicode arrow/affordance glyph remains; every
  icon comes from `Icon.svelte` and shares one style/stroke/size.
- All colors, radii, fonts, spacing come from §1 tokens (ChatGPT-calm palette).
- Buttons, cards, chips, badges, menus, disclosure, and close controls match §3.
- It sits visually consistent next to the other redesigned components in
  `npm run dev:mock`.
