# Traceability & Evidence

Read [product-flows.md](../product-flows.md) and [table-population.md](table-population.md)
first. This document specifies how **every value traces back to its source**: the per-cell
metadata, the right-hand evidence panel, the visual markers and confidence heat-map, how
reviewing works, and what export produces.

The promise: a clinician can click any value — or a source in a chat answer — and see exactly how
it was produced, and can tell at a glance which values are safe copies and which the agent inferred. That is what
makes the tool trustworthy enough to put a number into a national submission.

Traceability in the product lives **in the app**. The richer auditable-export design in
[excel-traceability.md](excel-traceability.md) is **deferred** (see [Export](#export));
Export is a plain submit-ready file.

---

## Per-cell metadata

Every cell carries metadata, keyed `"<Sheet>!<A1>"` (a blocked cell has no `value`, but still
carries its `state` and blocked reason):

| Field | Meaning |
| --- | --- |
| `kind` | `direct` or `interpret` |
| `value` | the populated value (already code-translated to the template's encoding) |
| `state` | `pending` (during a run) / `filled` / `blocked` / `not_applicable` — the only **stored** states. "Needs verification" is **derived** (`filled` + interpret + `review_state: not_reviewed`), never stored (see [table-population.md §Cell state model](table-population.md#cell-state-model) and [status-and-blocked-items.md](status-and-blocked-items.md)) |
| `confidence` | a **simple word: `low`, `medium`, or `high`**. No numbers — the words are unambiguous for the agent to emit and for a human to review later; the front end parses them into whatever it needs. Drives the heat-map. |
| `review_state` | interpret only: `not_reviewed` → `reviewed` (set automatically; see [Reviewing](#reviewing-interpret-cells)) |
| `corrected` | interpret only: did the user edit the value after reviewing it? `false` = left as-is (confirmed), `true` = edited (corrected). The tracked accuracy signal. |
| `explanation` | plain-language account of how the value was derived |
| `sources` | **a list — one entry per source database**, because a cell may draw from several. Each entry carries its `database`, the `query` run against it, and the `table.column` (+ record id) it came from |
| `sources[].citations` | interpret only: the note passage(s) the agent used, **quoted verbatim** — copied word-for-word from the note, never paraphrased |
| `prompt_version` | the prompt version that produced it (ties to the run record, auth-and-access.md) |
| `extracted_at` | timestamp |
| `reason_code` | **blocked only** — why the value is absent (taxonomy in [status-and-blocked-items.md](status-and-blocked-items.md)) |
| `reason_detail` | **blocked only** — evidence-grade: exactly what is missing and where the agent looked |
| `owner_needed` | **blocked only** — the role/specialty/source to chase, inferred where possible |
| `outstanding_since` | **blocked only** — how long the gap has been open |

**Multiple databases per cell.** A single value can be assembled from more than one
database, so `sources` is a list, not a single field. Each source records its own database
and the exact query that pulled the relevant data from it. The evidence panel shows all of
them.

**Verbatim evidence.** For interpret cells, every passage in `sources[].citations` must be an **exact,
word-for-word substring of the note** — never a paraphrase or a summary. This is a
correctness rule (the clinician is checking the agent against the real text) and it is also
what lets the highlight land on the right span in the note.

---

## The evidence panel (right panel)

Clicking a cell once — **or an inline citation in a chat answer** — opens the evidence in the right
panel (toggling with Activity). Its content depends on `kind`. The same evidence structure backs a
table cell and a chat citation (and, when dashboards are built, a dashboard card's drill-down).

### Direct value
Top to bottom:
1. **Explanation** — what the value is and where it came from.
2. **The query (or queries).** If the cell drew from several databases, show the SQL run
   against **each** one.
3. **The result(s)** of those queries, as small structured tables.

The query must be **informative**, not just `SELECT <one value>`. It must show the value
**alongside the row identifier** the table uses (the patient/encounter code), so the
clinician sees "yes, that is the right value for the right patient", not a number floating
with no anchor.

### Interpretive value
Top to bottom:
1. **Explanation** — e.g. "combined the obstetrician's birth-summary note and the midwife's
   delivery note to confirm delayed cord clamping was performed and documented."
2. **The evidence-fetch query (or queries)** that selected, for that patient, the relevant
   notes — across each database involved.
3. **The complete notes**, rendered in full, with the **relevant passages highlighted**.
   Those passages are the verbatim `sources[].citations` substrings, so the highlight lands exactly on
   the text the agent used.

The clinician must be able to see that the highlighted passages, for the correct
patient/encounter, genuinely support the inferred value.

### Aggregate value (a chat aggregate claim — and, deferred, a dashboard indicator)
A value that summarises **many** rows — in v1 a chat sentence like "the average is 4.2 days" (a
deferred dashboard **indicator** would reuse this exact shape) — opens evidence built the same way,
scaled to the aggregate:
1. **Explanation** — what the figure is and how it was computed (the aggregation for a chat claim; a
   stored **formula** for a dashboard indicator), including its **denominator and completeness** (the
   n it covers, and how many contributing cells were blocked / N/A / **unreviewed** —
   [table-population.md](table-population.md#dashboard-output-deferred)).
2. **The aggregate query** that produced it.
3. **The rows it covered**, as a structured table — each row **drillable to its own cell
   evidence** (a direct or interpretive value above). The panel never shows a single arbitrary row
   in place of the set.

So an aggregate is as traceable as a cell: figure → formula → the exact rows → each row's source.

---

## Visual markers & confidence heat-map
*(CEO decision D1 + expansion E2.)*

Three signals render on the table grid, together:

1. **Kind marker** — direct vs interpret, so the clinician knows which values are copies
   and which are inferred (and therefore worth scrutinising).
2. **Review state** (interpret only) — **two distinct flags**:
   - **`not_reviewed`** — an interpret cell the user has not yet opened.
   - **`reviewed`** — an interpret cell the user has opened and looked at.
   At a glance the clinician sees which inferred cells they have already checked and which
   still need their eyes.
3. **Confidence heat-map** — cells tinted by the `low` / `medium` / `high` confidence word,
   so attention routes to the uncertain ones. `high`-confidence direct values read as
   "settled"; `low`/`medium` and interpret values read as "needs your eyes".

These layer cleanly: a cell can be interpret + not_reviewed + `low` confidence (loudest call
for attention) or direct + `high` confidence (quietest).

---

## Reviewing interpret cells
*(The D1 safety gate, kept deliberately simple — no confirm/correct buttons.)*

The grid must make the two affordances obvious: **click to see evidence, double-click to
edit.**

- **Single click on a cell → opens the evidence panel** (explanation, query/queries, and
  for interpret cells the highlighted notes). This is how the user reviews.
- **Double click on a cell → edits it** (normal spreadsheet edit). This is how the user
  corrects a value they disagree with.
- **Review is automatic, not a button.** When the user opens an interpret cell and looks at
  it for more than about **two seconds**, its `review_state` flips `not_reviewed → reviewed`
  and the "needs review" count drops by one. There is no confirm button.
- **Confirmed vs corrected is inferred from editing, not from a button.** If the user
  reviewed a cell and did **not** edit it, the value was correct (`corrected = false`). If
  they **edited** it, the value was wrong (`corrected = true`). That edited-or-not signal is
  exactly what the 100-day self-improvement loop learns from
  ([vision-100-days.md](../vision-100-days.md)).
- The audit is **submit-ready when every interpret cell is `reviewed`**; the UI shows the
  count remaining ("6 cells need review"). Direct cells need no review.

---

## Export

For the product, **export is a plain download of the populated `.xlsx`** — the template with its
values filled in, exactly as a national body expects to receive it. Nothing else:
- **No `Evidence` sheet**, no extra trace columns, no source metadata.
- **No direct/interpret marker** in the file.
- The download is **submit-ready and self-contained**: only the populated template, not an
  artifact for review or testing. Traceability stays in the app, not in the file.
- Members marked inactive/departed (out of cohort) are retained in UI/run history but **excluded**
  from the exported table rows.

The richer evidence-sheet export (an `Evidence` sheet + hyperlinked value cells via
`table_add_evidence`) is **deferred**; its design is kept in
[excel-traceability.md](excel-traceability.md) for when an auditable export is needed.

> **Missing values are simply empty cells.** The table never contains blocked-cell styling,
> in-cell annotations, or a "Blocked items" appendix — in-app or in the download
> ([status-and-blocked-items.md](status-and-blocked-items.md)). The **download works at
> any status**, including a partially completed audit; "Blocked" is surfaced in the agent's
> final message and on the dashboard, not in the file.

---

## Acceptance (traceability)

- Every populated cell is traceable: a single click shows explanation + query (or queries,
  one per source database) + result (direct), or explanation + evidence-fetch query + full
  notes with verbatim passages highlighted (interpret).
- A cell drawing on several databases lists **all** its sources and the query run against
  each.
- Interpret evidence passages are **exact word-for-word substrings** of the notes.
- `confidence` is one of the words `low` / `medium` / `high`, always provided by the agent.
- The grid shows kind, the two interpret review states, and the confidence tint
  simultaneously and legibly; click opens evidence, double-click edits.
- An interpret cell flips `not_reviewed → reviewed` automatically after ~2s of viewing;
  submit-readiness is gated on all interpret cells reviewed.
- Whether a reviewed cell was edited (`corrected = true`) or not (`false`) is recorded
  against the cell and its prompt version.
- Export downloads a **plain, submit-ready `.xlsx`**: the populated template only, with no
  Evidence sheet, no markers, and no source metadata.
