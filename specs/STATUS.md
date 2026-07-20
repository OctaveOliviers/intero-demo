# Intero — build status

The **one** place build status lives. The specs describe the target behavior in the present tense and
carry no status; this file tracks how far the build has got. One line per item, linking the spec
section. Keep it minimal — update the status column, don't write prose.

**Legend:** ✅ done · 🟡 in progress · ⬜ todo · ⏸ deferred (out of current scope)

## Pipeline (index → map → table population)

| Status | Item | Spec |
| --- | --- | --- |
| ✅ | Phase 1 — Indexing (database + audit-template models) | [architecture.md](product/architecture.md) Phase 1 |
| ✅ | Phase 2 — Mapping (field mapping, executable block, multi-database) | [architecture.md](product/architecture.md) Phase 2 |
| ✅ | Phase 3 — Table Population (streaming, live traceable population, direct/interpret markers) | [architecture.md](product/architecture.md) Phase 3 |
| 🟡 | Table-population lifecycle | [table-population.md](product/features/table-population.md) Table Population lifecycle |
| 🟡 | Live population | [table-population.md](product/features/table-population.md) Live population |
| 🟡 | Stop + re-run | [table-population.md](product/features/table-population.md) Stop + re-run |
| 🟡 | The table-population record | [table-population.md](product/features/table-population.md) The table-population record |
| ⏸ | Pause / resume | [table-population.md](product/features/table-population.md) Stop + re-run |

## Datasets & library

| Status | Item | Spec |
| --- | --- | --- |
| ✅ | Data library — Datasets (inline detail view, rename/delete, add/remove filters, Filters↔SQL) | [library-and-sources.md](product/features/library-and-sources.md) §A |
| ✅ | Dataset creation — free text → grounded filters (`filters` LLM stage) | [inclusion-criteria-setup.md](product/features/inclusion-criteria-setup.md) Grounding mechanics |
| ✅ | Multi-database Dataset scope | [library-and-sources.md](product/features/library-and-sources.md) Multi-database scope |
| ✅ | Dataset scopes a table run (run-time cohort) | [inclusion-criteria-setup.md](product/features/inclusion-criteria-setup.md) How a Dataset scopes a run |
| ⬜ | Templates (table templates) + Tables (populated audits) left-panel sections | [library-and-sources.md](product/features/library-and-sources.md) §B |
| ⬜ | Editable template SSoT — field name/description auto-save to `spec.json`, consumers read the artifact (not hardcoded), edits preserved across re-index | [library-and-sources.md](product/features/library-and-sources.md) Editing a template · [indexing-and-mapping.md](product/features/indexing-and-mapping.md) editable single source of truth |
| ✅ | Sharing — Datasets/templates/tables (editor-only, managed from the resource's Share dialog chip-input; received items appear in-library; newly received Datasets show Data library notification + Keep/Delete until handled; table→Dataset access-only cascade; threads not shareable) | [library-and-sources.md](product/features/library-and-sources.md) Sharing · [auth-and-access.md](product/features/auth-and-access.md) §10 |
| ⏸ | Unstructured-note filters (follow-up job) | [inclusion-criteria-setup.md](product/features/inclusion-criteria-setup.md) Follow-up job |
| ⏸ | Projects / folders (left panel is flat) | [open-questions.md](product/open-questions.md) Q33 |

## Outputs & navigation (chat + table; dashboard deferred)

| Status | Item | Spec |
| --- | --- | --- |
| ✅ | `navigate` — split `lookup_execute` into `describe` (live structure + `model.json` codes) + `join-paths` (FK/identity graph); `describe` now path-granular (table **or** column depth) | [navigation.md](product/features/navigation.md) |
| ✅ | `navigate` — `catalog` (list bound DBs + `summary`) + `search` (keyword grep over `model.json` metadata) | [navigation.md](product/features/navigation.md) · [open-questions.md](product/open-questions.md) Q43 |
| ✅ | `navigate` — generic **collection** seam: `catalog`/`search`/`describe` over `databases` (default) + `datasets` + `templates` (all registered); consumed by `chat-answer` | [navigation.md](product/features/navigation.md) · [ADR 0005](product/decisions/0005-navigation-is-a-generic-verb-set-over-collections.md) · [open-questions.md](product/open-questions.md) Q43 |
| ✅ | Table output — table population + `table-fill` (hard cohort, pinned to the table) | [table-population.md](product/features/table-population.md) Population: the two steps |
| ✅ | Thread + table front-end flow — unscoped thread (chat surface), sub-agent + inline inspector + completion toast (Q42), scope binds to the table (cohort enforced, fail-closed; Q36 auto-persist), flat-panel Tables/Threads sections | [product-flows.md](product/product-flows.md) Threads, tables & outputs · [open-questions.md](product/open-questions.md) Q42/Q36 |
| ✅ | Tables/Chats left-panel rows — one shared row component (open · inline rename · delete), selected-row highlight, new-chat deferral (thread minted on first message, not on button press), per-user "seen" status dot (building amber → finished-unopened blue → opened none), instant-open of a finished table (no agent re-run) | [product-flows.md](product/product-flows.md) The left panel · [api.md](product/contracts/api.md) · [storage-layout.md](product/contracts/storage-layout.md) |
| ✅ | Chat output — `chat-answer` skill + per-message (permission-bounded) scoping: a chat answer renders inline in the thread with inline citations; Dataset vs whole-DB scope is disclosed per message (quiet Dataset chip, prominent whole-DB callout); citation clicks open the evidence panel; aggregate citations carry denominator/completeness + covered rows; thread message streaming emits inline deltas. Chat-mode `sql_execute` is read-only, fail-closed at registered DBs, and does no cohort injection. | [table-population.md](product/features/table-population.md) Chat output · [chat-answer.md](product/contracts/chat-answer.md) · [open-questions.md](product/open-questions.md) Q43/Q40 |
| ⏸ | Dashboard output — indicator reducer + `dashboard.json` (formula + viz) | [table-population.md](product/features/table-population.md) Dashboard output (deferred) · [open-questions.md](product/open-questions.md) Q31/Q43 |

## Auth & access

| Status | Item | Spec |
| --- | --- | --- |
| 🟡 | Login + network gate, sessions | [auth-and-access.md](product/features/auth-and-access.md) §1 |
| 🟡 | Attribution & query logging | [auth-and-access.md](product/features/auth-and-access.md) §4 |
| 🟡 | The run log | [auth-and-access.md](product/features/auth-and-access.md) §5 |
| 🟡 | Persistence model (control-plane DB) | [auth-and-access.md](product/features/auth-and-access.md) §6 |
| ⬜ | Prompt versioning | [auth-and-access.md](product/features/auth-and-access.md) §5 |
| ⬜ | Hospital-role RBAC — roles & policy (IAM layer; `admin` = clinician-superset, [ADR 0003](product/decisions/0003-admin-is-a-clinician-superset.md)) | [auth-and-access.md](product/features/auth-and-access.md) §9 · [contract §4](product/contracts/control-plane-schema-and-permissions.md) |
| ⬜ | Frontend role-based gating (admin settings surface) | [auth-and-access.md](product/features/auth-and-access.md) §13 |
| ✅ | Enforcement & invariants (server-side, fail-closed) — owner-or-grant reads on dataset/template/table; table-grant reads on wrapped run status/workbook/download; run stop/stream/refresh owner-only; `/api/sql` gated on `dataset.query`; admin-as-peer (no override); ordered 401/403/404 | [auth-and-access.md](product/features/auth-and-access.md) §14 |
| ⬜ | Seeding (seed/demo account → `admin`) | [auth-and-access.md](product/features/auth-and-access.md) §15 · [contract §10](product/contracts/control-plane-schema-and-permissions.md) |
| ⬜ | Resource change proposals → approval-token writes — agent proposes Dataset/Template create/edit via `ask_user_question`; accept mints a one-use token; server-side-verified write tools consume it (patch grammar owed) | [ask-user-questions.md](product/features/ask-user-questions.md) Structured proposals · [ADR 0006](product/decisions/0006-primary-thread-agent-owns-output-selection.md) · [open-questions.md](product/open-questions.md) Q44 |
| ✅ | Resource grants & sharing (§10) — `resource_grants` table, grant CRUD, `GET /api/clinicians`, owner self-grant backfill, editor-only sharing UI; threads not grantable | [auth-and-access.md](product/features/auth-and-access.md) §10 · [contract §5](product/contracts/control-plane-schema-and-permissions.md) |
| ⏸ | Dataset-scoped data access (∩ hospital permissions) — **blocked on Q37** | [auth-and-access.md](product/features/auth-and-access.md) §11 · [contract §6](product/contracts/control-plane-schema-and-permissions.md) |
| ⏸ | Departed-user recovery (ownership reassignment) — needs the grants layer | [auth-and-access.md](product/features/auth-and-access.md) §15 · [contract §11](product/contracts/control-plane-schema-and-permissions.md) |

## Evals

| Status | Item | Spec |
| --- | --- | --- |
| 🟡 | Scaffolding + prepopulate fill-rate eval | [acceptance-criteria.md](product/acceptance-criteria.md) |
| ⬜ | Interpretive (interpret-cell) accuracy eval | [acceptance-criteria.md](product/acceptance-criteria.md) |

## Owed contracts (the Q31 reframe)

| Status | Item | Spec |
| --- | --- | --- |
| 🟡 | Catalog entities + endpoints: `dataset` ✅ (#287); **`thread`** ✅ + **`table`** ✅ (this build); `project` ⏸ (deferred) | [open-questions.md](product/open-questions.md) Q31 |
| ✅ | `resource_grants.resource_type` is `dataset`/`template`/`table` (dropped `thread`/`project`); table→Dataset access-only cascade — landed in the sharing build | [open-questions.md](product/open-questions.md) Q31 · [auth-and-access.md](product/features/auth-and-access.md) §10 |
| ✅ | Chat + table endpoints — **`table` endpoints** (`/api/tables`) ✅ + thread endpoints (`/api/threads`) ✅ + chat streaming over `POST /api/threads/{id}/messages/stream` ✅ | [open-questions.md](product/open-questions.md) Q31 |
| ✅ | Two-step table-population re-freeze (prepopulate → the table agent) — `try_llm` deleted, `populate.py` landed, contracts re-frozen | [open-questions.md](product/open-questions.md) Q30 |
| ⏸ | `dashboard.json` schema + dashboard endpoints (deferred — dashboards not in v1) | [open-questions.md](product/open-questions.md) Q31/Q43 |
