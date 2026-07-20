# Contract — REST API

> **Frozen contract.** Read [architecture.md](../architecture.md)
> §"Where the front end meets the backend" first. This document enumerates every
> endpoint the front end calls, with the **request + response shapes** both the
> backend (*serve*) and the front end (*consume*) build against.
>
> **Source of truth.** This contract is authoritative until re-frozen by an
> explicit spec change. The mock layer
> ([`app/src/lib/api.js`](../../../app/src/lib/api.js),
> [`app/src/lib/mock.js`](../../../app/src/lib/mock.js), and
> [`app/src/lib/mockData.js`](../../../app/src/lib/mockData.js)) mirrors this
> frozen contract.
>
> **Scope boundary.** This contract covers the **REST request/response shapes**.
> The detailed **SSE event payloads** (`activity` / `workbook_created` /
> `cell_update` / `done` / `error`), the **per-cell metadata** object, and the
> `executable`-block schema are frozen separately in
> [runtime-shapes.md](runtime-shapes.md). This doc documents the two
> stream *endpoints* and their envelopes and cross-references runtime-shapes.md for payloads.

All endpoints are served under the same origin (`API_BASE = ""`); requests are
relative (`/api/...`). Request bodies are JSON (`Content-Type: application/json`)
unless noted as `multipart/form-data` (file uploads). On error, endpoints return
a non-2xx status with a JSON body `{ "detail": "<message>" }`; the front end
surfaces `detail` as the error message.

Authorization semantics are governed by
[control-plane-schema-and-permissions.md](control-plane-schema-and-permissions.md).

## Authn/Authz response contract

- `401 Unauthorized`: missing/invalid/expired session.
- `403 Forbidden`: authenticated but lacks permission and/or resource grant.
- `404 Not Found`: resource does not exist (or is intentionally hidden by policy).

Protected endpoints MUST evaluate checks in order: session -> role permission ->
resource grant and/or table-population ownership as defined by the route.
Protected endpoints MUST ignore any client-provided `user_id` for authorization;
request identity is always resolved server-side from the authenticated session.

---

## Coverage map — every `api.js` function → one endpoint or explicit deferred seam

**Every** function exported from `app/src/lib/api.js` maps to one documented
endpoint unless this table explicitly marks it as a mock-only/deferred seam.
"Mock" = guarded by `isMockMode()` (has a `mockData.js` shape); "real-only" =
always hits the network even in the demo.

The populate surface is `table-population` (server routes live in
`server/routes/table_populations.py`). `api.js` exports only the canonical
table-population functions below; new code does not carry `run`-named aliases.

| `api.js` function | Method + path | Mock? |
| --- | --- | --- |
| `authMe()` | `GET /api/auth/me` | real-only |
| `authLogin(username, password)` | `POST /api/auth/login` | real-only |
| `authLogout()` | `POST /api/auth/logout` | real-only |
| `listMyTablePopulations()` | `GET /api/auth/table-populations` | real-only |
| `listMyQueries()` | `GET /api/auth/queries` | real-only |
| `listTemplates()` | `GET /api/templates` | mock |
| `getTemplateDetail(templateId)` | `GET /api/templates/{templateId}` | mock |
| `uploadTemplate(file)` | `POST /api/templates/upload` | mock |
| `renameTemplate(templateId, name)` | `PATCH /api/templates/{templateId}` | mock |
| `deleteTemplate(templateId)` | `DELETE /api/templates/{templateId}` | mock |
| `reindexTemplate(templateId)` | `POST /api/templates/{templateId}/reindex` | mock |
| `listDatabases()` | `GET /api/databases` | mock |
| `getDatabaseDetail(dbId)` | `GET /api/databases/{dbId}` | mock |
| `uploadDatabase(file)` | `POST /api/databases/upload` | mock |
| `renameDatabase(dbId, name)` | `PATCH /api/databases/{dbId}` | mock |
| `deleteDatabase(dbId)` | `DELETE /api/databases/{dbId}` | mock |
| `reindexDatabase(dbId)` | `POST /api/databases/{dbId}/reindex` | mock |
| `createTablePopulationFromAudit(auditId, filters, database)` | `POST /api/table-populations` (JSON, `auditId`) | mock |
| `createTablePopulationFromDescription(prompt)` | mock-only demo helper; real prompt-only table population is deferred | mock |
| `getTablePopulationWorkbook(tablePopulationId)` | `GET /api/table-populations/{tablePopulationId}/workbook` | mock |
| `getTablePopulationStatus(tablePopulationId)` | `GET /api/table-populations/{tablePopulationId}` | real-only |
| `stopTablePopulation(tablePopulationId)` | `POST /api/table-populations/{tablePopulationId}/stop` | real-only |
| `deleteTablePopulation(tablePopulationId)` | `DELETE /api/table-populations/{tablePopulationId}` | mock |
| `refreshTablePopulation(tablePopulationId)` | `POST /api/table-populations/{tablePopulationId}/refresh` | real-only |
| `downloadTablePopulationWorkbook(tablePopulationId)` | `GET /api/table-populations/{tablePopulationId}/download` | real-only |
| `executeSql(query, database)` | `POST /api/sql` | mock |
| `executeChatCitationEvidence(citation)` | `POST /api/chat/evidence` | mock |
| `listDatasets()` | `GET /api/datasets` | real-only |
| `getDataset(datasetId)` | `GET /api/datasets/{datasetId}` | real-only |
| `createDataset({name, description, databases, anchor, text})` | `POST /api/datasets` | real-only |
| `editDatasetCriterion(datasetId, criterionId, value)` | `PATCH /api/datasets/{datasetId}` | real-only |
| `deleteDataset(datasetId)` | `DELETE /api/datasets/{datasetId}` | real-only |
| `addDatasetFilter(datasetId, text)` | `POST /api/datasets/{datasetId}/filters` | real-only |
| `listThreads()` | `GET /api/threads` | mock |
| `getThread(threadId)` | `GET /api/threads/{threadId}` | mock |
| `createThread(message)` | `POST /api/threads` | mock |
| `postThreadMessage(threadId, content)` | `POST /api/threads/{threadId}/messages` | mock |
| `postThreadMessageStream(threadId, content, onEvent)` | `POST /api/threads/{threadId}/messages/stream` | mock |
| `renameThread(threadId, title)` | `PATCH /api/threads/{threadId}` | mock |
| `deleteThread(threadId)` | `DELETE /api/threads/{threadId}` | mock |
| `listTables()` | `GET /api/tables` | mock |
| `getTable(tableId)` | `GET /api/tables/{tableId}` | mock |
| `markTableOpened(tableId)` | `POST /api/tables/{tableId}/open` | mock |
| `createTable({title, description, source_template, dataset_id, spec, thread_id})` | `POST /api/tables` | mock |
| `renameTable(tableId, title)` | `PATCH /api/tables/{tableId}` | mock |
| `deleteTable(tableId)` | `DELETE /api/tables/{tableId}` | mock |
| `listClinicians()` | `GET /api/clinicians` | mock |
| `createGrant({resourceType, resourceId, subjectId})` | `POST /api/grants` | mock |
| `deleteGrant(grantId)` | `DELETE /api/grants/{grantId}` | mock |
| `listSharedWithMe()` | `GET /api/grants/shared-with-me` | mock |
| `listSharedByMe()` | `GET /api/grants/shared-by-me` | mock |
| `parseFilters({text, templateId, databaseIds, availableCriteria, existing})` | `POST /api/parseFilters` | deferred (next phase) |
| `generateData(query, onChunk, {signal})` | `POST /api/generate` (stream) | real-only |
| `submitFeedback({title, body})` | `POST /api/feedback` | real-only |

Two **stream endpoints** are consumed outside `api.js` (via `EventSource`) and
belong to the same contract — see [§Streaming endpoints](#streaming-endpoints):

| Consumer | Method + path |
| --- | --- |
| `app/src/stores/indexing.js` | `GET /api/indexing/stream` (SSE) |
| `app/src/stores/chat.js` | `GET /api/table-populations/{tablePopulationId}/stream` (SSE) |

`GET /api/health` is registered by `server/main.py` but is **not** called from
`api.js`; it is out of this contract's scope.

## Authorization rules

Authorization is normative in
[control-plane §9](control-plane-schema-and-permissions.md#9-endpoint-authorization) and expressed
against the object model (`dataset`/`template`/`table` plus `thread`, with `project` deferred),
not a fixed endpoint list. The rules every route MUST satisfy:

| Action | Required permission | Required grant / scope |
| --- | --- | --- |
| Read/create/edit a `dataset`/`template`/`table` | matching `*.read` / `*.manage` | ownership **or** an active grant on the target |
| Read/create/edit a `thread` | matching `thread.read` / `thread.manage` | role permission only until a thread owner field lands; threads are not grantable |
| Query clinical data (agent reads, ad-hoc query) | `dataset.query` | rows resolved by Dataset scope ∩ hospital permissions (§6). No raw source-DB query path for humans. |
| Table-population lifecycle (`POST /api/table-populations`, stream, stop, refresh, cell edit, status, workbook, download) | `table_population.create` / `table_population.read` / `table_population.stop` / `table_population.edit_cells` plus `table.read` for non-owner table-grant output reads | owner for lifecycle mutation/stream/stop/refresh/edit; status/workbook/download allow the table-population owner or a user with an active grant on the wrapping table. **No `admin` override.** |
| IAM (`/api/iam/*` — account / role management) | `iam.manage_users` / `iam.manage_roles` | **`admin`-only** — `403` for `clinician` |
| Source-database management — `POST /api/databases/upload`, `PATCH`/`DELETE /api/databases/{id}`, `POST /api/databases/{id}/reindex`, and `GET /api/databases/{id}` (detail/`model.json`) | `database.manage` | **`admin`-only** — `403` for `clinician`. The **summary list** `GET /api/databases` stays clinician-readable pre-Q31 (table population still names a database) — see [control-plane §9](control-plane-schema-and-permissions.md#9-endpoint-authorization). |
| Sharing (`POST …/grants`, `DELETE …/grants/{id}`, `GET /api/clinicians`, shared-with-me / shared-by-me) | `grant.manage_owned` | per §5 (owner or `manage`-grant holder); share targets must be active `clinician` accounts |
| Self-service set-password (first-login reset) | none beyond an authenticated session | the caller's own account only |

**Clinical endpoints are available to `clinician` and `admin` alike** — `admin` is a clinician-superset
([ADR 0003](../decisions/0003-admin-is-a-clinician-superset.md)); **only** the IAM / source-DB-connection
endpoints are `admin`-only (`403` for `clinician`). `GET /api/auth/me` and `POST /api/auth/login`
return the caller's `role`. A user whose `must_reset_password` is `true` may authenticate **only** to
reach the set-password endpoint; every other endpoint is `403` until it is cleared.

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
- **Response 200:** `{ "id": "<user-id>", "username": "<username>", "role": "admin" | "clinician" | "agent" }`
  (same shape as `GET /api/auth/me`; `role` is resolved server-side from `users.role_id`).
- **Error 401:** `{ "detail": "Invalid username or password" }`.
- **Side effect:** sets HttpOnly session cookie (`intero_session`).

### `POST /api/auth/logout` — logout
- **Request:** none.
- **Response 200:** `{ "ok": true }`.
- **Side effect:** clears session cookie server-side/client-side where present.

### `GET /api/auth/me` — current session user
- **Request:** none.
- **Response 200:** `{ "id": "<user-id>", "username": "<username>", "role": "admin" | "clinician" | "agent" }`.
  The `role` drives the SPA's role-aware navigation; it is resolved server-side from `users.role_id`,
  never trusted from the client. Drives the frontend gating in
  [auth-and-access.md §13](../features/auth-and-access.md).
- **Error 401:** `{ "detail": "Authentication required" }`.

### `GET /api/auth/table-populations` — per-user table-population history
- **Request:** none.
- **Response 200:** array of this user's table-population attribution entries.
  ```jsonc
  [{ "tablePopulationId": "tp-abc123", "audit_id": "cord-ph-audit", "request": "…",
     "filters": { "dateFrom": "", "dateTo": "", "hospitals": "", "cohort": "" },
     "started_at": "2026-06-08T08:00:00+00:00" }]
  ```
- **Error 401:** `{ "detail": "Authentication required" }`.

### `GET /api/auth/queries` — per-user query log
- **Request:** none.
- **Response 200:** array of this user's query-log entries.
  ```jsonc
  [{ "user_id": "<user-id>", "tablePopulationId": "tp-abc123", "database": "ehr-db",
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

## Templates

### `GET /api/templates` — list templates
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
  Stage-1 source of truth is `var/templates/<id>/spec.json` metadata plus the catalog row.
  The summary carries an optional `deadline` (ISO date, from `spec.json`
  `deadline`) so library cards can render the submission deadline — [library-and-sources.md](../features/library-and-sources.md) card face.

### `GET /api/templates/{templateId}` — template detail
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
- **Response 404:** `{ "detail": "Template not found." }` or artifact-missing detail (for example `"Template spec not found."`).
- **Response 422:** malformed artifact JSON (for example `"Template spec is invalid JSON."`).
- **What the detail view reads from this payload** ([library-and-sources.md](../features/library-and-sources.md) three-section page): `spec` is the
  full `spec.json` (incl. the optional `deadline` and per-field `notes`); `mapping` is the
  full `mapping.json` **or `null` when no database is bound yet** (the no-mapping fallback
  state) — it carries `fixed_criteria` (the editable criteria chips), `database_summaries`
  (the template-specific database-chip sentences), `fields[]` `kind` + `code` (the
  template-chip descriptions), and the `executable` block (not rendered).

### `POST /api/templates/upload` — upload a template
- **Request:** `multipart/form-data` with a single field `file` (the `.xlsx`).
- **Response 200:** `{ "id": "audit-1a2b3c4d", "name": "<derived from filename>" }`.
- **Side effect:** the new audit begins **indexing** — it appears as an
  `IndexingEntry` with `status: "indexing"` on the indexing stream and flips to
  `"ready"` when done.

### `PATCH /api/templates/{templateId}` — rename
- **Request:** `{ "name": "New name" }`.
- **Response 200:** `{ "id": "<templateId>", "name": "New name" }`.

### `DELETE /api/templates/{templateId}` — delete
- **Request:** none.
- **Response:** `204 No Content` (or `200 {}`). The front end treats `204` as success.

### `POST /api/templates/{templateId}/reindex` — re-index
- **Request:** none.
- **Response 200:** `{ "id": "<templateId>" }`.
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

## Table populations

A **table population** is the act of running the populate engine over a cohort to
fill an audit table; its server routes live in
`server/routes/table_populations.py`.
Every handle on the wire is `tablePopulationId`.

`POST /api/table-populations` starts a **template-backed** table population from
an existing audit id and returns `{ tablePopulationId, messages }`. The body is
**JSON only** (a non-JSON `Content-Type` is rejected `415`). A prompt-only,
pure-prose populated table is **deferred** in v1; the mock demo still keeps a
`createTablePopulationFromDescription(prompt)` helper, but the real API does not
accept `{ "prompt": ... }` without an `auditId`.

Refresh is in-place under one stable `tablePopulationId`; each execution attempt
carries an `executionId`. Execution role is derived by order: first execution =
initial, later executions = refresh.

### `POST /api/table-populations` — start from an existing audit (Flow A / C)
- **Request (JSON):**
  ```jsonc
  { "auditId": "cord-ph-audit",
    "filters": { "dateFrom": "", "dateTo": "", "hospitals": "", "cohort": "" },
    "database": "ehr-db"  // optional; omitted when not chosen
  }
  ```
- **Response 200:**
  ```jsonc
  { "tablePopulationId": "mock-1a2b3c4d",
    "messages": [ { "role": "assistant", "type": "text",
                    "content": "Audit started — the agent is working…" } ] }
  ```
- **Response 415:** `{ "detail": "Unsupported content type. Use application/json." }`.

### `GET /api/table-populations/{tablePopulationId}` — status (real-only)
- **Request:** none.
- **Authorization:** `table_population.read` plus table-population owner, or `table_population.read`
  + `table.read` plus an active grant on the table whose `table_population_id` wraps this table
  population. No `admin` override.
- **Response 200:**
  ```jsonc
  { "tablePopulationId": "<id>",
    "status": "running" | "completed" | "stopped" | "error" | "unknown",
    "messages": [
      { "role": "assistant", "type": "text",
        "content": "Table population <id> is completed." },
      // appended only when status === "completed":
      { "role": "assistant", "type": "chip", "label": "result.xlsx",
        "workbookUrl": "/api/table-populations/<id>/workbook",
        "downloadUrl": "/api/table-populations/<id>/download" }
    ] }
  ```
- **Response 401/403:** unauthenticated or not allowed.
- **Response 404:** `{ "detail": "Table population not found." }`.

### `POST /api/table-populations/{tablePopulationId}/stop` — stop (real-only)
- **Request:** none.
- **Response 200:** `{ "status": "stopped" }`. Stop is a cooperative user pause:
  it finalizes with a `review_summary` of the work done so far + `done`, so the
  table population reads as finished early, not failed (see [refresh.md](../features/refresh.md)).
- **Response 404:** `{ "detail": "Table population not found or already finished." }`.
- **Response 503:** `{ "detail": "Table population worker is not ready." }`.

### `DELETE /api/table-populations/{tablePopulationId}` — delete (mock)
- **Request:** none.
- **Response:** `204 No Content`. Hard-kills the live execution, then removes the
  table population from `var/state.db` (run row + cascaded child rows),
  `var/artifacts/<id>/`, and its attribution row. The front end treats `404` as
  success (already gone).
- **Response 401:** `{ "detail": "Authentication required" }`.
- **Response 403:** `{ "detail": "Table population ownership required to delete." }`.
- **Response 404:** `{ "detail": "Table population not found." }`.

### `POST /api/table-populations/{tablePopulationId}/refresh` — in-place refresh execution (real-only)
- **Request:** none.
- **Authorization:** `table_population.read` plus table-population owner. No `admin` override.
- **Response 200:** `{ "tablePopulationId": "<same-id>", "executionId": "<id>", "status": "started" }`.
- **Behavior:** starts a new execution under the same identity; does not create a
  new table population. Only a `completed` table population is refreshable.
- **Conflict and validation behavior (deterministic).** Each error body is
  `{ "detail": { "code": "<CODE>", "message": "<message>" } }`:
  - **404 Not Found** (`TABLE_POPULATION_NOT_FOUND`): the table population was not found.
  - **409 Conflict** (`TABLE_POPULATION_ACTIVE`): an execution is already active
    (includes duplicate rapid clicks while active).
  - **409 Conflict** (`TABLE_POPULATION_NOT_REFRESHABLE`): status does not allow refresh
    (not `completed`), or no refreshable source audit / source database is recorded.
- **Idempotency note:** no second refresh execution is created while one is active;
  rapid repeat requests return the same 409 `TABLE_POPULATION_ACTIVE` envelope above.

### `GET /api/table-populations/{tablePopulationId}/workbook` — fetch the populated workbook
- **Request:** none.
- **Authorization:** same read gate as `GET /api/table-populations/{tablePopulationId}`: owner, or
  active grant on the table wrapping this table population. No `admin` override.
- **Response 200:** a workbook snapshot rebuilt from `var/state.db` cells (the
  single source of truth; the live fill arrives over the stream instead).
  `resultStatus` is the durable, cell-derived table result status; `tablePopulationStatus`
  is the lifecycle status used to decide whether a fresh browser should reconnect
  the live stream. `startedAt` / `endedAt` carry elapsed-time truth:
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
    },
    "resultStatus": "complete", "tablePopulationStatus": "completed",
    "startedAt": "…", "endedAt": "…"
  }
  ```
- **Response 401/403/404:** unauthenticated, not allowed, or table population not found.
  `cellMetadata` is keyed `"<Sheet>!<A1ref>"`. The per-cell metadata object shape
  is frozen in [runtime-shapes.md](runtime-shapes.md).
- **Response 404:** `{ "detail": "Table population not found." }`.

### `GET /api/table-populations/{tablePopulationId}/download` — download `result.xlsx`
- **Request:** none.
- **Authorization:** same read gate as `GET /api/table-populations/{tablePopulationId}`: owner, or
  active grant on the table wrapping this table population. No `admin` override.
- **Response 200:** the `result.xlsx` binary, built from the same `var/state.db`
  cells (deselected/inactive members' rows dropped). Consumed by
  `downloadTablePopulationWorkbook`.
- **Response 401/403:** unauthenticated or not allowed.
- **Response 404:** `{ "detail": "Table population not found." }`.

### `PATCH /api/table-populations/{tablePopulationId}/cells/{ref}` — clinician review/correction
- A real route (`server/routes/table_populations.py`) **not** called from `api.js`
  today; out of this contract's coverage map. Authorization is normative in
  [control-plane §9](control-plane-schema-and-permissions.md#9-endpoint-authorization)
  (`table_population.edit_cells` + ownership) — see also [§Authorization rules](#authorization-rules).

## SQL

### `POST /api/sql` — execute a read-only query
- **Request (JSON):** `{ "query": "SELECT …", "database": "ehr-db" }`, where `database` is a registered database slug (never a filesystem path).
- **Response 200:** a [`StructuredResult`](#structuredresult-a-sqllookup-result).
  A note query returns the note-shaped `StructuredResult`
  (columns `["AUTHOR_ROLE", "DATE", "NOTE_TYPE", "TEXT"]`).

---

## Datasets

A **Dataset** is a saved, named filter that scopes the hospital database to a
slice (library-and-sources.md, inclusion-criteria-setup.md). Its canonical state
is the grounded `criteria` (each a real column + structured `predicate`) and its
`cohort` base; `cohort_sql`, `count`, and each criterion's `sql`/`params`/
`display` are **derived deterministically** by the engine and re-derive
identically on reload. Persisted at `var/datasets/<id>/dataset.json`, validated
against [dataset.schema.json](dataset.schema.json). All endpoints require auth
(`401` when unauthenticated); reads need `dataset.read`, writes `dataset.manage`
(`403` otherwise).

### `GET /api/datasets` — list Datasets
- **Request:** none.
- **Response 200:** array of Dataset summaries for library cards.
  ```jsonc
  [{ "id": "dataset-cordph-term-nicu",
     "name": "Term babies admitted to NICU",
     "databases": ["cord-ph"],
     "count": 1 }]
  ```

### `GET /api/datasets/{datasetId}` — full Dataset
- **Request:** none.
- **Response 200:** the full persisted Dataset (schema: `dataset.schema.json`),
  carrying `cohort`, the grounded `criteria` (with derived `sql`/`params`/
  `display`), `not_available`, the derived `cohort_sql`, and `count`.
- **Response 404:** `{ "detail": "Dataset not found." }`.

### `POST /api/datasets` — create a Dataset from a plain-language slice
- **Request (JSON):**
  ```jsonc
  { "name": "Term babies admitted to NICU",
    "description": "optional",
    "databases": ["cord-ph"],
    "anchor": "cord-ph -> cord_ph_birth_records.patient_code",
    "text": "babies born at term admitted to NICU" }
  ```
- **Behavior:** derives the cohort base from `anchor`, grounds `text` into
  criteria (one closed-set LLM call), partitions out criteria on unlinkable
  databases, then re-derives + proves the read-only `count` before persisting. A
  phrase that grounds to nothing structural is kept honestly in `not_available`,
  never forced into a predicate.
- **Response 200:** the full derived Dataset (same shape as `GET`). The minted id
  is `dataset-<uuid hex prefix>`.

### `PATCH /api/datasets/{datasetId}` — edit one chip's value (deterministic)
- **Request (JSON):** `{ "criterionId": "gestation_weeks", "value": 35 }`.
- **Behavior:** sets the named criterion's `predicate.value` and re-derives —
  **no LLM** — so the `count` and `display` move deterministically.
- **Response 200:** the full re-derived Dataset.
- **Response 404:** Dataset or criterion not found.

### `DELETE /api/datasets/{datasetId}` — delete
- **Request:** none.
- **Response:** `204 No Content`. Removes `var/datasets/<id>/`.

### `POST /api/datasets/{datasetId}/filters` — add a filter row
- **Request (JSON):** `{ "text": "born at term" }`.
- **Behavior:** grounds the phrase (one LLM call), appends the usable criteria
  (+ any `not_available`), re-derives, and re-proves the `count` before saving.
- **Response 200:** the full re-derived Dataset.

---

## Threads

A **thread** is the free-ranging, **unscoped** conversation surface — the only
conversation surface in the product (product-flows.md §Threads, tables &
outputs). It **roams**: it carries no fixed Dataset; *each message* resolves its
own scope ([decisions/0004](../decisions/0004-scope-binds-to-table-not-thread.md))
and **does not fork**. A thread **persists** (recency-ordered by `updated_at`,
searchable, deletable). Each user message is passed to the agent without backend
regex/phrase-list pre-routing. The agent message carries `resolution` metadata:

- a **chat** output carries the **real natural-language Answer** on the agent
  message's `content`, plus its inline sources on `resolution.citations` whenever
  it relies on database values (absent for a purely navigational answer). The
  Answer is composed by the primary thread agent
  ([chat-answer.md](chat-answer.md)): a per-message **Dataset or whole-DB**,
  **permission-bounded**, **fail-closed** read of the registered read-only hospital
  database. `seam` is `null` (chat is built). The streaming endpoint below emits
  the same final thread plus `chat_activity` and `chat_delta` events while the
  answer renders inline.
  If the skill can't produce an answer, the agent message states so honestly and
  carries no `citations` (the request never 500s).
- if the agent calls `ask_user_question`, the agent message carries
  `resolution.ask_user_questions` and the frontend composer collects the answers.

Persisted at `var/threads/<id>/thread.json`, validated against
[thread.schema.json](thread.schema.json). All endpoints require auth (`401` when
unauthenticated); reads need `thread.read`, writes `thread.manage` (`403`
otherwise). *(Per-owner thread isolation — scoping the list/read/delete to the
caller's own threads — is deferred to the auth/ownership work; v1 single-tenant
local has no owner field on the thread yet.)* Threads are **not** a
grantable `resource_type` (thread sharing is deferred — see
[control-plane §5](control-plane-schema-and-permissions.md#5-resource-grants-and-sharing)).

### `GET /api/threads` — list threads
- **Request:** none.
- **Response 200:** array of thread summaries, **recency-ordered by `updated_at`
  DESC**, for the Threads list.
  ```jsonc
  [{ "id": "thread-1a2b3c4d5e6f",
     "title": "Audit the term NICU babies",
     "updated_at": "2026-06-25T08:01:02+00:00",
     "message_count": 4 }]
  ```

### `GET /api/threads/{thread_id}` — full thread
- **Request:** none.
- **Response 200:** the full persisted thread (schema:
  [thread.schema.json](thread.schema.json)) — its `messages` (each user message
  followed by the agent message carrying the agent `resolution`) and
  `artifact_ids` (back-references to spawned tables; `[]` until a table is spawned).
- **Response 404:** `{ "detail": "Thread not found." }` (missing or invalid id).

### `POST /api/threads` — create a thread
- **Request (JSON):** `{ "message"?: "<string>", "attachments"?: [{ "type": "dataset" | "template", "id": "<id>" }] }`.
- **Behavior:** mints a `thread-<uuid hex prefix>` id. If `message` is given, it
  is appended as the first **user** message, with any request attachments, passed
  to the agent, and the **agent** resolution message is appended; the **title**
  is derived from the message (trimmed to ~60 chars). Omitted/empty ⇒ an empty
  thread titled `"New thread"`.
- **Response 200:** the full thread (same shape as `GET`).

### `POST /api/threads/{thread_id}/messages` — post a user message
- **Request (JSON):** `{ "content": "<string>", "attachments"?: [{ "type": "dataset" | "template", "id": "<id>" }] }`.
- **Behavior:** appends the **user** message with any request attachments, passes
  it to the agent, appends the **agent** resolution message, bumps `updated_at`,
  and persists.
- **Response 200:** the full thread.
- **Response 404:** `{ "detail": "Thread not found." }`.

### `POST /api/threads/{thread_id}/messages/stream` — post and stream a user message
- **Request (JSON):** `{ "content": "<string>", "attachments"?: [{ "type": "dataset" | "template", "id": "<id>" }] }`.
- **Behavior:** same agent/write semantics as `POST /messages`, but returns
  data-only SSE frames (`data: <json>\n\n`) so the frontend can render a chat
  answer inline while it arrives. Event `type` is the discriminator.
- **Events:**
  - `thread_snapshot` — a full thread after the user message and placeholder
    agent message are appended.
  - `chat_delta` — `{ messageIndex, content }`, the cumulative streamed answer
    text for the agent message.
  - `chat_activity` — `{ messageIndex, activity }`, a bounded forwarded
    `chat-answer` session activity item (`tool` / `thinking`) for inline progress.
  - `ask_user_questions` — `{ messageIndex, request }`, emitted when the agent
    asks structured follow-up questions.
  - `done` — `{ thread }`, the persisted final thread.
  - `error` — `{ message }`, a terminal persistence/stream error.
- **Response 404:** `{ "detail": "Thread not found." }` before streaming starts.

### `POST /api/threads/{thread_id}/question-answers` — answer agent questions
- **Request (JSON):** `{ "answers": [{ "question_id": "dataset_scope", "status": "answered", "choice_id": "whole_db", "text": null }] }`.
- **Behavior:** marks the latest pending `resolution.ask_user_questions` request
  as `answered` or `skipped`. If at least one question was answered, appends the
  answers as a user message and starts a follow-up agent turn with the original
  request plus the answers. If every question was skipped, it marks the request
  skipped and returns the composer to normal without starting a follow-up turn.
- **Response 200:** the full thread.
- **Response 409:** `{ "detail": "No pending questions." }`.

### `POST /api/threads/{thread_id}/question-answers/stream` — answer and stream follow-up
- **Request (JSON):** same payload as `POST /question-answers`.
- **Behavior:** same answer-marking semantics, but if at least one question was
  answered, the follow-up agent turn streams with the same SSE event types as
  `POST /messages/stream`. This keeps `chat_activity` visible for the agent
  message created after the question form.
- **Response 200:** data-only SSE frames ending in `done`.
- **Response 409:** `{ "detail": "No pending questions." }`.

### `POST /api/chat/evidence` — execute chat citation evidence
- **Request (JSON):** a reference to a persisted chat citation:
  `{ "thread_id": "thread-…", "message_index": 1, "marker": "1", "covered_row_index"?: 0 }`.
- **Behavior:** checks `thread.read`, reloads the persisted thread citation (or an
  aggregate citation's covered row), re-validates its registered database slug,
  opens the registered SQLite DBs read-only, ATTACHes sibling registered DBs
  read-only by slug, and executes only that stored SELECT evidence query.
- **Response 200:** a [`StructuredResult`](#structuredresult-a-sqllookup-result).
- **Response 404:** thread/message/citation not found.
- **Response 422:** missing citation reference, stored non-SELECT query, or
  unregistered/path-style database.

### `PATCH /api/threads/{thread_id}` — rename
- **Request:** `{ "title": "New title" }`.
- **Response 200:** the full thread, with its `title` replaced and `updated_at`
  bumped. A rename touches only the display title (no other field changes).
- **Response 404:** `{ "detail": "Thread not found." }`.
- **Response 422:** `{ "detail": "Title is required." }` for a blank title.
- Requires `thread.manage`.

### `DELETE /api/threads/{thread_id}` — delete
- **Request:** none.
- **Response:** `204 No Content`. Removes `var/threads/<id>/`.
- **Response 404:** `{ "detail": "Thread not found." }`.

---

## Tables

A **table** is a populated audit table — a first-class, auto-persisted,
re-openable entity that **wraps table population** (Q36;
[decisions/0004](../decisions/0004-scope-binds-to-table-not-thread.md)). When the
a table is created, the system **PINS** a table spec (columns/grain + scope) and
**SPAWNS** table population; the table back-references it via
`table_population_id`. Because the populate is a server-side background task
writing cells to `var/state.db`, it **survives navigation** for free.

The populate engine is **template-backed only**: a `source_template` that is a
seeded audit id (e.g. `cord-ph`, `npda`) is spawned via the existing
`POST /api/table-populations` path; the literal `"ad-hoc"` is pinned + persisted
with `table_population_id = null` / `status = "queued"` (its populate needs the
separate template-persist→mapping flow). Persisted as one `tables` row in
`var/state.db`, validated against [table.schema.json](table.schema.json). All endpoints require
auth (`401` when unauthenticated); reads need `table.read`, writes `table.manage`
(`403` otherwise).

The **stream / workbook / download / status** of a populated table are the **existing**
[`GET /api/table-populations/{tablePopulationId}/stream`](#streaming-endpoints) ·
[`GET /api/table-populations/{tablePopulationId}/workbook`](#get-apitable-populationstablepopulationidworkbook--fetch-the-populated-workbook) ·
[`GET /api/table-populations/{tablePopulationId}/download`](#get-apitable-populationstablepopulationiddownload--download-resultxlsx) ·
[`GET /api/table-populations/{tablePopulationId}`](#get-apitable-populationstablepopulationid--status-real-only) — the FE reuses
them via the table's `table_population_id`. They are **not** redefined here.

### `GET /api/tables` — list tables
- **Request:** none.
- **Response 200:** array of table summaries, **recency-ordered by `updated_at`
  DESC**, for the Tables list.
  ```jsonc
  [{ "id": "table-1a2b3c4d5e6f",
     "title": "Term NICU cord-pH audit",
     "description": "",
     "source_template": "cord-ph",
     "reporting_period_label": "2026-06-26T08:01:02+00:00",
     "status": "in_progress",
     "updated_at": "2026-06-26T08:01:02+00:00",
     "opened": false }]
  ```
  `opened` is **per-user**, derived into this response (never stored on the
  shared table): `true` when the **requesting** user has opened the table's full
  grid (`POST /api/tables/{id}/open`), so the sidebar can suppress the blue
  "finished, unopened" dot. A different user opening the table does not change it
  for others.

### `GET /api/tables/{tableId}` — full table
- **Request:** none.
- **Response 200:** the full persisted table (schema:
  [table.schema.json](table.schema.json)) — its pinned `spec` (columns + grain),
  `dataset_id` (the pinned scope, or `null` = whole-DB), `scope_disclosure`,
  `table_population_id`, `thread_id` (provenance), and `status`. The `status` is
  **refreshed from the live populate** (`GET /api/table-populations/{table_population_id}`
  state) and persisted, so a reopened table shows current progress.
- **Response 404:** `{ "detail": "Table not found." }` (missing or invalid id).

### `POST /api/tables/{tableId}/open` — mark opened (per-user "seen")
- **Request:** none.
- **Permission:** `table.read` (viewing requires read — the same gate as `GET`).
- **Behavior:** records that the **current user** has opened this table's full
  grid, persisted **per-user** in the auth store's `table_views` table (see
  [storage-layout.md §3](storage-layout.md)). Idempotent (re-opening is a no-op);
  marks opened **regardless of status** — "opened" only suppresses the blue
  "finished, unopened" dot, so a still-working table stays amber. The shared
  `table.json` entity is **not** touched; the flag surfaces only as the per-user
  `opened` field on the tables-list response.
- **Response:** `204 No Content`.
- **Response 404:** `{ "detail": "Table not found." }` (missing or invalid id).

### `POST /api/tables` — pin + spawn a table
- **Request (JSON):**
  ```jsonc
  { "title": "Term NICU cord-pH audit",
    "description": "optional",
    "source_template": "cord-ph",   // a seeded audit id, or "ad-hoc"
    "dataset_id": "dataset-cordph-term-nicu",  // optional; null = whole-DB
    "spec": { "columns": [{ "id": "all/patient_code", "name": "Patient code" }],
              "grain": "one row per patient record" },  // optional snapshot override
    "thread_id": "thread-1a2b3c4d5e6f" }  // optional provenance back-ref
  ```
- **Behavior:** pins the table (deriving the columns/grain snapshot from the
  seeded audit's `spec.json` when `spec` is omitted); for a template-backed
  `source_template` it **spawns table population** (the same background
  task as `POST /api/table-populations`, `audit_id = source_template`, the
  populate's `database`/`filters` derived from the pinned Dataset when given) and
  records `table_population_id` + `status = "in_progress"`. For `"ad-hoc"` it
  persists `table_population_id = null` / `status = "queued"` (no engine change).
  The minted id is `table-<uuid hex prefix>`.
- **Response 200:** the full table (same shape as `GET`).

### `PATCH /api/tables/{tableId}` — rename
- **Request:** `{ "title": "New title" }`.
- **Response 200:** the full table, with its `title` replaced and `updated_at`
  bumped. Scope is pinned for life ([decision 0004](../decisions/0004-scope-binds-to-table-not-thread.md)),
  so a rename touches ONLY the display title — never `dataset_id` or the table population.
- **Response 404:** `{ "detail": "Table not found." }`.
- **Response 422:** `{ "detail": "Title is required." }` for a blank title.
- Requires `table.manage`.

### `DELETE /api/tables/{tableId}` — delete
- **Request:** none.
- **Response:** `204 No Content`. Removes the table's `tables` row. Stopping/deleting
  the underlying populate is the existing table-population lifecycle
  (`DELETE /api/table-populations/{table_population_id}`).
- **Response 404:** `{ "detail": "Table not found." }`.

---

## Sharing

Sharing is editor-only in the product UI: `createGrant()` always sends
`grant_type = "manage"`. The control-plane schema still accepts `read`/`run`/`manage`; `read` and
`run` are reserved for future/agent use and are not surfaced as product sharing levels.

### `GET /api/clinicians` — active clinician share-target directory
- **Request:** none.
- **Authorization:** `grant.manage_owned`.
- **Response 200:** active `clinician` accounts only, with no PID/IAM fields:
  ```jsonc
  [{ "id": "u_clinician_2", "display_name": "Asha Patel" }]
  ```
- **Response 401/403:** unauthenticated or missing `grant.manage_owned`.

### `POST /api/grants` — share a resource
- **Request (JSON):**
  ```jsonc
  {
    "resource_type": "dataset" | "template" | "table",
    "resource_id": "dataset-1a2b3c4d",
    "subject_id": "u_clinician_2",
    "grant_type": "manage",
    "expires_at": null
  }
  ```
- **Authorization:** `grant.manage_owned` plus the §5 owner/manage predicate on the target resource.
  `admin` has no override.
- **Behavior:** creates a user grant for an active `clinician` share target. `thread`, `project`,
  unknown, inactive, `admin`, and `agent` targets fail validation. Identity is resolved from the
  session; any client-supplied `user_id` is ignored.
- **Response 200:** created grant row:
  ```jsonc
  {
    "id": "grant-1a2b3c4d",
    "resource_type": "table",
    "resource_id": "table-1a2b3c4d",
    "subject_id": "u_clinician_2",
    "grant_type": "manage",
    "granted_by": "u_owner",
    "created_at": "2026-06-27T08:01:02+00:00",
    "expires_at": null
  }
  ```
- **Response 401/403/422:** unauthenticated, not allowed, or invalid resource/share target/expiry.

### `DELETE /api/grants/{grantId}` — revoke a grant
- **Request:** none.
- **Authorization:** `grant.manage_owned` plus the §5 owner/manage predicate on the grant's resource.
- **Response:** `204 No Content`. Revoke fail-closes the grantee's next request.
- **Response 401/403/404:** unauthenticated, not allowed, or grant not found.

### `GET /api/grants/shared-with-me` — inbound grants
- **Request:** none.
- **Authorization:** `grant.manage_owned`.
- **Response 200:** active grants others issued to the caller, excluding ownership self-grants:
  ```jsonc
  [{ "grant_id": "grant-1a2b3c4d",
     "resource_type": "table",
     "resource_id": "table-1a2b3c4d",
     "grant_type": "manage",
     "expires_at": null,
     "label": "Term NICU cord-pH audit" }]
  ```

### `GET /api/grants/shared-by-me` — manageable outbound grants
- **Request:** none.
- **Authorization:** `grant.manage_owned`.
- **Response 200:** active person-to-person grants on resources the caller can manage. This backs the
  Share dialog chips for owners and editors; ownership self-grants and the caller's own inbound grant
  are excluded.
  ```jsonc
  [{ "grant_id": "grant-1a2b3c4d",
     "resource_type": "dataset",
     "resource_id": "dataset-1a2b3c4d",
     "label": "Term NICU babies",
     "grant_type": "manage",
     "expires_at": null,
     "grantee": { "subject_id": "u_clinician_2", "display_name": "Asha Patel" } }]
  ```

---

## Filter extraction

### `POST /api/parseFilters` — resolve free text into structured filter chips
The **single** extractor behind both the live-prompt extraction and the manual *add-filter*
control (see [product-flows.md §Filter interaction](../product-flows.md#filter-interaction)). The model
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
  (`criterionId` constrained to the supplied `availableCriteria`).
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
**event payloads** are frozen in [runtime-shapes.md](runtime-shapes.md).

### `GET /api/indexing/stream` — indexing state (SSE)
- Consumed by `app/src/stores/indexing.js`.
- Each `message` event's `data` is a JSON-encoded
  [`IndexingEntry`](#indexingentry-indexing-state-of-one-auditdatabase). The front
  end keys entries by `"<kind>:<id>"`, toasts on `indexing → ready`/`error`, and
  flashes a transient "ready" chip. (In mock mode there is no backend; entries are
  pushed into the store directly, so the stream is not opened.)

### `GET /api/table-populations/{tablePopulationId}/stream` — live populate events (SSE)
- Consumed by `app/src/stores/chat.js`.
- Each frame is a `data:`-only SSE line carrying a JSON-encoded event discriminated
  by `type`: `workbook_created`, `cell_update`, `refresh_summary`, `done`, `error`,
  plus reasoning events (`activity` / `delta` / part snapshots). **The full event
  payloads are frozen in [runtime-shapes.md](runtime-shapes.md)** — this contract
  only fixes the endpoint and that events arrive as JSON over SSE.
- Events emitted during a refresh execution carry `executionId` so activity and
  cell updates can be grouped per execution under the same `tablePopulationId`.
