# 0006 — Primary thread agent owns output selection

- **Status:** Accepted
- **Date:** 2026-07-04

## Context

Each thread message must become one of the v1 Outputs — an Answer or a Table —
and something has to decide which. Options considered:

- **Backend pre-routing**: faster for obvious cases, but it creates a second
  source of intent logic and makes agent behavior harder to follow.
- **Chat-only agent plus a separate table flow**: leaner for database Q&A, but
  it forces the user to choose the output mode before the agent understands the
  request.
- **Primary thread agent with a table-request tool**: keeps the user's
  interaction natural while preserving a clean boundary between intent
  selection and table-population side effects.

## Decision

The primary thread agent, not a hidden backend router, decides whether a user
message should produce an Answer or a Table. Clarification questions are not an
output; they are how the agent gathers missing input before choosing the
output. A Table request is an agent tool call that records the requested
structured output; the backend owns the side effect of pinning the Table and
starting table population. This keeps one conversational agent responsible for
understanding intent while still keeping table creation explicit, inspectable,
and server-controlled.

## Consequences

- The primary thread agent's standing instructions must stay lean: stable
  behavior belongs in the persistent thread context once, while each turn
  should send only the user's request plus explicit scope/attachment context.
  The standing instructions should not name internal product roles like
  "primary thread agent"; they should only give the thinking frame: identify
  the relevant input, choose the necessary output, and find the data.
- The standing instructions should be closer to: "Help the user understand and
  act on hospital data. For each request, decide the relevant input, the
  necessary output, and where to find the data. Inputs are usually Datasets.
  Outputs are an Answer or a Table. Clinical databases are read-only."
- The agent may propose creating or editing application resources through tools
  — Datasets as saved filters / inputs and Templates as reusable output
  structures — but it must ask the user to confirm the proposed change before
  committing it. The thread contract should keep the proposal patch opaque for
  now because the Dataset and Template editors are still moving. If the user
  accepts, the backend issues a short-lived, single-use approval token bound to
  that exact proposal. Dataset and Template write tools must reject agent
  writes without a valid token and tell the agent to ask the user for approval
  through `ask_user_question`. The token is verified server-side: an approved
  write lands through a backend path that re-checks the caller's grant and the
  token, validates the payload, and writes atomically. A check living only in
  tool code that runs in the agent's environment is UX, not the guarantee, and
  a raw filesystem write from the agent to a library artifact is never the
  write path. In v1, Templates are table templates; later they may also include
  dashboard templates. The agent may not modify clinical/source database
  records. (Patch grammar + token mechanics are owed: open-questions Q44.)
- Because the agent's Table request carries a `dataset_id` the backend acts on,
  the backend side effect re-checks the requesting USER's grants before pinning
  — the agent's choice is never itself an authorization.
- This decision does not restrict what the agent may output. It only requires
  the backend/UI-facing artifacts to have stable shapes once the agent chooses
  an output: streamed answer text with sources where needed, or a table
  request.
- Tool activity needs to be concrete enough for users to see when the agent is
  searching data, reading a Dataset or Template, querying a source database, or
  requesting a Table.
