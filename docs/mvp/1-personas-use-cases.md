# Personas & Use Cases

Read [README.md](./README.md) first. This document defines **who uses Intero**
and the **concrete situations** in which an audit gets run. The personas and use
cases below are the lens for every product and acceptance decision — if a
feature does not serve one of these, it is out of scope for the MVP.

The MVP is **operated by clinical staff directly** — the clinician or department
head runs the audit themselves, rather than routing a request through the
data-warehouse team. Doctors drive the audits and own the decisions they feed.
(Who holds the *budget* for it is a cofounder go-to-market question; see
[open-questions.md](./open-questions.md).)

---

## Personas

### P1 — The Auditing Clinician *(primary)*
A doctor (registrar or consultant) responsible for completing an audit cycle. Today
they either wait on the data-warehouse team for an extract or read records by
hand to fill the template. They know the clinical meaning of every field but are
not SQL users.
- **Goal:** a correctly populated, submittable audit template, with enough
  visible evidence that they trust and can defend each value.
- **Needs:** pick or upload a template, point it at the right database(s), set
  inclusion/exclusion criteria in plain language, watch it run, verify any value
  by clicking it, export.
- **Fears:** a hallucinated value going into a national submission;
  not being able to explain where a number came from.

### P2 — The Department Head *(primary)*
Leads a clinical department; defines **departmental audits** to check that their
own service is running correctly, and oversees quality. Provides the template
that defines what "good" looks like for their department.
- **Goal:** stand up a recurring departmental audit once and re-run it cheaply.
- **Needs:** register and manage a department-specific template in the **Library &
  Source Management** surface ([9-library-and-sources.md](./9-library-and-sources.md));
  trust that re-runs are consistent; see who ran what.

### P3 — The Requesting Doctor (ad-hoc) *(primary)*
A doctor who needs a specific slice of data **now** — currently a ticket to the
data-warehouse team, days of latency. There is no template; they describe what
they want in prose (often an email).
- **Goal:** get the data they asked for, as a spreadsheet, without a round-trip.
- **Needs:** describe the data in free text → the tool builds a template *and*
  populates it.

### Affected, not operators
- **Clinical governance / Information Governance** — owns the constraints
  (read-only, local-only, attribution, no PID leaving the environment). Not a
  user; their requirements shape [7-auth-and-audit-log.md](./7-auth-and-audit-log.md).

---

## The four audit triggers

Every audit Intero runs originates from one of four triggers. They differ in
**one axis that matters to the product**: whether a template already exists.

| Trigger | Template source | Who initiates | Primary flow |
| --- | --- | --- | --- |
| **National audit** | Standardised; published online with deadlines | Auditing clinician (P1) | Populate an existing template ([Flow A](./2-product-flows.md)) |
| **Regional audit** | Provided by the regional network | Auditing clinician (P1) | Populate an existing template (Flow A) |
| **Departmental audit** | Defined by the department head | Department head (P2) | Register, then populate an existing template (Flow A) |
| **Ad-hoc request** | **None — must be created** | Requesting doctor (P3) | Describe → build template → populate ([Flow B](./2-product-flows.md)) |

The first three are the **same product motion** — a known template gets
populated. The ad-hoc trigger is the one that needs the template *built first*.

**MVP priority order: national → regional → departmental → ad-hoc.** National
audits are mandatory, recurring, and carry financial and regulatory penalties for
non-completion, so the demand is non-discretionary and the pain is most acute —
they are the highest-value target. Regional next (it is also our demo and test
fixture; see UC2). Departmental after that. Ad-hoc is the most flexible but
lowest priority. The agent must, at minimum, run the **regional cord-pH audit
(UC2) correctly to pass the demo tests**, while the national motion is identical
and is what makes the product commercially compelling.

### UC1 — National audit
A national body (e.g. a neonatal or stroke audit programme) publishes a standard
template and a submission deadline. The clinician downloads the official
template, uploads it to Intero, points it at the relevant database(s), sets the
reporting period and cohort criteria, and runs it. **Output:** the official
template, populated and traceable, ready for submission.
- *Why it's the top MVP priority:* national audits are **mandatory and
  recurring**, with **financial and regulatory penalties** for non-completion, so
  demand is non-discretionary. The template is also fixed and reused nationally,
  so indexing and mapping pay off across every Trust that runs it.

### UC2 — Regional audit
A regional clinical network runs a shared audit across all units in the region —
**the cord-pH audit is our worked example** (umbilical cord blood-gas health at
birth, run across every maternity unit in a region). The network provides the
template. Each unit runs it against its own database. **Output:** the regional
template, populated for that unit, comparable across the network.
- *This is the fixture the codebase already carries* (`database/cord-ph/`), and
  the scenario the demo dramatises.

### UC3 — Departmental audit
A department head wants to check their own service — e.g. documentation quality,
turnaround times, adherence to a local protocol. They define a template that
encodes what they want to measure and register it once. The audit is then re-run
on a schedule (monthly, quarterly). **Output:** a department-defined template,
populated consistently each cycle.
- *Why it wins:* the template is bespoke but **stable**, so the cost of
  indexing/mapping is amortised across many re-runs.

### UC4 — Ad-hoc request
A doctor needs data that no template covers: *"All emergency laparotomies in the
last 6 months with time-to-theatre over 4 hours, and their 30-day mortality."*
Today this is a data-warehouse ticket. With Intero they paste the request; the
tool **creates a template** from the description (the columns/fields implied by
the request), maps it to the database, and populates it — in one motion.
**Output:** a freshly-built, populated spreadsheet answering the request.
- *MVP note:* the ad-hoc flow is a thin extension of the core motion — it adds a
  "build the template first" step before the same map → run pipeline. It is in
  scope but lower priority than UC1–UC3; see [open-questions.md](./open-questions.md)
  for how far to take it in the MVP.

---

## What every use case shares (the invariants)

Regardless of trigger, an audit run must:

1. Be **read-only** — never modify a patient record or hospital system.
2. **Never fabricate** a value — missing/ambiguous data is flagged, not imputed.
3. Distinguish **direct** values (copied from structured data) from **indirect /
   interpretive** values (inferred from notes), and **mark indirect values
   visibly** in the output so the clinician knows which to scrutinise.
4. Make **every value traceable** — to its query and source record (direct) or to
   the notes and highlighted passages the agent read (indirect).
5. Be **attributed** — tied to the logged-in user who ran it, with every database
   query logged against that user.
6. Keep all **patient-identifiable data local**.

These invariants are the acceptance backbone; see
[acceptance-criteria.md](./acceptance-criteria.md).
