# Vision — the next 100 days

Read [README.md](README.md) first. That spec is the **product**: prove that a
clinician can run an audit, get a populated and traceable table, and trust it.

This document is the **100-day cathedral** — where the product goes once the core loop
works. Nothing here is in scope now. It exists so the product is built in a
direction that bends toward this, not away from it.

---

## The platonic end state

A clinician opens Intero on a Monday and sees, on the home screen:

> **NNAP Q2** — 94% complete · 6 cells need your review · due in 9 days

The audit pre-ran overnight. They click through the 6 flagged interpretive cells,
each showing the clinical notes with the relevant passages highlighted, confirm or
correct each one, and export the submission. The data-warehouse ticket queue is
gone. And because they corrected two cells, the system is now a little more
accurate than it was last quarter — next cycle it surfaces 4 cells, then 2.

The product proves one run. This is the standing service that run becomes.

---

## V1 — Verification-driven self-improvement loop

*(Expansion E1 from the CEO review. The moat.)*

Every interpret cell a clinician reviews — and whether they leave it unchanged (confirmed)
or edit it (corrected), the product's interpretive safety gate — is a **labelled signal**.
Captured and fed back, it makes
the field mapping measurably more accurate over time, on the Trust's
own data — something no static BI extract can do. *(This is one of two improvement loops —
see [improvement-loops.md](improvement-loops.md) for how it relates to the other, which tunes
the agent's own prompt/tools instead of per-site data.)*

**Concrete shape:**
- Log each verification/correction against the cell, the source evidence, and the
  **prompt version** that produced it (the product already versions prompts and logs runs).
- Accumulate confirmed/corrected pairs into a per-Trust correction store.
- A refinement step feeds those pairs back into mapping generation — see
  [site-artifact-learning.md](features/site-artifact-learning.md) for the full artifact set this loop can write.
- The interpretive **accuracy bar** (defined in the product for the safety gate) becomes a
  tracked metric that should rise with use.

**Why it's the moat:** accuracy that compounds with usage, grounded in real clinician
judgement, not guesswork. This is the concrete, signal-grounded version of the
"self-improvement / dreaming" idea already in the backlog.

**Why it's deferred:** it needs the core populate-and-verify loop working and
generating real corrections first. There is nothing to learn from until clinicians
are verifying.

---

## V2 — Deadline-aware, scheduled runs

*(Expansion E3 from the CEO review. The "Monday morning" experience.)*

National audits have public deadlines and recur every cycle. Intero should track
those deadlines, **pre-run audits overnight** ahead of them, and surface status on
the home screen so the clinician walks in to a near-finished audit instead of a blank
template.

**Concrete shape:**
- Per-audit deadline + cadence metadata (national audit deadlines are published).
- A scheduler that triggers precomputed runs ahead of each deadline (this rides the
  the product's "precompute everything that doesn't depend on the user's request" principle —
  the overnight window is exactly when precompute is meant to run).
- Home-screen status per audit: % complete, cells needing review, days to deadline,
  submit-ready state.

**Why it's deferred:** the product proves the on-demand run, which is the core motion.
Scheduling adds a new failure surface (a scheduler, a new background path) that should
sit on top of a proven run, not underneath an unproven one.

---

## V3 — Role-based profiles & dashboards

Different users need different views. A **clinical lead / head of department** sees a
different screen from a **doctor running an audit**: the lead's view is oversight — which
audits are on track, which are at risk, department-level completion and deadlines — while
the doctor's view is the audits they run. Authentication carries a **role**, and the role
drives what each user sees.

**Concrete shape:** roles attached to accounts (auth-and-access.md's auth), and role-scoped views (a
clinician's run list vs a lead's department dashboard).

**Why it's deferred:** the product proves the single-operator run plus the
login/attribution foundation (auth-and-access.md). Role-differentiated dashboards are an overlay once
that works and once there are multiple user types on the system.

*(Update, 2026-06-24: the operational-intelligence redesign brings org-level **Datasets** forward.
Revised 2026-06-25: **dashboards are deferred**, so a clinical lead's oversight view is **not** yet
expressible in v1 — they work from high-level **Datasets** + individual **tables** + per-table status;
the dashboard-led oversight surface, and **role-scoped defaults/access** over it, are next-phase.)*

---

## V4 — True pause/resume

**Leave-and-return already ships:** the run is a long-lived background job, so the user can close the
app or switch threads and come back to a **further-along or complete** run (the resolved-Q36 model —
[product-flows.md](product-flows.md)). What stays deferred is **true pause/resume** — freezing a
*live, in-memory* session mid-step and thawing it, distinct from returning to a job that simply kept
running.

**Why it's deferred:** mid-session pause/resume depends on an OpenCode session capability we
haven't verified; building the UI on it would spend an innovation token on an unproven mechanic.
Stop + re-run plus background continuation give most of the value
safely; revisit true pause/resume once the run loop is proven.

---

## Delight backlog

Smaller touches that make the product feel considered. Pull into a milestone when the
surrounding feature lands; none are product scope.

- **Deadline countdown + submit-ready status** on the home screen (part of V2).
- **One-click "I disagree"** on any cell — flags it, records the correction, feeds V1.
- **Diff against last cycle** for recurring audits: what changed since the last run
  (a patient's value moved, the denominator grew). Audits are longitudinal.
- **Submission-format export** with pre-submit validation (required fields present,
  no unexplained blanks) in the exact format the national body's portal wants.
- **Inline "why is this missing?"** on every blank cell, with the reason in place.

---

## Deferred from v1 by the filter-scope decision (2026-06-05, task P1)

v1 ships **structured-only** cohort filtering (see
[product-flows.md §The request flow](product-flows.md#the-request-flow)). Three capabilities are explicitly deferred here:

- **Free-text / interpretive cohort filtering.** Filtering the *cohort* on a concept that
  lives only in free-text notes (e.g. "patients with a documented comorbidity") — no SQL
  column carries it. The honest mechanism is retrieve-then-judge (SQL narrows the candidates,
  an LLM reads each candidate's notes and decides inclusion with verbatim evidence — the same
  *interpret* primitive used for interpret cells, applied to an inclusion boolean), refined as
  a second async pass on top of the SQL-narrowed set. v1 marks such criteria *not available for
  this audit*. *(Interpret **cells** — output fields read from notes — remain in the product; only
  interpret **cohort filters** are deferred.)*
- **No-template ad-hoc table populations / template synthesis.** Starting from free text that references **no**
  pre-existing template, where Intero would **synthesise** a template (structure + fields) from
  intent. v1 is template-anchored: a no-match request stops and asks the user to
  upload or pick a template.
- **National-spec auto-ingestion** of canonical inclusion criteria (already a library-and-sources.md fast-follow).
  v1 hand-curates the demo audit's canonical cohort as a fixture; full ingestion is deferred.

When free-text cohort filtering lands, the natural progression is a **persisted concept layer**
that accretes from the retrieve-then-judge judgments (turning the slow path into a fast,
reusable index over runs) — adjacent to Cross-audit field-semantics reuse below.

## Related backlog

- **Cross-audit field-semantics reuse** (Expansion E4) is a later backlog item: once the schema is mapped to several templates, recurring
  field meanings ("gestation at birth", "cord arterial pH") are reused so the Nth audit
  maps near-instantly. Compounding speed at Trust scale; not first-proof critical.

---

## The boundary

In the product, **not** here:
- The self-improvement loop (V1), deadline-aware scheduling (V2), and role-based
  profiles/dashboards (V3).
- Anything that depends on many audits, many runs, or many user types already existing.

What the product **must** do so this vision stays reachable: version prompts, log runs
with their parameters and the clinician's verifications, and treat the interpretive
safety gate as a first-class, recorded interaction. Those three are in scope
precisely because V1 is impossible without them.
