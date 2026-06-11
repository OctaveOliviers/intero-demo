# Contract — REST API

> **Frozen contract (Wave 0 · W0.1).** Read [3-architecture.md](../3-architecture.md)
> §"Where the front end meets the backend" first. This document enumerates every
> endpoint the front end calls, with the **request + response shapes** both the
> backend (Lane B/C, *serve*) and the front end (Lane D, *consume*) build against.
>
> **Source of truth.** This contract is authoritative until re-frozen by an
> explicit spec change. The mock layer
> ([`app/src/lib/api.js`](../../../app/src/lib/api.js) and
> [`app/src/lib/mockData.js`](../../../app/src/lib/mockData.js)) is now legacy
> and must be updated to match this frozen contract.
>
> **Scope boundary.** This contract covers the **REST request/response shapes**.
> The detailed **SSE event payloads** (`activity` / `workbook_created` /
> `cell_update` / `done` / `error`), the **per-cell metadata** object, and the
> `executable`-block schema are frozen separately in
> [runtime-shapes.md](./runtime-shapes.md) (W0.3). This doc documents the two
> stream *endpoints* and their envelopes and cross-references W0.3 for payloads.

All endpoints are served under the same origin (`API_BASE = ""`); requests are
relative (`/api/...`). Request bodies are JSON (`Content-Type: application/json`)
unless noted as `multipart/form-data` (file uploads). On error, endpoints return
a non-2xx status with a JSON body `{ "detail": "<message>" }`; the front end
surfaces `detail` as the error message.

Authorization semantics are governed by
[control-plane-schema-and-permissions.md](./control-plane-schema-and-permissions.md).

## Authn/Authz response contract

- `401 Unauthorized`: missing/invalid/expired session.
- `403 Forbidden`: authenticated but lacks permission and/or resource grant.
- `404 Not Found`: resource does not exist (or is intentionally hidden by policy).

Protected endpoints MUST evaluate checks in order: session -> role permission ->
resource grant -> run-scope ownership.
Protected endpoints MUST ignore any client-provided `user_id` for authorization;
request identity is always resolved server-side from the authenticated session.

---

## Coverage map — every `api.js` function → one endpoint

Verifies W0.1: **every** function exported from `app/src/lib/api.js` maps to one
documented endpoint. "Mock" = guarded by `isMockMode()` (has a `mockData.js`
shape); "real-only" = always hits the network even in the demo.

| `api.js` function | Method + path | Mock? |
| --- | --- | --- |
| `authMe()` | `GET /api/auth/me` | real-only |
| `authLogin(username, password)` | `POST /api/auth/login` | real-only |
| `authLogout()` | `POST /api/auth/logout` | real-only |
| `listMyRuns()` | `GET /api/auth/runs` | real-only |
| `listMyQueries()` | `GET /api/auth/queries` | real-only |
| `listAudits()` | `GET /api/audits` | mock |
| `getAuditDetail(auditId)` | `GET /api/audits/{auditId}` | mock |
| `uploadAudit(file)` | `POST /api/audits/upload` | mock |
| `renameAudit(auditId, name)` | `PATCH /api/audits/{auditId}` | mock |
| `deleteAudit(auditId)` | `DELETE /api/audits/{auditId}` | mock |
| `reindexAudit(auditId)` | `POST /api/audits/{auditId}/reindex` | mock |
| `listDatabases()` | `GET /api/databases` | mock |
| `getDatabaseDetail(dbId)` | `GET /api/databases/{dbId}` | mock |
| `uploadDatabase(file)` | `POST /api/databases/upload` | mock |
| `renameDatabase(dbId, name)` | `PATCH /api/databases/{dbId}` | mock |
| `deleteDatabase(dbId)` | `DELETE /api/databases/{dbId}` | mock |
| `reindexDatabase(dbId)` | `POST /api/databases/{dbId}/reindex` | mock |
| `createRunFromAudit(auditId, filters, database)` | `POST /api/runs` (JSON, `auditId`) | mock |
| `createRunFromDescription(prompt)` | `POST /api/runs` (JSON, `prompt`) | mock |
| `createRun(templateFile, prompt)` | `POST /api/runs` (multipart) | real-only |
| `getWorkbook(runId)` | `GET /api/runs/{runId}/workbook` | mock |
| `getRunStatus(runId)` | `GET /api/runs/{runId}` | real-only |
| `stopRun(runId)` | `POST /api/runs/{runId}/stop` | real-only |
| `refreshRun(runId)` | `POST /api/runs/{runId}/refresh` | real-only |
| `executeSql(query, database)` | `POST /api/sql` | mock |
| `parseFilters({text, templateId, databaseIds, availableCriteria, existing})` | `POST /api/parseFilters` | deferred (next phase) |
| `generateData(query, onChunk, {signal})` | `POST /api/generate` (stream) | real-only |
| `submitFeedback({title, body})` | `POST /api/feedback` | real-only |

Two **stream endpoints** are consumed outside `api.js` (via `EventSource`) and
belong to the same contract — see [§Streaming endpoints](#streaming-endpoints):

| Consumer | Method + path |
| --- | --- |
| `app/src/stores/indexing.js` | `GET /api/indexing/stream` (SSE) |
| `app/src/stores/chat.js` | `GET /api/runs/{runId}/stream` (SSE) |

`GET /api/health` is registered by `server/main.py` but is **not** called from
`api.js`; it is out of this contract's scope.

## Authorization matrix (minimum)

| Endpoint group | Required permission(s) | Required resource grant |
| --- | --- | --- |
| `/api/audits*` read | `audit.read` | `audit:read` |
| `/api/audits/upload` | `audit.manage` | none (create is permission-only) |
| `/api/audits*` write (non-create) | `audit.manage` | `audit:manage` (or admin) |
| `/api/databases*` read | `database.read` | `database:read` |
| `/api/databases/upload` | `database.manage` | none (create is permission-only) |
| `/api/databases*` write (non-create) | `database.manage` | `database:manage` (or admin) |
| `POST /api/sql` | `database.query` | `database:read` on target database |
| `POST /api/runs` | `run.create` | `audit:run` + `database:read` for each selected database |
| `GET /api/runs/{id}` | `run.read` | run owner or admin |
| `GET /api/runs/{id}/stream` | `run.read` | run owner or admin |
| `GET /api/runs/{id}/workbook` | `run.read` | run owner or admin, plus underlying resource grants |
| `POST /api/runs/{id}/stop` | `run.stop` | run owner or admin |

---

## Auth gate and 401 semantics

Authentication is session-cookie based (`credentials: "include"` in the SPA).
`POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me` are the
handshake endpoints. All other protected `/api/*` routes return `401` with
`{ "detail": "Authentication required" }` when no valid session is present.

Front-end behavior for protected route `401` is centralized in
`app/src/lib/api.js` (`throwIfUnauthorized`): a 401 triggers a single deduped
local reset path (`resetChatRuntime` + `resetAuditHistory` + `goHome` +
`clearAuth`) and throws `AuthError`, so the app deterministically returns to the
login gate without per-caller ad-hoc logic.

---

## Auth

### `POST /api/auth/login` — login
- **Request (JSON):** `{ "username": "<string>", "password": "<string>" }`.
- **Response 200:** `{ "id": "<user-id>", "username": "<username>" }`.
- **Error 401:** `{ "detail": "Invalid username or password" }`.
- **Side effect:** sets HttpOnly session cookie (`intero_session`).

### `POST /api/auth/logout` — logout
- **Request:** none.
- **Response 200:** `{ "ok": true }`.
- **Side effect:** clears session cookie server-side/client-side where present.

### `GET /api/auth/me` — current session user
- **Request:** none.
- **Response 200:** `{ "id": "<user-id>", "username": "<username>" }`.
- **Error 401:** `{ "detail": "Authentication required" }`.

### `GET /api/auth/runs` — per-user run history
- **Request:** none.
- **Response 200:** array of this user's run-attribution entries.
  ```jsonc
  [{ "run_id": "run-abc123", "audit_id": "cord-ph-audit", "request": "…",
     "filters": { "dateFrom": "", "dateTo": "", "hospitals": "", "cohort": "" },
     "started_at": "2026-06-08T08:00:00+00:00" }]
  ```
- **Error 401:** `{ "detail": "Authentication required" }`.

### `GET /api/auth/queries` — per-user query log
- **Request:** none.
- **Response 200:** array of this user's query-log entries.
  ```jsonc
  [{ "user_id": "<user-id>", "run_id": "run-abc123", "database": "ehr-db",
     "query": "SELECT …", "ts": "2026-06-08T08:01:02+00:00" }]
  ```
- **Error 401:** `{ "detail": "Authentication required" }`.

---

## Shared shapes

Two response shapes recur and are defined once here.

### `StructuredResult` (a SQL/lookup result)

Returned by `executeSql` and embedded as each populated cell's `result` (see
`structuredResult()` / `noteResult()` in `mockData.js`):

```jsonc
{
  "columns": ["PATIENT_CODE", "Cord_arterial_pH"], // column headers
  "rows":    [["CPH001", 7.28]],                   // array of rows; [] is valid ("ran, no match")
  "rowCount": 1,                                    // == rows.length
  "durationMs": 6                                   // wall-clock of the lookup
}
```

A **note** lookup is the same shape with the fixed columns
`["AUTHOR_ROLE", "DATE", "NOTE_TYPE", "TEXT"]`, one row per source note.

### `IndexingEntry` (indexing state of one audit/database)

The unit pushed over the indexing SSE stream and reflected by upload/reindex:

```jsonc
{
  "kind": "audit" | "database",
  "id":   "audit-1a2b3c4d",
  "name": "Cord pH at Birth Audit",
  "status": "indexing" | "ready" | "error",
  "error": "..."   // present only when status === "error"
}
```

---

## Audits

### `GET /api/audits` — list audits
- **Request:** none.
- **Response 200:** array of audit summaries for library cards.
  ```jsonc
  [{
    "id": "cord-ph-audit",
    "name": "Cord pH at Birth Audit",
    "description": "Cord blood gas, resuscitation and documentation quality at birth.",
    "excelPath": "workbook.xlsx",
    "status": "ready",
    "level": "Local",
    "readOnly": false,
    "stale": false,
    "version": null,
    "scheme": null,
    "lastPulled": null,
    "provenanceRef": null,
    "provenanceUrl": null
  }]
  ```
  Stage-1 source of truth is `var/audits/<id>/spec.json` metadata plus the catalog row.
  *(Phase-4 addition: the summary gains an optional `deadline` (ISO date, from `spec.json`
  `deadline`) so library cards can render the submission deadline — doc 9 card face.)*

### `GET /api/audits/{auditId}` — audit detail
- **Request:** none.
- **Response 200:** one audit detail payload for the library detail view.
  ```jsonc
  {
    "id": "cord-ph-audit",
    "name": "Cord pH at Birth Audit",
    "description": "...",
    "excelPath": "workbook.xlsx",
    "status": "ready",
    "level": "Local",
    "readOnly": false,
    "stale": false,
    "version": null,
    "scheme": null,
    "lastPulled": null,
    "provenanceRef": null,
    "provenanceUrl": null,
    "spec": {},
    "mapping": {}
  }
  ```
- **Response 404:** `{ "detail": "Audit not found." }` or artifact-missing detail (for example `"Audit spec not found."`).
- **Response 422:** malformed artifact JSON (for example `"Audit spec is invalid JSON."`).
- **What the detail view reads from this payload** (doc 9 three-section page): `spec` is the
  full `spec.json` (incl. the optional `deadline` and per-field `notes`); `mapping` is the
  full `mapping.json` **or `null` when no database is bound yet** (the no-mapping fallback
  state) — it carries `fixed_criteria` (the editable criteria chips), `database_summaries`
  (the template-specific database-chip sentences), `fields[]` `kind` + `code` (the
  template-chip descriptions), and the `executable` block (not rendered).

### `POST /api/audits/upload` — upload an audit template
- **Request:** `multipart/form-data` with a single field `file` (the `.xlsx`).
- **Response 200:** `{ "id": "audit-1a2b3c4d", "name": "<derived from filename>" }`.
- **Side effect:** the new audit begins **indexing** — it appears as an
  `IndexingEntry` with `status: "indexing"` on the indexing stream and flips to
  `"ready"` when done.

### `PATCH /api/audits/{auditId}` — rename
- **Request:** `{ "name": "New name" }`.
- **Response 200:** `{ "id": "<auditId>", "name": "New name" }`.

### `DELETE /api/audits/{auditId}` — delete
- **Request:** none.
- **Response:** `204 No Content` (or `200 {}`). The front end treats `204` as success.

### `POST /api/audits/{auditId}/reindex` — re-index
- **Request:** none.
- **Response 200:** `{ "id": "<auditId>" }`.
- **Side effect:** re-runs **indexing** for the audit (same stream transitions as upload).

---

## Databases

### `GET /api/databases` — list databases
- **Request:** none.
- **Response 200:** array of database summaries for library cards.
  ```jsonc
  [{
    "id": "patient-notes-db",
    "name": "Patient notes",
    "description": "Free-text notes and structured EHR fields.",
    "type": "sqlite",
    "path": "var/databases/patient-notes-db/database.sqlite",
    "status": "ready",
    "level": "Local",
    "readOnly": false,
    "stale": false,
    "version": null,
    "scheme": null,
    "lastPulled": null,
    "provenanceRef": null,
    "provenanceUrl": null
  }]
  ```
  Stage-1 source of truth is `var/databases/<id>/model.json` metadata plus the catalog row.

### `GET /api/databases/{dbId}` — database detail
- **Request:** none.
- **Response 200:** one database detail payload for the library detail view.
  ```jsonc
  {
    "id": "patient-notes-db",
    "name": "Patient notes",
    "description": "...",
    "type": "sqlite",
    "path": "var/databases/patient-notes-db/database.sqlite",
    "status": "ready",
    "level": "Local",
    "readOnly": false,
    "stale": false,
    "version": null,
    "scheme": null,
    "lastPulled": null,
    "provenanceRef": null,
    "provenanceUrl": null,
    "model": {}
  }
  ```
- **Response 404:** `{ "detail": "Database not found." }` or artifact-missing detail (for example `"Database model not found."`).
- **Response 422:** malformed artifact JSON (for example `"Database model is invalid JSON."`).

### `POST /api/databases/upload` — upload a database
- **Request:** `multipart/form-data` with a single field `file`.
- **Response 200:** `{ "id": "db-1a2b3c4d", "name": "<derived from filename>" }`.
- **Side effect:** the database begins **indexing** (`status: "indexing"` → `"ready"`).

### `PATCH /api/databases/{dbId}` — rename
- **Request:** `{ "name": "New name" }`.
- **Response 200:** `{ "id": "<dbId>", "name": "New name" }`.

### `DELETE /api/databases/{dbId}` — delete
- **Request:** none.
- **Response:** `204 No Content` (or `200 {}`).

### `POST /api/databases/{dbId}/reindex` — re-index
- **Request:** none.
- **Response 200:** `{ "id": "<dbId>" }`.
- **Side effect:** re-runs **indexing** for the database.

---

## Runs

`POST /api/runs` is **overloaded** by request shape — the three entry flows
(README §8) all start a run and all return the same `{ runId }`:

Refresh is in-place under one stable `runId`; each execution attempt carries an
`executionId`. Execution role is derived by order: first execution = initial,
later executions = refresh.

### `POST /api/runs` — start a run from an existing audit (Flow A / C)
- **Request (JSON):**
  ```jsonc
  { "auditId": "cord-ph-audit",
    "filters": { "dateFrom": "", "dateTo": "", "hospitals": "", "cohort": "" },
    "database": "ehr-db"  // optional; omitted when not chosen
  }
  ```
- **Response 200:** `{ "runId": "mock-1a2b3c4d" }`.

### `POST /api/runs` — start a run from a free-text description (Flow B)
- **Request (JSON):** `{ "prompt": "audit the adult chest-pain attendances…" }`.
- **Response 200:** `{ "runId": "mock-1a2b3c4d" }`.

### `POST /api/runs` — start a run from an uploaded template + prompt (real-only)
- **Request:** `multipart/form-data` with fields `template` (the `.xlsx`) and `prompt`.
- **Response 200:** `{ "runId": "<id>" }`.

### `GET /api/runs/{runId}` — run status (real-only)
- **Request:** none.
- **Response 200:** the run status object. (Status fields are frozen by
  [state-schema.md](./state-schema.md) (W0.2); this endpoint serves that shape.)
- **Response 404:** run not found.

### `POST /api/runs/{runId}/stop` — stop a run (real-only)
- **Request:** none.
- **Response 200:** stop acknowledgement object. Stop is idempotent; re-run skips
  completed regions (see [5-run-engine.md](../5-run-engine.md)).

### `POST /api/runs/{runId}/refresh` — start an in-place refresh execution (real-only)
- **Request:** none.
- **Response 200:** `{ "runId": "<same-run-id>", "executionId": "<id>", "status": "started" }`.
- **Behavior:** starts a new execution under the same run identity; does not create a new run.
- **Conflict and validation behavior (deterministic):**
  - **404 Not Found** (unknown run id):
    `{ "detail": "Run not found", "code": "RUN_NOT_FOUND", "runId": "<runId>" }`
  - **409 Conflict** (run already executing; includes duplicate rapid clicks while active):
    `{ "detail": "Run already has an active execution", "code": "RUN_EXECUTION_ACTIVE", "runId": "<runId>", "activeExecutionId": "<id>" }`
  - **409 Conflict** (run not refreshable because terminal/stopped/error and refresh disallowed):
    `{ "detail": "Run is not refreshable in its current status", "code": "RUN_NOT_REFRESHABLE", "runId": "<runId>", "runStatus": "<status>" }`
- **Idempotency note:** no second refresh execution is created while one is active; rapid repeat
  requests return the same 409 `RUN_EXECUTION_ACTIVE` envelope above.

### `GET /api/runs/{runId}/workbook` — fetch the populated workbook
- **Request:** none.
- **Response 200:** a workbook snapshot (the `mockGetWorkbook` reload fallback;
  the live fill arrives over the run stream instead):
  ```jsonc
  {
    "sheets": [
      { "name": "ALL",
        "data": [ ["Patient code", "Gestation (weeks)", …],   // row 0 = headers
                  ["CPH001", 39, …] ],                          // body rows
        "meta": { "columns": [ { "width": 12 }, … ] } }
    ],
    "cellMetadata": {
      "ALL!A2": { "kind": "direct", "database": "ehr-db",
                  "sql": "SELECT …", "explanation": "…" }
      // interpretive citations are carried in sources[].citations
    }
  }
  ```
  `cellMetadata` is keyed `"<Sheet>!<A1ref>"`. The per-cell metadata object shape
  is frozen in [runtime-shapes.md](./runtime-shapes.md) (W0.3).

---

## SQL

### `POST /api/sql` — execute a read-only query
- **Request (JSON):** `{ "query": "SELECT …", "database": "ehr-db" }` (`database` optional).
- **Response 200:** a [`StructuredResult`](#structuredresult-a-sqllookup-result).
  A note query returns the note-shaped `StructuredResult`
  (columns `["AUTHOR_ROLE", "DATE", "NOTE_TYPE", "TEXT"]`).

---

## Filter extraction

> **Deferred — next phase (2026-06-10).** This endpoint is specified but **not built and not
> in the current phase's scope** (see the scope note in
> [doc 2 §Filter interaction](../2-product-flows.md#filter-interaction)). The contract below
> is the target for when it lands.

### `POST /api/parseFilters` — resolve free text into structured filter chips
The **single** extractor behind both the live-prompt extraction and the manual *add-filter*
control (see [doc 2 §Filter interaction](../2-product-flows.md#filter-interaction)). The model
may **only** choose dimensions from `availableCriteria` — the audit's prelinked criteria menu
intersected with the selected databases' filterable columns. It maps fuzzy/implicit intent onto
an allowed dimension and fills its value(s); values may be **ranges**.
- **Request (JSON):**
  ```jsonc
  { "text": "born in Q1 2026",
    "templateId": "cord-ph",
    "databaseIds": ["patient-notes-db"],
    "availableCriteria": [ { "id": "dob", "label": "Date of birth", "kind": "date",
                             "valueShape": "range" }, … ],
    "existing": [ /* current chips, so re-extraction is diff-only */ ] }
  ```
- **Response 200:**
  ```jsonc
  { "filters": [
      { "criterionId": "dob", "kind": "date",
        "value": "1 Jan 2026 – 31 Mar 2026",
        "raw": { "from": "2026-01-01", "to": "2026-03-31" },
        "confidence": 0.95 } ] }
  ```
  An empty `filters` array means **nothing in the menu matched** — the caller shows an inline
  "couldn't match" and creates **no** chip. There is no literal/`custom` fallback.
- **Backend:** reuses `core.clients.llm.respond_typed` with a closed-set Pydantic schema
  (`criterionId` constrained to the supplied `availableCriteria`). **(B6 deliverable.)**
- **Mock:** `app/src/lib/extractFilters.js` reproduces the behaviour deterministically.

---

## Generate (streaming text)

### `POST /api/generate` — stream a free-text data description to the model (real-only)
- **Request (JSON):** `{ "query": "<free text>" }`. Supports `AbortSignal` cancellation.
- **Response 200:** a **streamed `text/plain` body** read chunk-by-chunk
  (`res.body.getReader()` + `TextDecoder`). This is a **raw text stream, not SSE** —
  each decoded chunk is passed verbatim to the caller's `onChunk(text)`. The
  stream ends when the reader reports `done`.
- **Error:** non-2xx (or empty body) → JSON `{ "detail": "…" }`.

---

## Feedback

### `POST /api/feedback` — submit co-founder feedback (real-only)
- **Always hits the network**, even in the mock demo, because the point is to
  collect real feedback from the deployed build (served by a Vercel serverless
  function, not `server/main.py`).
- **Request (JSON):** `{ "title": "…", "body": "…", "url": "<window.location.href>" }`.
- **Response 200:** acknowledgement object (e.g. the created GitHub issue ref).

---

## Streaming endpoints

Two Server-Sent Events streams are opened with `EventSource` (consumed in the
stores, not `api.js`). The **endpoints and envelopes** are frozen here; the
**event payloads** are frozen in [runtime-shapes.md](./runtime-shapes.md) (W0.3).

### `GET /api/indexing/stream` — indexing state (SSE)
- Consumed by `app/src/stores/indexing.js`.
- Each `message` event's `data` is a JSON-encoded
  [`IndexingEntry`](#indexingentry-indexing-state-of-one-auditdatabase). The front
  end keys entries by `"<kind>:<id>"`, toasts on `indexing → ready`/`error`, and
  flashes a transient "ready" chip. (In mock mode there is no backend; entries are
  pushed into the store directly, so the stream is not opened.)

### `GET /api/runs/{runId}/stream` — live run events (SSE)
- Consumed by `app/src/stores/chat.js`.
- Each `message` event's `data` is a JSON-encoded run event discriminated by
  `type`: `workbook_created`, `cell_update`, `done`, `error`, plus reasoning
  events (`activity` / `delta` / part snapshots). **The full event payloads are
  frozen in [runtime-shapes.md](./runtime-shapes.md) (W0.3)** — this contract only
  fixes the endpoint and that events arrive as JSON over SSE.
- Events emitted during a refresh execution carry `executionId` so activity and
  cell updates can be grouped per execution under the same `runId`.
