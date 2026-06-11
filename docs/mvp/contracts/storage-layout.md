# Contract — Storage layout & data flow

**Status: Normative.** This contract pins **where every artifact lives on disk**
and **how data flows** through indexing → mapping → running. It is the single
source of truth that the front-end, the orchestrator, the three tier
implementations, and the indexing/mapping builders all read against.

The cell-row shape itself is governed by
[`state-schema.md`](./state-schema.md) and
[`cell-resolution.schema.json`](./cell-resolution.schema.json); the three model
shapes are governed by `audit-spec.schema.json` / `database-model.schema.json` /
`mapping.schema.json`. This contract layers **paths and ownership** on top of
those — *where* each artifact lives and *who* writes/reads it.

Control-plane schema and permission semantics are governed separately by
[`control-plane-schema-and-permissions.md`](./control-plane-schema-and-permissions.md).
This storage contract defines layout, not authorization logic.

---

## 1. Two planes: code and state

```
┌───────────────────────────────────┐     ┌──────────────────────────────┐
│   <repo>/  (code — committed)      │     │   var/  (state — per          │
│                                    │     │        : deployment, mounted) │
├───────────────────────────────────┤     ├──────────────────────────────┤
│ core/            (Python app)      │     │ audits/<id>/                 │
│ core/agent/      (opencode template)│    │ databases/<id>/              │
│ server/                            │     │ state.db                     │
│ .venv/           (Python deps)     │     │ runs/<run_id>/ (Tier 3 only) │
│ .env             (deployment env)  │     │                              │
└───────────────────────────────────┘     └──────────────────────────────┘
```

- **The code plane** is the repository: versioned by git, identical for a given
  commit regardless of which hospital it serves. It holds the Python
  application (`core/`, `server/`), the opencode **template** (`core/agent/`),
  and the two artifacts every process shares — the Python virtual environment
  (`.venv/`) and the deployment environment file (`.env`), both at the **repo
  root** so they serve `core/`, `server/`, and the agent alike.
- **`var/`** is the *state plane*: everything that varies per hospital
  deployment — the authored definitions the system reads, the durable run
  state, and the per-run agent worktrees. Gitignored, mountable, treated as a
  volume in deployment.

The defining rule: **a thing lives in the code plane if it is a function of the
code version, and in `var/` if it is a function of the deployment.** The venv is
code (the same commit yields the same deps for every hospital), so it is not in
`var/`; the audits, databases, and run state are deployment-specific, so they
are.

---

## 2. The opencode template — `core/agent/`

The agent is an opencode project. Its **template** lives at `core/agent/` and is
committed code, never written to at run time:

```
core/agent/
├── opencode.json                              # provider, permissions, tool allow-list
└── .opencode/
    ├── tools/                                 # the agent's tools (<name>.ts → <name>.py)
    ├── skills/                                # e.g. cell-fill
    ├── node_modules/                          # @opencode-ai/plugin (gitignored, installed)
    └── package.json
```

No definitions and no run state live here. Each agent run is provisioned its own
project root under `var/runs/<run_id>/` (§4) which **references** this template
by symlink — so the tool and skill code has exactly one source of truth.

### Tool path resolution

A tool's `<name>.ts` wrapper resolves its sibling `<name>.py` and the Python
interpreter **relative to its own real file location** (`import.meta.url`), not
relative to the launch directory:

- The `.py` implementation is the tool file's sibling.
- The interpreter is `<repo>/.venv/bin/python` — reached as a fixed offset from
  the real tools directory.

Because a symlinked `.opencode` resolves to its real path under `core/agent/`,
these offsets land in the code plane regardless of which run dir launched
opencode. The venv is therefore addressed from the code plane and shared by
every run with zero per-run setup. **This is why the venv must stay at the repo
root**: the tools anchor to it by a fixed relationship to their own location.

---

## 3. Canonical layout under `var/`

```
var/
├── state.db                                   # the ONE state store (runs / cells / events / field_codes)
├── auth.sqlite                                # transitional MVP auth store (users / sessions / attribution);
│                                              # folds into the control-plane DB contract post-migration
├── audits/<audit_id>/
│   ├── spec.json                              # audit-spec.schema.json
│   ├── mapping.json                           # mapping.schema.json (match + executable; ONE file)
│   └── workbook.xlsx                          # the source template (present iff uploaded as a workbook)
├── databases/<database_id>/
│   ├── model.json                             # database-model.schema.json
│   └── database.sqlite                        # MVP: the actual file. Post-MVP: replaced by connection.json.
└── runs/<run_id>/                             # provisioned ONLY when Tier 3 runs (see §4)
    ├── opencode.json                          # COPY of core/agent/opencode.json — makes this dir the agent root
    ├── .opencode                              # SYMLINK → core/agent/.opencode (tools + skills + node_modules)
    ├── context.json                           # run metadata + provenance — no filesystem paths
    ├── audit/
    │   ├── spec.json                          # COPY of var/audits/<audit_id>/spec.json
    │   └── cells.sqlite                       # SYMLINK → var/state.db
    └── database/
        ├── <slug>.sqlite                      # SYMLINK → var/databases/<slug>/database.sqlite
        └── <slug>.model.json                  # COPY of var/databases/<slug>/model.json
```

### File-name convention

The directory name carries the id; the file name describes the *kind*:

| What it is | File name |
|---|---|
| audit specification (the `audit-spec` schema) | `spec.json` |
| database model (the `database-model` schema) | `model.json` |
| audit↔database mapping + Tier-1 executable | `mapping.json` |
| source workbook for an uploaded audit | `workbook.xlsx` |
| clinical SQLite for a database | `database.sqlite` |

### Transitional split-store placement (current MVP implementation)

This table is authoritative while physical storage remains split.

| Logical table/domain | Current physical store | Target physical store |
|---|---|---|
| `runs`, `cells`, `events`, `field_codes` | `var/state.db` | unified control-plane DB |
| `users`, `sessions`, run/query attribution rows | `var/auth.sqlite` | unified control-plane DB |
| `roles`, `permissions`, `role_permissions`, `resource_grants`, catalog registry (`audits`, `databases`, `mappings`) | pending implementation (documented contract only) | unified control-plane DB |

### Workbook

`workbook.xlsx` is stored **only when an audit was uploaded as a workbook**
(indexing input). Once `spec.json` exists, the system **never reads the workbook
at run time**. The downloadable spreadsheet a user receives at the end of a run
is generated on demand from `state.db` + `spec.json`.

### Database file

The MVP stores the SQLite file directly at
`var/databases/<id>/database.sqlite`. Post-MVP this is replaced by a
`connection.json` carrying engine + DSN (the actual hospital DB is not copied).
`run_readonly_sql` becomes engine-aware at that point; the directory key
(`var/databases/<id>/`) is stable.

---

## 4. Per-run agent root (`var/runs/<run_id>/`) — Tier 3 only

The orchestrator and Tiers 1 and 2 read definitions **directly** from
`var/audits/` and `var/databases/`. They never materialise a per-run directory.
There is **no copy** of `spec.json` or `model.json` per run while the spine
ladder is running through Tier 1 and Tier 2.

The per-run directory is created by
`core/running/try_agent.py::provision_worktree` **only if**
`run_store.open_cells()` is non-empty after Tier 2 — i.e. only when the opencode
agent will actually run.

Its purpose: be a **self-contained opencode project root** the agent is launched
from directly (`cd var/runs/<run_id> && opencode`). Because it carries its own
`opencode.json`, opencode roots here without walking the tree; because every
artifact the agent touches is resolved from this directory (its working
directory), the agent never sees an absolute filesystem path.

Contents:

- **`opencode.json`** — a **copy** of `core/agent/opencode.json`. Its presence
  makes this directory the opencode project root (no walk-up). It carries no
  filesystem paths — only provider config, permissions, and the tool allow-list
  — so a copy never goes stale in a way that matters.
- **`.opencode`** — a **symlink** to `core/agent/.opencode`. The agent's tools,
  skills, and `node_modules` are thereby referenced from the single committed
  template. Tools loaded through this symlink resolve their `.py` siblings and
  the repo-root venv via their real location (§2).
- **`context.json`** — written via
  `core/agent/.opencode/tools/_run_sql.py::build_context`, the single source of
  truth for the shape. Carries `run_id`, the cohort `anchor` (e.g.
  `patient_code`), the `cohort` identity list, per-database `cohort_tables`, and
  the **provenance** stamp (§6). **No filesystem paths.**
- **`audit/spec.json`** — copy of the canonical spec. The agent's
  `lookup_execute` tool reads it relative to its working directory.
- **`audit/cells.sqlite`** — **symlink** to `var/state.db`. Agent writes hit the
  same state store the orchestrator and Tiers 1–2 see, in real time.
- **`database/<slug>.sqlite`** — **symlink** to
  `var/databases/<slug>/database.sqlite`. The agent opens by name relative to
  its working directory.
- **`database/<slug>.model.json`** — copy of the canonical model. The agent
  consults this — never DB introspection — to construct queries.

The split is deliberate: **symlinks for code and binaries** (the `.opencode`
template, the clinical SQLite, the state DB) so there is one source of truth and
no stale copy; **copies for small JSON** (`opencode.json`, `spec.json`,
`model.json`) so the agent has self-contained text it can read without
traversing out of its root.

---

## 5. Data flow — who reads, who writes

| Phase | Reads | Writes |
|---|---|---|
| **Indexing** | uploaded `workbook.xlsx`; raw `database.sqlite` | `var/audits/<id>/spec.json` · `var/databases/<id>/model.json` |
| **Mapping** | `var/audits/<id>/spec.json` · `var/databases/<id>/model.json` | `var/audits/<id>/mapping.json` (match + executable, one file) |
| **Orchestrator (A0)** | `var/audits/<id>/spec.json` · `var/audits/<id>/mapping.json` · `var/databases/<*>/database.sqlite` (paths only — the SQLite is read by the tiers) | `var/state.db` (runs row, pending cells, field_codes) |
| **Tier 1 — try_direct** | `RunStore.executable` (the compiled SQL from `mapping.json`) · `var/databases/<*>/database.sqlite` via `run_readonly_sql` | `var/state.db` cells (UPDATE in place via `RunStore.update`) |
| **Tier 2 — try_llm** | `var/audits/<id>/spec.json` (code sets) · `var/databases/<*>/model.json` (**schema — the LLM builds queries from THIS, never by introspecting the live DB**) · `var/databases/<*>/database.sqlite` (execution target for the query the LLM proposed) | `var/state.db` cells |
| **Tier 3 — try_agent** | `var/runs/<run_id>/audit/spec.json` · `var/runs/<run_id>/database/<slug>.model.json` (schema for query construction) · `var/runs/<run_id>/database/<slug>.sqlite` (execution target) · `var/runs/<run_id>/context.json` | `var/state.db` (through symlinked `cells.sqlite`) |
| **Workbook download** | `var/state.db` · `var/audits/<id>/spec.json` | (response stream — no on-disk artifact) |

---

## 6. Runtime state store and provenance

The cell shape, the trigger semantics, and the `derive_status` rule are all
pinned by [`state-schema.md`](./state-schema.md) and implemented in
`core/store/`. This contract adds:

1. **The path.** Runtime state store lives at `var/state.db`.
2. **The invariant.** It is the single runtime DB for the deployment — never
   per-run, never copied. Tier 3 reaches it via the symlink at
   `var/runs/<run_id>/audit/cells.sqlite`; everyone else uses the `Store` class
   directly.
3. **Run provenance.** Because the per-run `.opencode` is a *symlink* to live
   template code, the bytes of the tools and skills a run used are not captured
   by any copy. Provenance is instead a **git commit SHA stamped into
   `context.json`** at provision time — it pins `opencode.json`, every tool, and
   every skill exactly, with zero duplication. `var/` being ephemeral and
   gitignored, the SHA is the authoritative record of "which code ran this run."

---

## 7. Invariants

These are enforced by code (the files below show *where*); this contract pins
*that* they hold.

| Invariant | Enforced by |
|---|---|
| **One runtime state DB.** `var/state.db` is the only writable store of cells/runs/events for a deployment. | `core/config.py::STATE_DB_PATH`, `core/store/store.py::Store.__init__` |
| **No per-run copies of definitions for Tier 1 / Tier 2.** Tiers 1 and 2 read straight from `var/audits/` and `var/databases/`. Copies into `var/runs/<run_id>/` happen exclusively in `provision_worktree`. | `core/running/try_direct.py`, `core/running/try_llm.py` (no per-run dir access); `core/running/try_agent.py::provision_worktree` (only writer) |
| **The per-run dir is a self-contained opencode root.** It carries its own `opencode.json` (copy) and a `.opencode` symlink, so `opencode` launched from it roots there without walking the tree. | `core/running/try_agent.py::provision_worktree` |
| **Symlinks for code/binaries, copies for small JSON.** `.opencode`, clinical SQLite, and the state DB are symlinked (one source of truth); `opencode.json`, `spec.json`, `model.json` are copied (self-contained text). | `core/running/try_agent.py::provision_worktree` |
| **The venv lives at the repo root.** Tools resolve `<repo>/.venv/bin/python` by a fixed offset from their own real location; the venv is code, shared by every run and by `server/`. | `core/agent/.opencode/tools/*.ts` |
| **No paths in `context.json`.** Anything the agent needs about file location is encoded in the run dir's shape; `context.json` carries only run metadata + the provenance SHA. | `core/agent/.opencode/tools/_run_sql.py::build_context` |
| **No definitions under `core/agent/`.** Definitions live only under `var/`. `core/agent/` is the opencode template, period. | `core/config.py` (`AUDITS_DIR`, `DATABASES_DIR` resolve under `VAR_DIR`) |
| **Schema reads come from `model.json`, never from live DB introspection.** Tiers 2 and 3 build their queries from the canonical `model.json` and execute them against `database.sqlite`. The model is the single source of truth for table/column shape, types, and clinical descriptions; the live DB is execution target only. | `core/running/try_llm.py`; `core/agent/.opencode/tools/sql_execute.py` + `lookup_execute` (consult `database/<slug>.model.json`) |

---

## 8. Why this shape

- **One canonical store (`var/`) for all deployment state.** Every definition is
  written once and read from one place; there is no duplicate copy of a spec or
  model that can silently drift from the canonical one.
- **The per-run dir is the agent's project root, not a satellite of a shared
  root.** Launching opencode from `var/runs/<id>/` with its own `opencode.json`
  means no walk-up and no indirection layer: the directory the agent runs in is
  the directory that holds its data. The `.opencode` symlink keeps the tool and
  skill code single-sourced from the template.
- **Per-run dir only when needed.** Tiers 1 and 2 handle the bulk of cells;
  Tier 3 only fires for the residual open set. Provisioning eagerly would pay a
  copy cost for every run, including those that never hit the agent.
- **Code vs deployment, cleanly separated.** The venv and `.env` are functions
  of the code/commit and the deployment environment, not of any single run, so
  they live at the repo root and are shared. `var/` holds only what differs by
  deployment. This is what lets `var/` be mounted as a volume and the code plane
  be a clean, rebuildable checkout.
- **`model.json` as the single schema view.** Live DB introspection at run time
  would make the LLM's view drift as the schema evolves and would deny the
  system the curated clinical descriptions `model.json` carries. Indexing is the
  one place schemas are described; everyone downstream reads that description.
- **Provenance by SHA, not by copy.** Since tool/skill code is symlinked (one
  source of truth), the honest record of what ran is the commit SHA, stamped
  into `context.json` — pinning everything at once without duplicating bytes
  into an ephemeral, gitignored tree.

---

## 9. Scalability stance (MVP vs scale)

Storing `spec.json` / `model.json` / `mapping.json` as files under `var/` is
**intentional for MVP** and early hospital pilots:

- it is simple to reason about and debug;
- it keeps deployment local (no extra metadata service to operate);
- it is easy to snapshot/restore as one mounted volume.

It is **not** the final horizontal-scale substrate. File-only definitions stop
scaling well once definition count, writer concurrency, and cross-definition
query requirements rise.

### Triggers to graduate from file-only definitions

| Trigger | Why file-only starts to hurt |
|---|---|
| Definition cardinality reaches "many" (order: thousands+) and list/filter views are frequent | Directory scans + repeated full-file reads become a latency and ops bottleneck. |
| Multiple concurrent writers must update shared definition metadata | File locking/rename discipline gets brittle compared with transactional DB updates. |
| Multi-node API workers serve one deployment | A single transactional registry is safer than distributed filesystem coordination. |
| Product needs indexed queries across definitions (owner/tag/status/version/search facets) | Files are documents, not an indexed metadata/query surface. |

### Post-MVP migration path (keep contracts stable)

1. Keep logical ids and document contracts unchanged (`spec.json`,
   `model.json`, `mapping.json`).
2. Add a definitions registry (DB table) keyed by id + kind, with metadata
   fields (hash, updated_at, schema_version, location).
3. Optionally move JSON blobs to object storage; registry stores the object URI.
4. Keep `var/` as a local cache/mirror, not the canonical metadata/query plane.
5. Move `state.db` to a hospital-hosted transactional DB for multi-writer /
   multi-node deployments while preserving `state-schema.md` semantics.
