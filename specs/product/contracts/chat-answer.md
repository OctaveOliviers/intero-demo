# Contract — chat-answer (the `chat-answer` skill + citation tools)

The agent-facing contract for the primary thread agent's **Answer** output
(ADR 0006): how a clinician's message becomes a natural-language Answer with
inline citations. Nothing routes the message — the agent interprets it and
chooses the Output (an Answer, or a Table via the `table_execute` tool). This
is the Answer sibling of the `table-fill` skill — same `navigate` tools, same
**evidence** source shape — but with **no cells, no population steps, no worksheet**. See also [table-population.md](../features/table-population.md) §"Chat output",
[navigation.md](../features/navigation.md), and
[traceability-and-evidence.md](../features/traceability-and-evidence.md).

## The `chat-answer` skill

`core/agent/skills/chat-answer/SKILL.md`. Instructs the agent to:

1. **Resolve the request inside the agent turn.** The backend does not pre-parse
   the user message with regexes, phrase lists, or hidden classifiers before the
   agent sees it. The agent uses `navigate` over databases, Datasets, and templates
   to understand required inputs and output shape.
2. **Ask when essential input is unclear** with `ask_user_question`; the composer
   collects the answers and the agent continues from them.
3. **Find the data with `navigate`** (`search_execute` / `describe_execute` /
   `join_paths_execute` / `catalog_execute`) — never a whole-schema dump.
4. **Read read-only over `sql_execute`** in **chat mode** (below): plain SELECT,
   no cohort injection. If the message scoped to a Dataset, the prompt supplies
   that Dataset's cohort SQL/criteria and the agent applies it explicitly.
5. **Compose** a natural-language answer as visible assistant text.
6. **Call `cite_execute`** at the point where a claim needs evidence, carrying
   the **source** for that claim (the **evidence** skill — which already names
   `chat-answer` as a sink). The backend assigns marker numbers.
7. **Stop when the visible answer is complete.** There is no final-answer tool;
   the backend persists the streamed text plus recorded citations.

Allowed tools: the four `navigate` tools + `sql_execute` + `cite_execute` +
`ask_user_question` + `table_execute` (the **Table request** tool — recording it
is how the agent chooses the Table output; the backend owns the pin-and-populate
side effect, ADR 0006).
**Never fabricate** — a claim with no real source is not made.

## The `ask_user_question` tool

`core/agent/tools/ask_user.py` (+ `ask_user.ts`, exported as
`ask_user_question`) records one or more structured questions in the chat
worktree. The thread route persists that request on
`resolution.ask_user_questions`; the frontend composer switches into the
ask-user-question mode specified in
[features/ask-user-questions.md](../features/ask-user-questions.md).

The tool accepts `{"questions":[...]}` with each question carrying `id`,
`question`, optional `choices`, `allow_other`, and `required`. After calling it,
the agent stops. The user answer payload is posted back to the thread and a
follow-up agent turn receives the original request plus the user's answers.

## Chat-mode `sql_execute` (Q40 — the permission-bounded chat read)

The agent's SQL surface is the same `sql_execute` tool; the **run context's `mode`**
selects the posture (the single source of truth is
`core/agent/tools/_run_sql.build_context`):

- **`mode: "run"`** (a table run) — the context is `run_id`/`anchor`/`cohort`/
  `databases`; `sql_execute` injects the cohort onto every table and routes `cells`
  read/write. Byte-identical to before; unchanged by this slice.
- **`mode: "chat"`** — the context is `{"mode": "chat", "databases": {...}}` only:
  no run id, no anchor, no cohort. `sql_execute` routes to the chat read:
  - **SELECT only**, read-only (`PRAGMA query_only` / authorizer), local-only.
  - **No cohort injection** — a chat may answer across the **whole** registered
    database or within a named Dataset, but any Dataset filter is authored in the
    agent's SQL from the prompt's cohort SQL/criteria. Subqueries / CTEs /
    aggregates are **allowed** (`reject_nested_queries` is not applied — there is
    no injected cohort predicate to dodge, and an average / "how many" is a
    legitimate chat answer).
  - **No schema/catalog SQL** — chat must discover tables and joins through the
    `navigate` tools; `sqlite_master`, `sqlite_schema`, and other `sqlite_*`
    internals are refused.
  - **Fail-closed at the registered databases** — an unknown database name is
    refused; only the bound `databases` slugs are readable; every other bound DB is
    ATTACHed read-only by slug so one statement can join across them.
  - **No `cells`** — a chat has no worksheet; `database="cells"` is refused.

This is the looser, permission-bounded chat sibling of the run's reject-if-
unbindable cohort injection (NOT that injection — Q40). The hard ceiling is the
whole registered read-only DB; a Dataset only narrows what the agent chooses to
query. The per-user hospital-permission **intersection** (Q37) is deferred.

## The `cite_execute` evidence tool

`core/agent/tools/cite.py` (+ the `cite.ts` wrapper; opencode derives
the tool name `cite_execute`) records one evidence source in the chat worktree.
The agent does **not** pass marker numbers. The tool validates the source,
assigns the next numeric marker, appends it to `citations.json`, and returns the
assigned marker. The backend streams a `chat_citation` event at that point in
the answer stream, so the rendered marker lands at the current answer cursor.

### Request

```json
{"kind": "aggregate",
 "database": "<slug>",
 "query": "<aggregate SELECT>",
 "table_column": "<table.column>",
 "explanation": "<how the aggregate was computed>",
 "denominator": {"label": "<eligible rows>", "value": 412},
 "completeness": {"label": "<recorded rows>", "value": "389/412"},
 "covered_rows": [{"database": "<slug>", "query": "<row SELECT>", "table_column": "<table.column>"}]}
```

The source shape is the same evidence-skill source object used by cells, minus
the marker. A structured value carries `{database, query, table_column}`; a value
judged from **free text** also carries `row_id` / `row_key` / verbatim
`citations`. An aggregate claim carries `kind: "aggregate"` plus denominator,
completeness, and covered rows.

### Validation

- each citation has a non-empty `database`, `query`, `table_column`.
- each citation `database` is one of the registered chat database slugs from
  `context.json`; path-style databases are refused.
- each `query` is one **SELECT** statement and does not read SQLite
  catalog/schema tables.
- aggregate citations have non-empty `covered_rows` and carry `denominator` +
  `completeness`.

## Finishing the answer

There is no final-answer tool. The model streams visible assistant text as normal
message text and calls `cite_execute` whenever evidence should attach. On session
idle, the backend treats the streamed text plus the recorded `citations.json` as
the final chat answer. The route puts the answer on the agent message's
`content`, the citations on `resolution.citations`
([thread.schema.json](thread.schema.json) `#/$defs/citation`), and imports the chat
SQL log into the authenticated user's query attribution log.

Citation drilldown uses `POST /api/chat/evidence`, not the generic SQL endpoint.
The route accepts a reference to the persisted thread citation, re-loads that
source from the thread, re-validates the registered database slug, opens the
registered SQLite files read-only, ATTACHes sibling registered databases read-only
by slug, and runs only SELECT evidence queries.

## The backend thread-agent runtime

`core/agent/runtime.py` — the route crosses ONE seam,
`run_turn(ThreadAgentTurn, on_event=...)`, and knows nothing else. Behind it:
`worktree.materialize` stands up the thread's persistent opencode worktree under
`var/threads/<id>/opencode` — **no run, no cells** — with every registered
database symlinked in (`databases/<slug>.sqlite` + copied `model.json`), the
caller's granted Datasets/Templates projected per-id (fail-closed), and a chat
`context.json` (`mode: "chat"`); `session.ensure_thread_session` creates one
opencode session for the thread and stores its id beside the thread
(`agent-session.json`); `prompts` folds the standing instructions into a NEW
session's first turn and sends only the current turn afterwards (opencode owns
the conversation context; prior thread messages are never re-serialized);
`outputs` streams bounded chat activity plus assistant answer text deltas and
citation events, and finalizes from the streamed text plus `citations.json`.
All registered databases = the whole-DB ceiling; a per-message Dataset scope is
passed in the turn prompt, not injected by the SQL tool.
