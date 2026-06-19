# Melodic Health — Landing Page Spec

Build plan for the marketing landing page in `company/website/`. Consumes the brand tokens in
[`../brand/README.md`](../brand/README.md). Inspired by Frontier Health's structure and
confidence; our own palette (deep blue + Cambridge blue), voice, and content.

## Goal & audience

- **Goal:** get audit teams to **Book a Demo** (primary) or contact us (secondary).
- **Audience:** auditing clinicians, department heads / operational leads, and
  information-governance reviewers who must trust it with patient data.
- **One message:** clinical audit, automated and **fully traceable**, running locally and
  read-only.

## Tech approach

- Single static `index.html` + `styles.css` in `company/website/` (no framework, matches the
  current folder). Tokens copied/`@import`ed from the design-system so there's one palette.
- Fonts: Satoshi (Fontshare) + Inter (Google) via `<link>` (see brand §4).
- Smooth-scroll anchor nav; sticky header; responsive (mobile-first, single column < 760px).
- Replaces the current placeholder hero (`index.html` / `styles.css`).

## Page structure (top → bottom)

Background column in **[brackets]** signals section rhythm (see brand §7).

1. **Sticky nav** — wordmark left; links `Platform · How it works · Security · About`
   (smooth-scroll anchors); **Book a Demo** pill right. Translucent light, blur, hairline
   bottom border.

2. **Hero [deep-blue]**
   - Eyebrow: `MELODIC HEALTH` (Cambridge-deep, uppercase tracked).
   - Headline (display 900, tight): _"Stop chasing audit values. Just **review** them."_
     (highlight word "review" in `--cambridge-bright`).
   - Subhead (brand §8 supporting subhead — populate the whole audit, flag what needs eyes,
     on-premise so no patient data leaves, review instead of search).
   - CTAs: **Book a Demo** (primary, Cambridge-bright on deep blue) + **See how it works**
     (secondary, ghost) scrolling to §4.
   - Visual: a rounded product-preview card showing a populated audit workbook with one cell's
     evidence open (traceability). Uses product UI tokens inside the card. Static image/mockup
     for v1.

3. **Proof strip [light]** — 4 compact items, icon + label, from the brand proof pillars:
   `No more chasing · Review, don't retrieve · Stays on-premise · Fully traceable`.

4. **Why Melodic [light / cambridge-weak tint]** — "How it works" anchor target.
   - Eyebrow `WHY MELODIC`; section heading.
   - Problem line: _"Clinical audit eats clinician time — hours of data-warehouse round-trips
     or hand-reading records. The work is essential and almost entirely manual."_
   - 3 value cards: **Every value traceable** · **Runs locally, read-only** · **Built for
     real audits**.

5. **How it works [light]** — 3 numbered steps mapped to the product pipeline (index → map →
   run; see `docs/mvp/3-architecture.md`):
   1. **Point it at your audit** — pick an audit template and connect a (read-only) database.
   2. **It populates the workbook** — the engine fills each cell automatically from structured
      data or clinical notes.
   3. **Verify every value** — open any cell to see its source: the field, the SQL, or the
      highlighted note. Confidence is flagged; you review what needs eyes.

6. **Outcomes [ink — dark]** — 3 big stat blocks. **Illustrative until real numbers signed
   off** (brand §10): e.g. `Hours → minutes`, `100% traceable`, `0 records leave your
   environment`. Keep qualitative until defensible figures exist.

7. **Workflows / capabilities [light]** — heading + grid of audit types and features:
   - Audit types: **National**, **Regional**, **Departmental**, **Ad-hoc** (from
     `docs/mvp/1-personas-use-cases.md`).
   - Features: evidence panel, confidence heat-map, one-click workbook export.

8. **Case study / quote [cambridge-weak tint]** — single testimonial card. **Placeholder until
   a real, approved quote exists** — ship a generic value statement, not a fabricated quote.

9. **Security [ink — dark]** — "Safe, auditable by design": local & read-only, full
   audit log, per-user attribution, every value traceable to source (from
   `docs/mvp/7-auth-and-audit-log.md`, `6-traceability-evidence.md`). 3–4 points + a "Learn
   about security" link (anchor/placeholder).

10. **FAQ [light]** — accordion. Seed questions: _What is Melodic? · Who is it for? · Does it
    change our systems? · Does patient data leave our environment? · How does traceability
    work? · How fast can we start?_

11. **Final CTA + contact form [deep-blue / ink]**
    - Heading: _"Ready to give clinicians their time back?"_ + one line.
    - **Book a Demo form** — kept deliberately short to maximise submissions: **Email\***,
      **Organisation\***, **Message**. (No name/role/interest/consent fields.)
    - **Backend (interim):** v1 validates required fields, then opens a pre-filled `mailto:`
      to `octave@melodic.health`. Replace with a real form endpoint (e.g. form service) when
      chosen — see the `TODO` in `index.html`.

12. **Footer [ink]** — wordmark + short line; columns: `Platform (anchors)`, `Company (About,
    Careers — placeholder)`, `Legal (Privacy, Terms — placeholder)`; `© <year> Melodic Health`.

## Responsive

- Single column < 760px; nav collapses to a menu button; hero CTAs stack; stat/feature grids
  become 1–2 columns; form full-width.

## Assets / TBD checklist (carry from brand §10)

- [ ] Logo mark (or ship wordmark only)
- [ ] Final headline/tagline pick
- [ ] Product-preview hero image/mockup
- [ ] Real outcome stats (else qualitative)
- [ ] Real testimonial (else generic statement)
- [ ] Form backend decision
- [ ] Legal page links (Privacy, Terms)
