# Melodic Health — Brand Guidelines

The single source of truth for the **Melodic Health company brand**: the marketing site,
decks, and any outward-facing surface. Every color, type choice, and component on those
surfaces references this document.

> **Scope.** This governs the *company / marketing* brand. The **product app UI** keeps its
> own calmer, near-monochrome system (`app/src/app.css`, `docs/mvp/8-design-system.md`) — do
> not merge the two. The marketing brand is bolder and more expressive; the product UI stays
> quiet so clinical data leads. Where they touch (e.g. an embedded product screenshot in the
> hero), the product keeps its own tokens.

---

## 1. Who we are

- **Company:** Melodic Health.
- **What we build:** software that turns clinical audit from manual data work into an
  automated, fully-traceable system. Point it at an audit template and a hospital database;
  it returns a populated audit workbook — automatically, locally, and read-only — where every
  value traces back to its source (structured field, SQL query, or highlighted clinical note).
- **Who it's for:** clinicians and audit teams (auditing clinicians, department heads,
  ad-hoc data requesters).
- **Naming:** the public brand is **Melodic Health**. The legacy tool name **"Intero" is
  retired from all public-facing copy** — refer to "Melodic" or "the platform". (Internal
  code and docs may still use Intero; that's fine, it just never appears on the site.)

**Positioning vs. the reference (Frontier Health).** Our landing page is *inspired by, not a
copy of* Frontier Health — same confidence and structure, our own palette, voice, and
identity. We do not use their electric ultramarine or their typeface.

---

## 2. Logo & wordmark

- The brand is currently the **"Melodic Health" wordmark only**, set in the display typeface,
  weight 700, tracking `-0.02em`, in `--deep-blue` on light backgrounds and `--on-dark` (near
  white) on dark backgrounds. No icon/mark for now (the earlier soundwave glyph was dropped).
- Clear space around the wordmark ≥ the cap-height of "M". Minimum wordmark height 18px.
- **TBD:** a brand mark may be designed later; until then there is no glyph — wordmark alone.

---

## 3. Color

Deep blue + Cambridge blue is the brand. A deep, confident royal-navy field carries the
weight; soft **Cambridge blue** is the signature accent — it highlights the key word in a
headline, tints soft sections, and marks secondary actions. This is the whole "pop": a
Cambridge-blue word glowing on a deep-blue field. No third loud hue.

### Tokens

```css
:root {
  /* Deep blue — the brand spine */
  --ink:            #06152F; /* deepest navy-black — dark sections, footer */
  --deep-blue:      #0E2F6E; /* PRIMARY brand — hero fill, primary buttons, wordmark */
  --deep-blue-hover:#0A2657; /* primary hover */
  --blue:           #1E4FB0; /* brighter interactive blue — links, inline accents on light */

  /* Cambridge blue — the signature accent */
  --cambridge:       #A3C1AD; /* signature soft accent — highlight word, secondary action */
  --cambridge-bright:#B8D2C2; /* highlight text / fills on the deep-blue hero */
  --cambridge-deep:  #6E9580; /* accent text & icons on LIGHT bg (A3C1AD is too pale there) */
  --cambridge-weak:  #ECF2EE; /* soft tinted section background */

  /* Neutrals — light surfaces */
  --bg:             #F5F7FA; /* page background */
  --surface:        #FFFFFF;
  --surface-muted:  #EDF1F7;
  --border:         #E1E7F0;
  --border-strong:  #CDD6E3;

  /* Text on light */
  --text:           #0F2547; /* deep blue-slate ink */
  --text-secondary: #51627E;
  --text-muted:     #8593A8;

  /* Text on dark (--ink / --deep-blue) */
  --on-dark:           #EAF0F9;
  --on-dark-secondary: #B9C7DD;
  --on-dark-muted:     #8295B4;

  /* Functional (used sparingly, mostly in embedded product shots) */
  --success: #2E7D5B;
  --warning: #B27A1E;
  --danger:  #C0413B;
}
```

### Usage rules

- **One brand spine, one accent.** Deep blue does the heavy lifting; Cambridge blue is the
  only accent. Never introduce a saturated third color for decoration.
- **The highlight.** In a headline, set the single most important word in `--cambridge-bright`
  (on a deep-blue field) or `--cambridge-deep` (on a light field). One highlighted phrase per
  headline, never more.
- **Contrast.** `--cambridge` (#A3C1AD) is too light to read on white — use `--cambridge-deep`
  for accent text/icons on light backgrounds. On deep blue it reads well; use it freely there.
- **Sections alternate** light (`--bg`/`--surface`) and dark (`--deep-blue`/`--ink`) to give
  rhythm — see the layout section.

---

## 4. Typography

Confident geometric display, clean humanist body. (Distinct from Frontier Health's
Be Vietnam Pro.)

- **Display / headings:** **Satoshi** (Fontshare), weights 700 & 900. Fallback `Outfit`, then
  system sans. Large headings carry tight tracking (`-0.03em`) and short line-height (1.05)
  for the bold, packed look.
- **Body / UI:** **Inter** (Google Fonts), weights 400/500/600. Comfortable measure, normal
  tracking, line-height 1.55.
- **Mono** (figures, code in product shots): `ui-monospace, "SF Mono", Menlo, monospace`.

```html
<!-- Satoshi (display) -->
<link href="https://api.fontshare.com/v2/css?f[]=satoshi@700,900&display=swap" rel="stylesheet">
<!-- Inter (body) -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

### Type scale

```css
:root {
  --font-display: "Satoshi", "Outfit", -apple-system, "Segoe UI", sans-serif;
  --font-body:    "Inter", -apple-system, "Segoe UI", Roboto, sans-serif;

  --t-display: clamp(2.75rem, 6vw, 4.5rem); /* hero — 900, tracking -0.03em, lh 1.05 */
  --t-h1: 3rem;     /* 48 */
  --t-h2: 2rem;     /* 32 */
  --t-h3: 1.375rem; /* 22 */
  --t-lead: 1.125rem; /* 18 — hero subhead / lead paragraphs */
  --t-body: 1rem;   /* 16 */
  --t-small: 0.875rem; /* 14 */
  --t-meta: 0.8125rem; /* 13 — uppercase, tracking 0.12em, labels only */
}
```

- Headings: display font, weight 700–900, `--text` (light bg) / `--on-dark` (dark bg).
- Body: body font, 400–500, `--text-secondary` for supporting copy.
- Meta/eyebrow labels: 13px, uppercase, tracking `0.12em`, `--cambridge-deep` or `--text-muted`.

---

## 5. Spacing, radius, shadow, motion

```css
:root {
  /* Spacing — 4px base */
  --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-6:24px; --s-8:32px;
  --s-12:48px; --s-16:64px; --s-20:80px; --s-24:96px; --s-32:128px;

  /* Radius — generous, friendly */
  --r-sm:10px; --r-md:16px; --r-lg:20px; --r-xl:28px; --r-pill:9999px;

  /* Shadow — soft, low, blue-tinted */
  --shadow-sm: 0 1px 2px rgba(6,21,47,.06);
  --shadow-md: 0 8px 28px rgba(6,21,47,.10);
  --shadow-lg: 0 28px 70px rgba(6,21,47,.16);

  /* Motion */
  --ease: cubic-bezier(.4,0,.2,1); --dur-fast:.12s; --dur:.2s;
}
```

- **Cards & inputs** use `--r-md`/`--r-lg`; **buttons** use `--r-pill`. Big rounding is part
  of the look.
- Shadows stay soft and blue-tinted; no hard black drop shadows.
- Section vertical padding: `clamp(64px, 9vw, 128px)`.

---

## 6. Components

- **Buttons (pill, `--r-pill`):**
  - *Primary on light* — `--deep-blue` bg, white text. Hover `--deep-blue-hover`.
  - *Primary on dark hero* — `--cambridge-bright` bg, `--ink` text (the accent pops).
  - *Secondary on light* — `--surface` bg, `--deep-blue` text, `1px --border-strong`.
  - *Secondary on dark* — transparent bg, `--on-dark` text, `1px rgba(255,255,255,.4)`.
  - Padding `14px 22px`; label weight 600. The single highest-intent button is **"Book a
    Demo"** and it appears in the nav, hero, and final CTA.
- **Cards:** `--surface` bg (or `--cambridge-weak` for a soft variant), `1px --border`,
  `--r-lg`, `--shadow-md`, padding `--s-8`. On dark sections: `rgba(255,255,255,.06)` fill,
  `1px rgba(255,255,255,.12)`.
- **Inputs / form fields:** `--surface` bg, `1px --border-strong`, `--r-sm`, padding
  `12px 14px`; focus ring `2px --blue`. Labels 13px `--text-secondary`.
- **Eyebrow / section kicker:** 13px uppercase, tracking `0.12em`, `--cambridge-deep`.
- **Stat block:** big number in display 900 (clamp 2.5–3.5rem) `--cambridge-bright` on dark,
  caption below in `--on-dark-secondary`.
- **Nav (sticky):** translucent `--surface` with blur, `1px --border` bottom; wordmark left,
  links center/right (`--text-secondary`, hover `--deep-blue`), "Book a Demo" pill right.
- **Icons:** one monochrome line set (Lucide/Heroicons style, ~1.75px stroke), `currentColor`.
  No emojis.

---

## 7. Layout

- **Content max-width** `1200px`, centered, side gutters `clamp(20px, 5vw, 64px)`.
- **Section rhythm** alternates background to build energy and give the eye rests:
  `hero (deep-blue) → features (light) → why (light/tint) → how-it-works (light) →
  outcomes (ink) → workflows (light) → security (ink or tint) → faq (light) →
  final CTA + form (deep-blue/ink) → footer (ink)`.
- Generous whitespace; one idea per section; large type; big rounded cards.

---

## 8. Voice & messaging

**Tone:** calm, credible, plainspoken — built for a clinical audience. Confident through
clarity, not hype. Every claim is grounded and, ideally, traceable (it's literally our
product promise). Avoid drama words and jargon.

- **Do:** plain clinical English; lead with traceability, safety (local, read-only), and time
  saved; concrete outcomes; short sentences.
- **Don't:** buzzword stacks, exclamation-mark hype, vague "AI magic", anything we can't stand
  behind in front of a clinician or an information-governance officer.

**The core idea.** Today clinicians *chase* values — searching records, round-tripping the
data warehouse, hand-reading notes. Melodic ends the chase: it populates the entire audit
from the hospital's own records, flags exactly what needs a clinician's eyes, and lets the
team do what they're excellent at — clinical review — instead of data retrieval. And it does
all of this **on-premise**, so no patient data ever leaves the hospital. Two verbs anchor the
voice: we end *chasing*; clinicians do the *reviewing*.

**Lead headline** (approved):
> Stop chasing audit values. Just **review** them.  *(highlight: review)*

**Supporting subhead:**
> Melodic populates the entire audit from your hospital's records — automatically and fully
> traceable — and flags exactly what needs a clinician's eyes. Everything runs on-premise, so
> no patient data ever leaves the hospital. Your team reviews instead of searches.

**Proof pillars** (reuse across hero strip, value cards, security):
- **No more chasing** — Melodic populates the whole audit from your records; clinicians stop searching for values.
- **Review, don't retrieve** — we flag what needs a clinician's eyes so time goes to clinical judgement, not data entry.
- **Stays on-premise** — runs locally and read-only; no patient data ever leaves the hospital, nothing is written back.
- **Fully traceable** — every value links to its source: a field, a query, or a highlighted note, so it's defensible.

---

## 9. Relationship to the design-system folder

- `company/design-system/` holds the **rendered token reference** and component gallery. On
  implementation, `company/design-system/styles.css` is updated to the tokens in §3–§5 above
  (replacing the current navy/sky-blue/teal set), and `company/design-system/index.html`
  swatches/specs are refreshed to match.
- `company/website/` holds the **landing page**, which consumes these tokens. Its build plan
  is in [`../website/landing-page-spec.md`](../website/landing-page-spec.md).

---

## 10. Open items (TBD before/at implementation)

- Final logo mark (soundwave) — wordmark-only until designed.
- Final headline + tagline selection from §8 candidates.
- Outcome **stats** are illustrative until we have defensible numbers — do not publish
  invented metrics; use qualitative framings ("hours → minutes", "100% traceable") until real
  figures are signed off.
- **Testimonial / case study** needs a real, approved source before going live.
- **"Book a Demo" form backend** — interim `mailto:octave@melodic.health`; swap for a real
  form endpoint when chosen (see website spec).
