"""DDL for the state store (`runs` / `cells` / `events`).

Implements the frozen W0.2 contract
(`specs/mvp/contracts/state-schema.md`) as SQLite tables. The contract is
engine-agnostic and names list/map-valued fields (`database_ids`,
`prompt_versions`, `filters`, `parameters`, `sources`) as
JSON-encoded in a single store for the MVP; they may normalise to side tables
when this moves to hospital-hosted infra (doc 7 §Persistence) without changing
the contract. Columns here never rename or drop a contract field.
"""

from __future__ import annotations

SCHEMA = """
-- Retire triggers removed by the provenance redesign: a state.db created before
-- this branch still has them armed (CREATE ... IF NOT EXISTS won't drop them), and
-- the agent no longer authors record_id, so the old identity-match trigger would
-- reject every agent write. (We don't keep backward-compat; just clear the stale.)
DROP TRIGGER IF EXISTS cells_sources_identity_match;
DROP TRIGGER IF EXISTS cells_sources_identity_match_insert;

CREATE TABLE IF NOT EXISTS runs (
    id               TEXT PRIMARY KEY,
    audit_id         TEXT NOT NULL,
    user_id          TEXT,
    request          TEXT,
    template_version TEXT,
    database_ids     TEXT,   -- json list<ref>
    status           TEXT NOT NULL DEFAULT 'queued',
    prompt_versions  TEXT,   -- json map
    filters          TEXT,   -- json list
    parameters       TEXT,   -- json map
    started_at       TEXT,
    ended_at         TEXT,
    -- Table-population PROCESS status (issue #326): the ONLY population
    -- lifecycle record, written by the single canonical writer
    -- (core.table_population.table_population_sessions.record_status).
    -- queued | running | stopped | error | completed — DISTINCT from `status`
    -- (the cell-derived RESULT status). Vocabulary enforced in Python
    -- (Store.record_population_status), not by CHECK: a pre-#326 state.db
    -- gains these columns via ALTER TABLE, which cannot retrofit a CHECK.
    -- Legacy per-run-dir status.json files are adopted into this record once
    -- at startup (adopt_legacy_status_files) and never written again.
    population_status        TEXT,
    population_status_detail TEXT,
    population_result_status TEXT
);

CREATE TABLE IF NOT EXISTS cells (
    run_id           TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    ref              TEXT NOT NULL,   -- <Sheet>!<A1>
    field            TEXT,            -- audit field id (S1; set at pending-insert)
    member           TEXT,            -- cohort-member identity (S1; set at pending-insert)
    kind             TEXT,            -- direct | interpret
    state            TEXT,            -- pending | filled | blocked | not_applicable (doc 5 §Cell state model)
    value            TEXT,
    confidence       TEXT,            -- low | medium | high
    resolved_by      TEXT,            -- prepopulated | agent (which step settled it)
    hypothesis       TEXT,            -- note on why the value is hard to place (agent triage)
    attempts         TEXT,            -- json list (actual DB queries, in order)
    review_state     TEXT,            -- interpret only: not_reviewed | reviewed
    corrected        INTEGER,         -- interpret only: 0 | 1
    explanation      TEXT,
    sources          TEXT,            -- json list (per-(db,row) query + table.column + row_id? + citations?)
    prompt_version   TEXT,
    extracted_at     TEXT,
    reason_code      TEXT,            -- blocked only
    reason_detail    TEXT,            -- blocked only
    owner_needed     TEXT,            -- blocked only
    outstanding_since TEXT,           -- blocked only
    PRIMARY KEY (run_id, ref),
    -- The cell lifecycle is enforced HERE so every writer (both population steps, the
    -- agent's raw SQL included) is held to the same contract at the DB level,
    -- not in per-writer Python (cell-resolution.schema.json).
    -- The four STORED states only — "needs verification" is a DERIVED view
    -- (filled + interpret + review_state not_reviewed), never stored
    -- (doc 5 §Cell state model). NOTE: a state.db created before this change
    -- keeps its baked-in five-value CHECK (SQLite cannot alter it without a
    -- table rebuild) — harmless, since no writer emits the legacy value and
    -- the migration below rewrites any historical rows.
    CHECK (state IS NULL OR state IN
        ('pending', 'filled', 'blocked', 'not_applicable')),
    -- A blocked cell must say why and how (doc 10): no silent blocks.
    CHECK (state != 'blocked' OR (reason_code IS NOT NULL AND reason_detail IS NOT NULL))
);

-- The audit field code sets, MATERIALISED per run from spec.json at run start
-- (Store.materialize_field_codes). spec.json stays the canonical, authored
-- source; this is a derived, run-scoped projection (regenerated every run, never
-- hand-authored) that exists ONLY so off-code writes can be rejected at the DB
-- level for every writer. The cell still carries no code set — it is resolved by
-- the (run_id, field) key here, never copied onto the row.
CREATE TABLE IF NOT EXISTS field_codes (
    run_id   TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    field    TEXT NOT NULL,
    code     TEXT NOT NULL,
    meaning  TEXT,
    PRIMARY KEY (run_id, field, code)
);

-- Off-code guard: a value written to a cell whose field HAS a code set must be
-- one of that field's codes. Fires only when the field is coded (free-text /
-- numeric fields have no field_codes rows and pass through). The agent's raw
-- `UPDATE cells SET value=...` is rejected here exactly like any other write —
-- the enforcement lives in the DB, not in the tool. Free-form RAISE message; the
-- write wrapper enriches it with the permitted set before returning to the agent.
CREATE TRIGGER IF NOT EXISTS cells_offcode_guard_update
BEFORE UPDATE OF value ON cells
WHEN NEW.value IS NOT NULL
 AND EXISTS (SELECT 1 FROM field_codes fc
             WHERE fc.run_id = NEW.run_id AND fc.field = NEW.field)
 AND NOT EXISTS (SELECT 1 FROM field_codes fc
             WHERE fc.run_id = NEW.run_id AND fc.field = NEW.field AND fc.code = NEW.value)
BEGIN
    SELECT RAISE(ABORT, 'off-code: value is not in the permitted code set for this field. Look up the field with lookup_execute({field:"<field>"}) to see the allowed codes, pick the matching code, and re-issue the UPDATE with that code.');
END;

CREATE TRIGGER IF NOT EXISTS cells_offcode_guard_insert
BEFORE INSERT ON cells
WHEN NEW.value IS NOT NULL
 AND EXISTS (SELECT 1 FROM field_codes fc
             WHERE fc.run_id = NEW.run_id AND fc.field = NEW.field)
 AND NOT EXISTS (SELECT 1 FROM field_codes fc
             WHERE fc.run_id = NEW.run_id AND fc.field = NEW.field AND fc.code = NEW.value)
BEGIN
    SELECT RAISE(ABORT, 'off-code: value is not in the permitted code set for this field. Look up the field with lookup_execute({field:"<field>"}) to see the allowed codes, pick the matching code, and re-issue the UPDATE with that code.');
END;

-- State migration (doc 5 §Cell state model, T13): the legacy stored
-- `needs_verification` value becomes `filled` + `review_state not_reviewed`
-- (needs-verification is derived, never stored). Idempotent; runs with the
-- old triggers dropped below so legacy rows can't trip the re-armed guard
-- mid-rewrite. The old triggers are then recreated filled-only — DROP+CREATE
-- (not IF NOT EXISTS alone) so a pre-change state.db gets the new guard too.
DROP TRIGGER IF EXISTS cells_sources_required;
DROP TRIGGER IF EXISTS cells_sources_required_insert;
UPDATE cells
   SET review_state = COALESCE(review_state, 'not_reviewed'),
       state = 'filled'
 WHERE state = 'needs_verification';

-- Backfill: a filled INTERPRET cell needs clinician sign-off, so it must carry
-- review_state='not_reviewed' (needs-verification = filled + interpret +
-- not_reviewed). Earlier writers filled interpret cells without setting it,
-- leaving review_state NULL — which made the backend's needs_verification
-- under-count (and the FE chip over-count via its fallback). Idempotent: only
-- touches the NULLs. New writes are handled by the triggers below.
UPDATE cells
   SET review_state = 'not_reviewed'
 WHERE state = 'filled' AND kind = 'interpret' AND review_state IS NULL;

-- Sources guard — a filled cell must carry a non-empty sources[]. This is the
-- traceability contract: every value can be re-extracted from its source, and
-- a clinician clicking the cell sees what produced it
-- (cell-resolution.schema.json §source). Enforced at the DB so it holds for
-- EVERY writer (Tier 1/2/3, the agent's raw SQL) — never per-tier discipline.
-- The cohort identity is NOT repeated on a source: it is the cell's `member`, so
-- there is no separate record_id-equals-member check — a source is, by
-- construction, that member's. A note-derived source additionally carries
-- `row_id` + verbatim `citations`; those are shape, not a DB-enforced invariant.
CREATE TRIGGER IF NOT EXISTS cells_sources_required
BEFORE UPDATE OF state, value, sources ON cells
WHEN NEW.state = 'filled'
 AND (NEW.sources IS NULL
      OR NOT json_valid(NEW.sources)
      OR json_array_length(NEW.sources) = 0)
BEGIN
    SELECT RAISE(ABORT, 'sources required: a filled cell must include a non-empty sources array. Each source is a JSON object {database, query, table_column} (with optional row_id + citations for a note): the SQL that surfaces the value alongside the cohort identity (so the value is self-verifying). The patient identity is the cell''s member and is not repeated on the source. Re-issue the UPDATE setting the sources column to a JSON array with at least one such entry.');
END;

-- Same guard for a direct INSERT of a non-pending row (the canonical path is
-- INSERT pending + UPDATE to resolve, but upserts can land filled straight in).
CREATE TRIGGER IF NOT EXISTS cells_sources_required_insert
BEFORE INSERT ON cells
WHEN NEW.state = 'filled'
 AND (NEW.sources IS NULL
      OR NOT json_valid(NEW.sources)
      OR json_array_length(NEW.sources) = 0)
BEGIN
    SELECT RAISE(ABORT, 'sources required: a filled cell must include a non-empty sources array. Each source is a JSON object {database, query, table_column} (with optional row_id + citations for a note): the SQL that surfaces the value alongside the cohort identity (so the value is self-verifying). The patient identity is the cell''s member and is not repeated on the source. Re-issue the UPDATE setting the sources column to a JSON array with at least one such entry.');
END;

-- Interpret cells need clinician sign-off, so the moment one becomes `filled`
-- it must carry review_state='not_reviewed' — that is what makes the DERIVED
-- "needs verification" view (filled + interpret + not_reviewed) accurate for
-- EVERY writer (Tier 2, the agent's raw SQL), never per-tier discipline, and
-- what keeps the top-band chip in lock-step with the review summary. Enforced
-- at the DB like the other cell guards. Idempotent + recursion-safe: the WHEN
-- guard fires only while review_state IS NULL, and the trigger body UPDATEs
-- review_state (not state), so it cannot re-fire itself.
CREATE TRIGGER IF NOT EXISTS cells_interpret_review_state_update
AFTER UPDATE OF state ON cells
WHEN NEW.state = 'filled' AND NEW.kind = 'interpret' AND NEW.review_state IS NULL
BEGIN
    UPDATE cells SET review_state = 'not_reviewed'
     WHERE run_id = NEW.run_id AND ref = NEW.ref;
END;

CREATE TRIGGER IF NOT EXISTS cells_interpret_review_state_insert
AFTER INSERT ON cells
WHEN NEW.state = 'filled' AND NEW.kind = 'interpret' AND NEW.review_state IS NULL
BEGIN
    UPDATE cells SET review_state = 'not_reviewed'
     WHERE run_id = NEW.run_id AND ref = NEW.ref;
END;

CREATE TABLE IF NOT EXISTS run_executions (
    id           TEXT PRIMARY KEY,
    run_id       TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'queued',
    started_at   TEXT,
    ended_at     TEXT,
    summary_json TEXT, -- json object
    CHECK (status IN ('queued', 'running', 'completed', 'error', 'stopped'))
);

CREATE TABLE IF NOT EXISTS run_members (
    run_id                  TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    member                  TEXT NOT NULL,
    row_index               INTEGER,
    active                  INTEGER NOT NULL DEFAULT 1,
    first_seen_execution_id TEXT,
    last_seen_execution_id  TEXT,
    PRIMARY KEY (run_id, member),
    CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id       TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    execution_id TEXT,
    ts           TEXT,
    type         TEXT,    -- activity | cell_update | status_change | verification
    payload      TEXT     -- json
);

CREATE INDEX IF NOT EXISTS idx_cells_run ON cells(run_id);
CREATE INDEX IF NOT EXISTS idx_field_codes_run ON field_codes(run_id, field);
CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id, id);
CREATE INDEX IF NOT EXISTS idx_run_executions_run ON run_executions(run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_run_members_run ON run_members(run_id, row_index, member);
CREATE INDEX IF NOT EXISTS idx_runs_user_started ON runs(user_id, started_at);
"""
