# Build prompt — Hospital-role RBAC (IAM layer only)

> Artifact produced by `/build-loop`. Hand this to a **fresh, independent agent** as the
> orchestrator prompt. It is not a stored "build plan" in the spec sense — the per-issue
> implementation plans are still derived on the fly from `build-plans/INSTRUCTIONS.md`.

---

# Build: Hospital-role RBAC — the IAM layer only

I'm building real DB-backed hospital-role RBAC (the IAM layer only) to give Intero
genuine roles, for the hospital IT engineer (persona P6 — a clinician-superset) and
all clinical staff (the one `clinician` role): an admin must operate the tool exactly
like a clinician AND get an admin Settings screen to manage users/roles and
source-database connections, while clinical staff use the app as today. This is a
**hard** problem — it replaces the live auth path, adds fail-closed server-side
enforcement, changes the control-plane schema, and gates the SPA nav. Scope it at the
top of your range. All commands below run from `intero/` unless noted.

## Read first — completely, before any code
- intero/specs/README.md — the index of where every spec lives; defer to it for paths
- intero/specs/product/features/auth-and-access.md — §1, §3, §9, §13, §14, §15 (the auth UX + role-gated nav + first-login reset)
- intero/specs/product/contracts/control-plane-schema-and-permissions.md — §2 tables, §3 (eval order), §4 (the three roles + exact permission sets), §8 (read for context only — see scope note), §9 (endpoint authorization), §10 (seeding)
- intero/specs/product/contracts/api.md — the Auth + Authorization rules (401 vs 403 behavior, endpoint shapes)
- intero/specs/product/decisions/0003-admin-is-a-clinician-superset.md — why admin = full clinician set + 3 infra keys, no `*`, a peer not a superuser
- intero/specs/product/acceptance-criteria.md — the "Auth & audit log" block (the hospital-role RBAC bullets) is your acceptance contract
- intero/specs/product/README.md + architecture.md + CONTEXT.md — how it fits + the canonical glossary (use these terms exactly)
- intero/specs/STATUS.md — the deferred fences (what is explicitly NOT in this build)
There is no pre-written build plan — you slice it into issues next.

Skills this prompt names (`/to-issues`, `/tdd`, `/prototype`): invoke each as a skill;
if your harness won't auto-invoke it, read and follow its `SKILL.md` in `.agents/skills/`.
For any web browsing / screenshots use the `/browse` skill — never the chrome MCP directly.

## Commands — use these exact ones, don't guess (run from `intero/`)
- Server tests: `python3 -m unittest discover -s server -p '*_test.py'`
- Core tests:   `python3 -m unittest discover -s core -p '*_test.py'` and `python3 -m unittest discover -s core/table_population/tests -p '*.py'`
- Frontend tests: `cd app && npm install && npm test`   (node --test)
- Lint/types:   `ruff check`   (the pre-commit gate runs ruff; keep it green)
- Run (seeded, no LLM needed for this work): `make dev-seeded` (backend :8000) then in a new terminal `cd app && npm install && npm run dev` (UI :5173)
This RBAC work needs **no** LLM — seeding and all tests are deterministic.

## Slice the work into issues — run /to-issues
Break the spec into **vertical-slice issues on the tracker** with `/to-issues`: each
issue is a thin slice through all layers (schema + resolver + endpoint enforcement +
UI + tests as needed), verifiable on its own — not a horizontal "build the schema"
layer. `/to-issues` tags each slice **AFK** (an agent finishes it unattended) or
**HITL** (needs a human checkpoint — here, the admin-UI design call below is HITL),
and records blocking relationships in dependency order. The **issue list is the
persisted task board**; the per-issue *implementation* plan stays ephemeral — derive
each from `intero/specs/build-plans/INSTRUCTIONS.md` (the backwards, output-first
method) in working memory, not committed.

A sketch of the vertical slices (refine via /to-issues, keep dependency order):
1. **Schema + DB-backed resolver + role on the wire** — `roles`/`permissions`/`role_permissions` tables; `users` gains `role_id`/`is_active`/`display_name`/`must_reset_password`; role resolves from `users.role_id` (never username); `role` returned by `GET /api/auth/me` and `POST /api/auth/login`; the Svelte auth store + nav consume it. Nothing gated yet. **(This is the first slice — see Stop.)**
2. **Fail-closed server enforcement** — implement the §3 eval order (session→active→role-permission→grant→ownership) with 401/403 per api.md; make IAM endpoints and the **mutating** source-DB endpoints admin-only (`POST /api/databases/upload`, `PATCH`/`DELETE /api/databases/{id}`, `POST /api/databases/{id}/reindex`, and `GET /api/databases/{id}` detail); keep `GET /api/databases` summary list clinician-readable (pre-Q31); clinical endpoints serve clinician AND admin alike.
3. **First-login password reset** — `must_reset_password` lets a user authenticate only to reach a self-service set-password endpoint; every other endpoint 403 until cleared.
4. **Remove the legacy** — delete username-based `role_for_user()` and the admin `*` wildcard in `server/auth/permissions.py`; map old keys (`audit.*`, `database.read/query`, `mapping.edit_criteria`) onto the new key set; no username→role logic may remain anywhere.
5. **Seeding** — seed/demo account → `admin` (runs cord-pH end-to-end AND reaches the admin surface); additional users default to `clinician`; backfill owner `manage` self-grants per §10 only insofar as the grant table exists (resource-grant *enforcement* is out of scope — see below).
6. **Admin Settings surface** — role-gated nav: clinician sees today's app; admin sees the same app PLUS a net-new admin surface in Settings (today's dead `SettingsModal.svelte`): user/role management + source-DB connections. **HITL — prototype first (see "You decide").**

## How you run — you are the orchestrator
Work the issues in dependency order; run non-blocked issues in parallel.
For each issue:
1. Dispatch a builder subagent to implement just that issue, **test-first via the
   `/tdd` skill** (red → green → refactor, one behavior at a time, tested through the
   public HTTP/route interfaces and the Svelte store). Run independent builders in
   separate worktrees so parallel work doesn't collide.
2. If the builder hits a taste/design call it can't resolve from the spec (the admin
   Settings surface, issue 6), it uses `/prototype` — a few switchable UI variations —
   and surfaces them for me to choose **before** building the real thing.
3. When it reports done, open the review gate below — you never grade your own build.
4. Integrate, mark the issue done on the tracker, move to the next.

## Review gate — independent, fresh-context, in parallel
After each issue, spin up these reviewers (in `.agents/agents/`) — adversarial by
default: assume there's a problem until the evidence says otherwise. Each gets the
spec + the diff only — NOT the builder's explanation — and returns pass/fail per
condition, checking by the method tagged in "Done when":
- `acceptance-reviewer` — does the build satisfy the auth-and-access spec + the
  acceptance-criteria "Auth & audit log" bullets, with outputs conforming to the
  control-plane and api.md contracts? ("Did we build the right thing?")
- `code-reviewer` — correct and safe first (the §3 eval order, fail-closed defaults,
  401-vs-403 correctness, the read-only / local-only invariants, no username→role
  logic and no `*` wildcard left behind), then simple/maintainable within
  architecture.md's boundaries. ("Is it built right?")
On any fail, this is a loop, not a one-shot gate — **oscillate until it converges**:
1. The builder **triages**: fix the legitimate findings; for any it judges wrong, it
   does NOT silently comply — it's ready to defend why that one is out of scope.
2. Re-review with a **fresh reviewer agent each round**, spec + diff only, plus a
   one-line note per rejected finding — *"already raised X; rejected because Y — look
   elsewhere"* — so it engages that reasoning and hunts for what else is wrong.
3. Repeat until a fresh pass returns pass/accept on every condition AND the builder
   itself sees no remaining gap — don't ship just because the reviewer went quiet.
Bound it at **10 rounds** (and by the Stop budget, whichever comes first). Still
contested after 10 rounds → halt and escalate to me. Don't move past a failing gate.

These are strong defaults, not a closed set. If an issue needs a review they don't
cover (e.g. a data-recreation-safety or accessibility lens on the admin surface),
spin up an ad-hoc reviewer subagent inline.

## Done when — each line tagged with how it's checked
- [Functional] `python3 -m unittest discover -s server -p '*_test.py'` exits 0, with new tests asserting: role resolves from `users.role_id` not username; for EACH admin-only endpoint (the IAM routes + `POST /api/databases/upload`, `PATCH`/`DELETE /api/databases/{id}`, `POST /api/databases/{id}/reindex`, `GET /api/databases/{id}` detail) a `clinician` gets 403 and an `admin` 200; `GET /api/databases` summary list stays clinician-readable; a user with `must_reset_password=true` gets 403 everywhere except the set-password endpoint; the §3 eval order yields 401 (unauthenticated) vs 403 (unauthorized) exactly per api.md.
- [Functional] `cd app && npm test` exits 0 (auth store + role-gated nav).
- [Functional] `ruff check` exits 0.
- [Functional] `grep -rn` over `server/` shows NO username-derived role logic and NO `*` wildcard remain, and the old permission keys (`audit.*`, `database.read/query`, `mapping.edit_criteria`) are gone / mapped — no dangling references.
- [Functional] After `make seed` + a clean startup, the seed/demo account resolves to `admin` and a freshly-created user defaults to `clinician`; re-running is idempotent.
- [Visual] The admin Settings surface (user/role management + source-DB connections) renders for `admin` and is **absent** for `clinician` — capture both via `/browse` screenshots; matches the prototype I approved.
- [Functional/Visual — the live demo gate] Run the app and walk it via `/browse`: log in as the seed `admin` → the admin surface is present and the cord-pH audit runs end-to-end; log in as a `clinician` → no admin surface, and a direct hit on an admin endpoint returns 403 with a non-leaking unauthorized state. Show me this run.
- [Judgment] The new IAM module reads cleanly, enforcement is **fail-closed and centralized** (one permission-check path in §3 order), and the legacy is fully gone with nothing dangling — scored against the acceptance-reviewer + code-reviewer rubrics above.
- [You decide] The admin Settings UI design — `/prototype` 2–3 switchable variations and pause for me to pick before building the real surface.
If a condition isn't checkable, rewrite it until it is.

## Stop
Cap total wall-clock at **~2 hours**, whichever comes first with the 10-round gate.
Build the **first slice only — "roles in the DB + `role` on `/api/auth/me` and
`/login`, consumed by the Svelte auth store, nothing gated yet"** — and let me see
that run before you widen scope to enforcement, the reset flow, or the admin UI.
Still failing at the bound? Halt and report what's blocking — don't loop.

## Escalate to me only for
The admin-UI prototype pick (the [You decide] above); any destructive or irreversible
action beyond recreating/reseeding the local `var/state.db` (which is fine — see
scope); a review finding you and a fresh reviewer still disagree on after you've
rebutted it and it held firm; real scope changes; or input only I can provide.
Otherwise proceed end to end, and never end your turn on a promise.

## Before you report
Audit every claim against a tool result from this session. Unverified? Say so. Tests
failed? Show the output. List any ad-hoc reviewer roles you spun up beyond
acceptance/code, so I can track which proved useful. Open with the outcome — the
TLDR I'd ask for, in complete sentences.

## Scope — in, out, and assumptions
IN SCOPE (replace the legacy auth, leave no legacy behind):
- DB-backed `roles`/`permissions`/`role_permissions`; `users` gains `role_id`,
  `is_active`, `display_name`, `must_reset_password`. Role resolves from
  `users.role_id` — never from username.
- Three roles per contract §4: `clinician` (the clinical set), `admin` (the FULL
  clinician set + the three infra keys `iam.manage_users` / `iam.manage_roles` /
  `database.manage` — NO `*` wildcard, a clinical PEER with no override on others'
  resources), `agent` (none).
- `role` returned by `GET /api/auth/me` and `POST /api/auth/login`; the Svelte auth
  store + nav consume it.
- Server-side, fail-closed enforcement (contract §3 order, 401/403 per api.md): IAM
  endpoints and the mutating source-DB endpoints (`POST /api/databases/upload`,
  `PATCH`/`DELETE /api/databases/{id}`, `POST /api/databases/{id}/reindex`,
  `GET /api/databases/{id}` detail) are admin-only; clinical endpoints serve
  clinician AND admin alike; `GET /api/databases` summary list stays
  clinician-readable (pre-Q31).
- Frontend: role-gated nav — clinician sees today's app; admin sees the same app PLUS
  the net-new admin surface in Settings.
- First-login password reset (`must_reset_password`): authenticate only to reach a
  self-service set-password endpoint; everything else 403 until cleared.
- Seeding: seed/demo account → `admin`; additional users default to `clinician`.
- REMOVE the legacy: username-based `role_for_user()` and the admin `*` wildcard in
  `server/auth/permissions.py`; map old keys onto the new set. No username→role logic
  may remain.

OUT OF SCOPE — do NOT build (deferred, fenced in STATUS.md):
- Resource grants & sharing enforcement (§5/§10) — blocked on Q31 (dataset/thread/
  project entities don't exist). You may create the `resource_grants` table + the
  seed self-grant backfill if a slice needs it, but build NO grant-checking endpoints.
- Dataset-scoped data access ∩ hospital permissions (§6/§11) — blocked on Q37; stays
  fail-closed.
- Departed-user ownership reassignment, prompt versioning, the run/thread rename.
- Contract §8's **physical** DB-role separation (`api_app` / `orchestrator_runtime` /
  `agent_runtime_writer` / `clinical_readonly`) — read for context; SQLite can't
  enforce DB roles. In scope from §8: only that the `agent` role holds **no** route
  permissions and IAM/catalog tables are not mutable by non-admins.

Open questions still logged, all non-blocking for this build/the demo: Q37 (hospital
DB-permission mechanism), Q38 (departed-user recovery), Q39 (strict admin/clinical
separation as a deploy option). Keep them fenced; don't design them.

ASSUMPTIONS (stated because I'm acting on them):
- The control plane is **local SQLite** (`var/state.db`) with idempotent
  `CREATE TABLE IF NOT EXISTS` schema applied at startup — there is **no Alembic / no
  migration framework**, and `make seed` + startup rebuild it. So evolving the schema
  and **recreating/reseeding the local `var/state.db` is fine without pausing** —
  there is no production data and no one-way-door migration. Add columns/tables
  idempotently in the existing `store.init_store()` style.
- Simplicity first: one centralized fail-closed permission check, minimal admin UI
  reusing the existing design-system tokens. No abstractions or config beyond what the
  spec asks for.
