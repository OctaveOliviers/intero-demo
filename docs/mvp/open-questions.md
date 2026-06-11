# Open Questions

Decisions still needed — written for the cofounders to answer precisely. Each is a real
fork: where there's a working assumption, it's stated so we can proceed until overridden.
Grouped by who owns the call.

---

## Commercial / go-to-market

**Q1 — Who holds the budget?** The MVP is clinician-operated, but clinicians rarely control
spend. Is the payer **clinical governance**, the **BI / data-warehouse budget**, or a
**department**? *Why it matters: it changes the pitch and the buyer. Surfaced as the main
gap in the CEO review — we changed the operator to clinicians without re-validating the
payer.*

**Q2 — Is the BI / data-warehouse analyst a channel, even though they're not the operator?**
They feel the pain and hold procurement relationships. *Why it matters: the office-hours doc
argued they're the fastest route to a procurement conversation; we removed them as a user but
not necessarily as a champion.*

**Q3 — Direct-to-Trust or partner with an incumbent (AMaT, Radar Healthcare)?** *Why it
matters: distribution vs control; affects whether we build for their forms or our own.*

**Q4 — Sanofi / pharma: same product or a different one?** *Why it matters: focus. Is it the
same core with different data sources, or a separate RWE/health-economics product?*

## Product scope

**Q5 — How far does ad-hoc (Flow B) go in the 10-day MVP?** It's the lowest-priority trigger.
*Assumption: a basic build-then-populate, behind the same engine. Confirm we're not stubbing
it entirely vs investing more.*

**Q6 — Which national audit is the first commercial proof?** The motion is identical to the
cord-pH regional demo, but national is the highest-value trigger. *Why it matters: we need a
concrete first national template + its deadline to anchor the pitch.*

**Q7 — How many databases for the first demo?** Just cord-pH, or a real multi-database
scenario (EHR + labs + radiology) to prove the N-database capability on camera? *Why it
matters: demoing multi-database needs ≥2 real datasets prepared.*

## Clinical safety & trust

**Q8 — What interpretive accuracy bar do we need before we trust/demo it?** The tracked metric
is the **not-edited rate** (reviewed interpret cells the clinician didn't correct). *Why it
matters: defines "good enough" for the safety gate and for showing a clinician.*

**Q9 — Is `low` / `medium` / `high` confidence enough, and how does the agent decide the
level?** *Why it matters: confidence drives the heat-map and routes attention; if the agent
can't assign it meaningfully, the signal is noise.*

**Q10 — Where exactly is the human-in-the-loop line?** Interpret cells already require review.
Do **low-confidence direct** values also need review before they count? *Why it matters:
trades safety against the clinician's time.*

## Auth, data & infrastructure

**Q11 (resolved 2026-06-08) — MVP auth baseline.** Use local Intero accounts + server-side
sessions now, designed for later SSO replacement. Remaining open detail is only deployment
policy values (for example final timeout lengths with hospital IT).

**Q12 (resolved 2026-06-08) — Control-plane persistence model.** The architectural contract is
one logical control-plane data model (IAM + catalog + runtime + logs), with current split
stores (`state.db` + `auth.sqlite`) treated as transitional implementation. Production target
is hospital-hosted transactional storage planned with Trust IT.

**Q13 — IG sign-off path for a de-identified demo at a Trust?** *Why it matters: even a
de-identified demo can require information-governance review, which can block the date.*

**Q29 — Session length & timeout policy.** *Assumption: session cookie + 8-hour expiry +
30-minute idle timeout (see doc 7 §Persistence, the `sessions` table). Confirm with hospital IT —
some Trusts mandate specific session lengths.* (Extends Q11.)

## Technical

**Q14 — OpenCode vs direct Claude API for the run agent?** *Why it matters: stability. The
current orchestration depends on OpenCode versioning; a direct API may be more reliable for a
product.*

**Q15 — How is interpret-value evidence shaped and returned by the populate spec / executor, and how do we
enforce the verbatim-passage rule?** *Why it matters: the agent must return note passages
word-for-word (not paraphrased) for the traceability highlight to be honest. Residual from
the CEO review's precompute decision.*

## Library & sources

**Q16 — Refresh mechanism.** Automated scrape/ingest of national-audit + BPT schemas vs. a
manual curation queue — and what **approval gate** sits before a new audit-year version goes
live in the library? *Why it matters: governs how the version-tracked library stays current
without silently shifting a running job's basis.*

**Q17 — What is the "Regional" level?** ICB-shared templates? And is it in MVP scope, or do we
ship **National / Local only** for v1? *Why it matters: the library groups cards by level; an
undefined level can't ship.*

**Q18 — Fork semantics.** How does a Local audit cloned from a national template **show its
divergence** from the source, and does it **re-base** when the national version updates? *Why
it matters: avoids silent drift between a local fork and the national source of truth.*

**Q19 — BPT pricing placement.** Where do base price, BPT price, conditional top-up, MFF, and
SSEM attach — to the template card, or a **separate pricing-reference item** the template links
to? *Why it matters: keeps clinical criteria and finance cleanly separated.*

**Q20 — Verify two measurement vehicles.** Confirm **DKA / hypoglycaemia** and **Parkinson's**
against the full Annex C text before building their templates. *Why it matters: both are
flagged uncertain; building on a wrong basis wastes the synthesis.*

## Completion status & blocked items

**Q21 — Owner inference.** How reliably can the agent name the responsible role/specialty from
the record, and what is the fallback when it cannot (a generic "data team" owner)? *Why it
matters: the chase only works if it reaches the right person.*

**Q22 — "Expected by" dating.** Is there a source for when a value *should* have been recorded
(to compute how overdue a gap is), or is age-of-gap measured only from the first run? *Why it
matters: prioritising chases and showing overdue-ness.*

**Q23 — Reminder channel.** In-app list only for the MVP, or integration with email/messaging
(which raises gated-send and IG questions)? *Why it matters: the scope and governance of any
outbound action.*

**Q24 — `AWAITING_RESULT` vs `MISSING_SOURCE_RECORD`.** Where is the threshold when a result is
expected but not yet ordered? *Why it matters: the reason code drives who gets chased.*

**Q25 — Merge IN VERIFICATION and BLOCKED into one "Needs attention" column for MVP
simplicity?** *Recommendation: keep separate — different owners, different actions. Why it
matters: conflating them routes the wrong action to the wrong person.*

## Rigor review (2026-06-04)

**Q26 — Prompt version on re-run.** A re-run pins the same template version (doc 9); should it
also pin the **prompt version**, or always use the latest? *Why it matters: a re-run with a
newer prompt changes the basis vs the original run. (GAP-5.)*

**Q27 — Low-confidence direct values.** Direct values count immediately, but the heat-map tints
low/medium as "needs eyes" — should a **low-confidence direct** value require review like an
interpret cell? *Why it matters: resolves the mixed signal; relates to Q10. (GAP-6.)*

**Q28 — Re-run idempotency.** On re-run (the MVP's recovery path, pause/resume deferred per A1),
does the executor correctly **skip already-completed regions** with no double-write and no
skipped cell? *Why it matters: re-run is the only resume mechanism in the MVP, so it must be
exactly idempotent. (GAP-7.)*

---

*Resolved since the 2026-05-29 office-hours doc (no longer open): operator = clinicians/dept
heads (not BI analyst); interpretive values are in the MVP (not deferred to v2); terminology =
"audit" everywhere; precompute = a **parameterised SQL spec + fixed executor** (the
`executable` block in `mapping.json`; eng review A2 superseded the earlier generated
`populate.py`). See [Plan.md](./0ld/Plan.md) for the superseded positions.*
