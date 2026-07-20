# Personas & Use Cases

Read [README.md](README.md) first. This document defines **who uses Intero** and the **concrete
situations** in which it is used. Intero is **operational intelligence**: clinicians reach whatever
information they need through a **thread** (a free-ranging conversation) as a **chat** answer or a
**table** (a populated audit). **Clinical audit is one use case** (a table pinned to a Dataset), and
the four audit triggers below remain its sharpest example. *(Dashboards are a **deferred** third
output; some oversight personas below describe a dashboard-led workflow that arrives when dashboards
are built — in v1 they work from tables + table result status.)* The personas and use cases here are the lens for every product and acceptance
decision — if a feature does not serve one of these, it is out of scope for the product.

The product is **operated by clinical staff directly** — the clinician or department
head runs the audit themselves, rather than routing a request through the
data-warehouse team. Doctors drive the audits and own the decisions they feed.
(Who holds the *budget* for it is a cofounder go-to-market question; see
[open-questions.md](open-questions.md).)

> **"Clinician-operated, not routed through IT" — and the IT persona (P6) operates too.**
> Adding a hospital IT engineer persona does **not** put IT in the audit loop as a separate team to
> ticket. IT enables Intero — pointing it at the hospital's source database(s) and provisioning user
> accounts/roles (IAM) — **and**, as a **clinician-superset**, uses it like any clinician
> ([auth-and-access.md](features/auth-and-access.md) §9, [ADR 0003](decisions/0003-admin-is-a-clinician-superset.md)).
> Clinical data access is governed by the hospital's own permissions, the same for everyone. P1–P5 are
> all **clinical staff** (the one `clinician` role); P6 is the **`admin`** role — the `clinician`
> capability plus the admin surface.

---

## Personas

### P1 — The Auditing Clinician *(primary)*
A doctor (registrar or consultant) responsible for completing an audit cycle. Today
they either wait on the data-warehouse team for an extract or read records by
hand to fill the template. They know the clinical meaning of every field but are
not SQL users.
- **Goal:** a correctly populated, submittable table template, with enough
  visible evidence that they trust and can defend each value.
- **Needs:** pick or upload a template, scope it with a Dataset, set
  inclusion/exclusion criteria in plain language, watch it run, verify any value
  by clicking it, export.
- **Fears:** a hallucinated value going into a national submission;
  not being able to explain where a number came from.

### P2 — The Department Head *(primary)*
Leads a clinical department; defines **departmental audits** to check that their
own service is running correctly, and oversees quality. Provides the template
that defines what "good" looks like for their department.
- **Goal:** stand up a recurring departmental audit once and re-run it cheaply.
- **Needs:** register and manage a department's table templates in the **Templates** library
  ([library-and-sources.md](features/library-and-sources.md));
  trust that re-runs are consistent; see who ran what.

### P3 — The Requesting Doctor (ad-hoc) *(primary)*
A doctor who needs a specific slice of data **now** — currently a ticket to the
data-warehouse team, days of latency. There is no template; they describe what
they want in prose (often an email).
- **Goal:** get the data they asked for, without a round-trip.
- **Needs:** describe the data in free text and get an answer. **v1 reality:** an open-ended ask is
  answered as a **chat** (with cited sources), or — when the user **describes/uploads/picks a
  table** — populated as a **table**. **Synthesising a brand-new populated table from pure prose when
  nothing matches** (the "paste the email, get the spreadsheet" ideal) is **deferred** — v1 is
  template-anchored, so a no-match request is answered in chat or asks for a table spec
  ([vision-100-days.md](vision-100-days.md)).

### P4 — The Clinical Lead *(oversight — mostly next-phase)*
Leads a service and watches it — which audits are on track, where the gaps are — rather than running
extractions by hand.
- **Goal:** standing oversight of the department.
- **v1 reality (be honest):** the **dashboards** and the **cross-audit "which audits are on track"
  board** that make this persona's job are **deferred** — so **P4 is largely a next-phase persona.**
  In v1 a lead can open their **own tables** one at a time and read each table's **result status**
  (top-band counters) + per-owned-resource run-attribution ([auth-and-access.md §10](features/auth-and-access.md));
  there is **no cross-audit oversight surface yet**. The full dashboard-led workflow arrives when
  dashboards + the status board are built (next-phase / V2,
  [vision-100-days.md](vision-100-days.md), [status-and-blocked-items.md](features/status-and-blocked-items.md)).

### P5 — The CIO / Director *(executive oversight — next-phase)*
An organisation-level overseer who wants operational performance across departments.
- **Goal:** cross-department operational intelligence at a glance, drillable to evidence.
- **v1 reality:** **deferred like P4** — org-wide dashboards and the cross-department board are
  next-phase. v1 offers org-wide **Datasets** + individual **tables**, not an at-a-glance executive
  view. Listed here so the product is built to bend toward it, not because v1 serves it.

### P6 — The Hospital IT Engineer *(operator of infrastructure — and of the tool)*
A hospital IT/infrastructure engineer who **sets Intero up and keeps it running**, and who **also uses
it like any clinician**. They point Intero at the actual hospital **source database(s)** and create
user accounts and assign roles (IAM), and run audits/queries themselves when they need to.
- **Goal:** stand Intero up safely inside the Trust network, manage who can use it, **and** operate it —
  all from one account, without juggling two logins.
- **Needs:** register/point-at source-database connections; create accounts and assign roles; **plus**
  the full clinical surface (Datasets, threads, tables/dashboards), bounded by the hospital's own data
  permissions like everyone else.
- **Role:** **`admin` — a clinician-superset** (the `clinician` capability plus the admin surface), no
  `*` wildcard, a clinical **peer** not a superuser
  ([auth-and-access.md](features/auth-and-access.md) §9, [ADR 0003](decisions/0003-admin-is-a-clinician-superset.md)).

### Affected, not operators
- **Clinical governance / Information Governance** — owns the constraints
  (read-only, local-only, attribution, no PID leaving the environment). Not a
  user; their requirements shape [auth-and-access.md](features/auth-and-access.md).

---

## The four audit triggers

Every audit Intero runs originates from one of four triggers. They differ in
**one axis that matters to the product**: whether a template already exists.

| Trigger | Template source | Who initiates | Primary flow |
| --- | --- | --- | --- |
| **National audit** | Standardised; published online with deadlines | Auditing clinician (P1) | Apply an existing table to its Dataset ([the request flow](product-flows.md#the-request-flow)) |
| **Regional audit** | Provided by the regional network | Auditing clinician (P1) | Apply an existing table to its Dataset |
| **Departmental audit** | Defined by the department head | Department head (P2) | Register a table, then apply it to its Dataset |
| **Ad-hoc request** | **None — must be created** | Requesting doctor (P3) | Describe it → co-create a table, or just chat ([the request flow](product-flows.md#the-request-flow)) |

The first three are the **same motion** — a known table is applied to its Dataset and populated
(a standard audit ships as a Dataset + table pair, runnable in one step). The ad-hoc trigger is the
one that needs the table *built first*, or answered as a chat.

**Priority order: national → regional → departmental → ad-hoc.** National
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
template, uploads it to Intero, scopes it with a Dataset, sets the
reporting period and cohort criteria, and runs it. **Output:** the official
template, populated and traceable, ready for submission.
- *Why it's the top priority:* national audits are **mandatory and
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
Today this is a data-warehouse ticket. With Intero they paste the request into a thread.
**v1:** they get a **chat** answer (with cited sources), and can turn it into a **table** by
**describing/uploading/picking** a table spec the agent then populates.
**Output (v1):** a cited chat answer, or a populated table once a spec is pinned.
- *the product note:* **fully synthesising a brand-new populated table from pure prose** (no
  template, no user-pinned spec — "paste the email, get the spreadsheet") is **deferred**; v1 is
  template-anchored (a no-match request is answered in chat or asks for a spec). The ad-hoc flow is
  lower priority than UC1–UC3; see [open-questions.md](open-questions.md) Q5 and
  [vision-100-days.md](vision-100-days.md).

---

## What every use case shares (the invariants)

Regardless of trigger, every run must:

1. Be **read-only** — never modify a patient record or hospital system.
2. **Never fabricate** a value — missing/ambiguous data is flagged, not imputed.
3. Distinguish **direct** values (copied from structured data) from **interpretive**
   values (inferred from notes), and **mark interpretive values visibly** in the output
   so the clinician knows which to scrutinise.
4. Make **every value traceable** — to its query and source record (direct) or to
   the notes and highlighted passages the agent read (interpretive).
5. Be **attributed** — tied to the logged-in user who ran it, with every database
   query logged against that user.
6. Keep all **patient-identifiable data local**.

These invariants are the acceptance backbone; see
[acceptance-criteria.md](acceptance-criteria.md).
