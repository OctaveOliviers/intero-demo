import test from "node:test";
import assert from "node:assert/strict";

// Drive the api.js threads functions through the in-memory mock layer by forcing
// mock mode (the same env seam isMockMode() reads). Set before importing api.js.
// These tests pin the FROZEN backend contract the mock must mirror EXACTLY
// (core/threads/store.py + server/routes/threads.py): the full thread shape,
// title derivation, chat answers, and ask_user_question answer flow.
globalThis.__INTERO_MOCK_ENV = { VITE_MOCK: "true" };

const api = await import("./api.js");

test("listThreads returns recency-ordered summaries (newest first)", async () => {
  const list = await api.listThreads();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1, "at least the seeded threads are present");
  for (const s of list) {
    assert.equal(typeof s.id, "string");
    assert.equal(typeof s.title, "string");
    assert.equal(typeof s.updated_at, "string");
    assert.equal(typeof s.message_count, "number");
    assert.ok(["running", "complete"].includes(s.status));
    assert.equal(typeof s.opened, "boolean");
  }
  // Recency order: updated_at DESC.
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i - 1].updated_at >= list[i].updated_at, "newest first");
  }
});

test("getThread returns the full frozen thread shape", async () => {
  const list = await api.listThreads();
  const thread = await api.getThread(list[0].id);
  assert.equal(thread.schema_version, "1");
  assert.match(thread.id, /^thread-/);
  assert.equal(typeof thread.title, "string");
  assert.equal(typeof thread.created_at, "string");
  assert.equal(typeof thread.updated_at, "string");
  assert.ok(Array.isArray(thread.messages));
  assert.ok(Array.isArray(thread.artifact_ids));
});

test("getThread throws the contract 404 detail for a missing thread", async () => {
  await assert.rejects(() => api.getThread("thread-does-not-exist"), /Thread not found\./);
});

test("createThread mints an empty thread when no message is given", async () => {
  const thread = await api.createThread({});
  assert.equal(thread.schema_version, "1");
  assert.match(thread.id, /^thread-/);
  assert.equal(thread.title, "New thread");
  assert.deepEqual(thread.messages, []);
  assert.deepEqual(thread.artifact_ids, []);
});

test("createThread with a table-style message returns output=table", async () => {
  const thread = await api.createThread({ message: "Build me a table per patient" });
  assert.equal(thread.title, "Build me a table per patient");
  assert.equal(thread.messages.length, 2);
  const [user, agent] = thread.messages;
  assert.equal(user.role, "user");
  assert.equal(user.content, "Build me a table per patient");
  assert.equal(agent.role, "agent");
  assert.equal(agent.content, "I started that table.");
  assert.equal(agent.resolution.output, "table");
  assert.equal(agent.resolution.scope.kind, "whole_db");
  assert.equal(agent.resolution.scope.dataset_id, null);
  assert.match(agent.resolution.artifact_id, /^table-/);
  assert.equal(agent.resolution.seam, null);
  assert.deepEqual(thread.artifact_ids, [agent.resolution.artifact_id]);
});

test("createThread preserves request attachments on the user message", async () => {
  const thread = await api.createThread({
    message: "Run this for me",
    attachments: [{ type: "template", id: "npda" }],
  });
  const [user, agent] = thread.messages;
  assert.deepEqual(user.attachments, [{ type: "template", id: "npda" }]);
  assert.equal(agent.resolution.output, "chat");
  assert.equal(agent.resolution.artifact_id, null);
  assert.equal(agent.resolution.seam, null);
});

test("postThreadMessage with a chat-style message answers inline with citations", async () => {
  const created = await api.createThread({});
  const updated = await api.postThreadMessage(created.id, "How is the ward doing today?");
  assert.equal(updated.messages.length, 2);
  const agent = updated.messages[1];
  assert.equal(agent.role, "agent");
  assert.equal(agent.resolution.output, "chat");
  // Chat is BUILT: no seam, no table; the answer is the agent content and its
  // inline sources ride on resolution.citations (≥1 — the evidence-skill bar).
  assert.equal(agent.resolution.seam, null);
  assert.equal(agent.resolution.artifact_id, null);
  assert.ok(agent.content.trim().length > 0, "the answer is the agent content");
  assert.ok(Array.isArray(agent.resolution.citations));
  assert.ok(agent.resolution.citations.length >= 1, "≥1 inline citation");
  const [citation] = agent.resolution.citations;
  assert.equal(typeof citation.marker, "string");
  assert.equal(typeof citation.database, "string");
  assert.equal(typeof citation.query, "string");
  assert.equal(typeof citation.table_column, "string");
});

test("postThreadMessageStream emits chat deltas before the final thread", async () => {
  const created = await api.createThread({});
  const events = [];
  const final = await api.postThreadMessageStream(
    created.id,
    "How is the ward doing today?",
    (event) => events.push(event),
  );
  assert.equal(final.messages.at(-1).resolution.output, "chat");
  assert.ok(events.some((event) => event.type === "chat_activity"), "activity streams");
  const deltas = events.filter((event) => event.type === "chat_delta");
  assert.ok(deltas.length >= 4, "chat answer streams in small increments");
  assert.equal(deltas.at(-1).content, final.messages.at(-1).content);
  assert.ok(
    events.some(
      (event) => event.type === "chat_citation" && event.citation?.marker === "1",
    ),
    "citation events stream with backend-owned markers",
  );
  assert.equal(events.at(-1).type, "done");
});

test("postThreadQuestionAnswers completes a pending ask_user_question request", async () => {
  const created = await api.createThread({});
  const asked = await api.postThreadMessage(created.id, "needs dataset");
  const request = asked.messages.at(-1).resolution.ask_user_questions;
  assert.equal(request.status, "pending");
  assert.equal(request.questions.length, 2);

  const answered = await api.postThreadQuestionAnswers(created.id, [
    {
      question_id: "dataset_scope",
      status: "answered",
      choice_id: "whole_db",
      text: null,
    },
    {
      question_id: "answer_format",
      status: "skipped",
      choice_id: null,
      text: null,
    },
  ]);
  assert.equal(
    answered.messages[1].resolution.ask_user_questions.status,
    "answered",
  );
  assert.equal(answered.messages.at(-1).role, "agent");
  assert.equal(answered.messages.at(-1).resolution.output, "chat");
});

test("postThreadQuestionAnswersStream emits the follow-up agent activity", async () => {
  const created = await api.createThread({});
  const asked = await api.postThreadMessage(created.id, "needs dataset");
  assert.equal(asked.messages.at(-1).resolution.ask_user_questions.status, "pending");

  const events = [];
  const answered = await api.postThreadQuestionAnswersStream(
    created.id,
    [
      {
        question_id: "dataset_scope",
        status: "answered",
        choice_id: "whole_db",
        text: null,
      },
      {
        question_id: "answer_format",
        status: "skipped",
        choice_id: null,
        text: null,
      },
    ],
    (event) => events.push(event),
  );

  assert.equal(events[0].type, "thread_snapshot");
  assert.ok(events.some((event) => event.type === "chat_activity"), "activity streams");
  assert.ok(events.some((event) => event.type === "chat_delta"), "answer deltas stream");
  assert.equal(events.at(-1).type, "done");
  assert.equal(answered.messages[1].resolution.ask_user_questions.status, "answered");
  assert.equal(answered.messages.at(-1).role, "agent");
});

test("diabetes operational question suggests a traceable patient list", async () => {
  const created = await api.createThread({});
  const asked = await api.postThreadMessage(
    created.id,
    "Which paediatric diabetes patients are putting our next reporting deadline or BPT performance at risk?",
  );

  const agent = asked.messages.at(-1);
  assert.equal(agent.role, "agent");
  assert.equal(agent.resolution.output, "chat");
  assert.match(agent.content, /\[12\]\{1\} paediatric diabetes patients are in scope/i);
  assert.match(agent.content, /7\/12 need action/i);
  assert.match(agent.content, /\[5\]\{2\} have HbA1c at 70 mmol\/mol or above/i);
  assert.match(agent.content, /\[2\]\{3\} are missing urinary ACR evidence/i);
  assert.match(agent.content, /---/);
  assert.match(agent.content, /\*\*High HbA1c - intervention evidence needed\*\*/i);
  assert.match(agent.content, /• Issue: these patients are above the HbA1c threshold/i);
  assert.match(agent.content, /Patients: NPD002 HbA1c \[74\.0 mmol\/mol\]\{4\}/i);
  assert.match(agent.content, /\*\*Missing urinary ACR evidence - care-process gap\*\*/i);
  assert.match(agent.content, /Patients: NPD007 - \[no urinary ACR result\]\{10\}; NPD010 - \[no urinary ACR result\]\{12\}/i);
  const request = agent.resolution.ask_user_questions;
  assert.equal(request.status, "pending");
  assert.equal(request.id, "ask-diabetes-worklist");
  assert.deepEqual(
    request.questions[0].choices.map((choice) => choice.id),
    ["create_table", "keep_list"],
  );
  assert.ok(agent.resolution.citations.length >= 10, "chat values carry source references");
  assert.deepEqual(asked.artifact_ids, []);
});

test("any concise diabetes prompt triggers the diabetes demo workflow", async () => {
  for (const prompt of [
    "diabetes",
    "Can you check diabetes reimbursements?",
    "Comment va le remboursement diabète pédiatrique ?",
  ]) {
    const created = await api.createThread({});
    const asked = await api.postThreadMessage(created.id, prompt);

    const agent = asked.messages.at(-1);
    assert.equal(agent.role, "agent");
    assert.equal(agent.resolution.output, "chat");
    assert.match(agent.content, /\[12\]\{1\} paediatric diabetes patients are in scope/i);
    assert.equal(agent.resolution.ask_user_questions.id, "ask-diabetes-worklist");
  }
});

test("streamed diabetes demo keeps the new-thread title before the delayed demo title", async () => {
  const created = await api.createThread({});
  const events = [];
  const final = await api.postThreadMessageStream(
    created.id,
    "Can you check diabetes reimbursements?",
    (event) => events.push(event),
  );

  const firstSnapshot = events.find((event) => event.type === "thread_snapshot");
  const titleEvent = events.find((event) => event.type === "thread_title");
  assert.equal(firstSnapshot.thread.title, "New thread");
  assert.equal(titleEvent.title, "Remboursements diabète pedia");
  assert.equal(final.title, "Remboursements diabète pedia");
});

test("diabetes chat answer includes source references for surfaced values", async () => {
  const created = await api.createThread({});
  const asked = await api.postThreadMessage(created.id, "diabetes");

  const agent = asked.messages.at(-1);
  assert.equal(agent.role, "agent");
  assert.equal(agent.resolution.output, "chat");
  assert.match(agent.content, /NPD002 HbA1c \[74\.0 mmol\/mol\]\{4\}/i);
  assert.doesNotMatch(agent.content, /\[NPD002 HbA1c 74\.0 mmol\/mol\]\{4\}/i);
  assert.match(agent.content, /Patients: NPD007 - \[no urinary ACR result\]\{10\}; NPD010 - \[no urinary ACR result\]\{12\}/i);
  assert.match(agent.content, /\[DKA at new diagnosis\]\{6\}/i);
  assert.ok(
    agent.resolution.citations.some(
      (citation) =>
        citation.marker === "4" &&
        citation.query.includes("Hba1c") &&
        citation.query.includes("NPD002"),
    ),
    "NPD002 HbA1c is backed by a database citation",
  );
  assert.ok(
    agent.resolution.citations.some(
      (citation) =>
        citation.marker === "10" &&
        citation.query.includes("Urinary_ACR") &&
        citation.query.includes("NPD007"),
    ),
    "NPD007 missing ACR is backed by a database citation",
  );
  assert.ok(
    agent.resolution.citations.some(
      (citation) =>
        citation.marker === "6" &&
        citation.query.includes("clinical_notes") &&
        citation.citations?.includes("diabetic ketoacidosis (DKA) at the time of new diagnosis"),
    ),
    "NPD003 DKA evidence is backed by a highlighted clinical note citation",
  );
});

test("answering the diabetes table question creates a focused source-value table", async () => {
  const created = await api.createThread({});
  const asked = await api.postThreadMessage(
    created.id,
    "Which paediatric diabetes patients are putting our next reporting deadline or BPT performance at risk?",
  );

  const answered = await api.postThreadQuestionAnswers(asked.id, [
    {
      question_id: "create_diabetes_worklist",
      status: "answered",
      choice_id: "create_table",
      text: null,
    },
  ]);

  const userAnswer = answered.messages.at(-2);
  assert.equal(userAnswer.role, "user");
  assert.match(
    userAnswer.content,
    /Create a table for the diabetes audit lead that tracks source data\? Create table/i,
  );
  assert.doesNotMatch(userAnswer.content, /create_diabetes_worklist|create_table/);

  const agent = answered.messages.at(-1);
  assert.equal(agent.role, "agent");
  assert.equal(agent.resolution.output, "table");
  assert.match(agent.content, /building the diabetes BPT risk worklist/i);
  assert.match(agent.resolution.artifact_id, /^table-/);
  assert.deepEqual(answered.artifact_ids, [agent.resolution.artifact_id]);

  const table = await api.getTable(agent.resolution.artifact_id);
  assert.equal(table.title, "Diabetes BPT evidence worklist");
  assert.equal(table.source_template, "diabetes-worklist");
  assert.equal(table.thread_id, asked.id);
  assert.ok(table.table_population_id, "the table wraps a live population");
  assert.deepEqual(
    table.spec.columns.map((column) => column.name),
    [
      "Patient",
      "Latest HbA1c",
      "HbA1c recorded date / clinic visit date",
      "Glucose-management intervention evidence",
      "Urinary ACR result",
      "Urinary ACR recorded date",
      "DKA / admission evidence",
      "Last diabetes review",
    ],
  );

  const workbook = await api.getTablePopulationWorkbook(table.table_population_id);
  assert.equal(workbook.sheets[0].name, "Diabetes worklist");
  assert.deepEqual(workbook.sheets[0].data[0], table.spec.columns.map((column) => column.name));
  assert.equal(workbook.sheets[0].data.length, 8, "header plus 7 action-needed patient rows");
  assert.equal(workbook.sheets[0].data[1][1], "74.0", "the table contains source values, not derived reasons");
  assert.equal(workbook.sheets[0].data[5][4], "", "missing source values remain visibly blank");
  assert.ok(workbook.cellMetadata["Diabetes worklist!B2"], "HbA1c cells are traceable");
  assert.ok(workbook.cellMetadata["Diabetes worklist!G3"], "note-derived admission cells are traceable");
});

test("diabetes initial answer streams multiple credible activity steps", async () => {
  const created = await api.createThread({});
  const events = [];
  const asked = await api.postThreadMessageStream(
    created.id,
    "diabetes",
    (event) => events.push(event),
  );
  const activities = events
    .filter((event) => event.type === "chat_activity")
    .map((event) => event.activity);
  const firstDeltaIndex = events.findIndex((event) => event.type === "chat_delta");
  const lastActivityIndex = events
    .map((event, index) => (event.type === "chat_activity" ? index : -1))
    .filter((index) => index >= 0)
    .at(-1);
  const streamingAgent = events[0].thread.messages.at(-1);

  assert.equal(events[0].type, "thread_snapshot");
  assert.equal(streamingAgent.content, "");
  assert.equal(
    streamingAgent.resolution.ask_user_questions,
    undefined,
    "the composer should stay in normal mode while the agent is still thinking",
  );
  assert.deepEqual(
    activities.map((activity) => activity.label),
    [
      "Reviewing BPT requirements",
      "Inspecting diabetes cohort",
      "Mapping required evidence",
      "Querying patient evidence",
      "Checking admission notes",
      "Assessing BPT gap",
    ],
  );
  assert.ok(
    lastActivityIndex < firstDeltaIndex,
    "the answer should stream after the activity prelude",
  );
  assert.deepEqual(
    asked.messages.at(-1).resolution.activity.map((activity) => activity.label),
    activities.map((activity) => activity.label),
  );
  assert.equal(asked.messages.at(-1).resolution.ask_user_questions.status, "pending");
});

test("diabetes table answer stream uses step-specific activity labels", async () => {
  const created = await api.createThread({});
  const asked = await api.postThreadMessage(created.id, "diabetes");

  const tableEvents = [];
  await api.postThreadQuestionAnswersStream(
    asked.id,
    [
      {
        question_id: "create_diabetes_worklist",
        status: "answered",
        choice_id: "create_table",
        text: null,
      },
    ],
    (event) => tableEvents.push(event),
  );
  const activities = tableEvents
    .filter((event) => event.type === "chat_activity")
    .map((event) => event.activity);
  const firstDeltaIndex = tableEvents.findIndex((event) => event.type === "chat_delta");
  const lastActivityIndex = tableEvents
    .map((event, index) => (event.type === "chat_activity" ? index : -1))
    .filter((index) => index >= 0)
    .at(-1);
  assert.deepEqual(
    activities.map((activity) => activity.label),
    [
      "Preparing source-backed table",
      "Resolving evidence columns",
      "Starting table population",
    ],
  );
  assert.ok(
    lastActivityIndex < firstDeltaIndex,
    "the table message should stream after table setup activity",
  );
});

test("renameThread updates and persists the title", async () => {
  const created = await api.createThread({ message: "audit something to rename" });
  const renamed = await api.renameThread(created.id, "Contract renamed chat");
  assert.equal(renamed.title, "Contract renamed chat");
  // Persisted: a fresh read returns the new title (mock mirrors the PATCH route).
  const reloaded = await api.getThread(created.id);
  assert.equal(reloaded.title, "Contract renamed chat");
});

test("deleteThread removes the thread from the list", async () => {
  const created = await api.createThread({ message: "audit something" });
  await api.deleteThread(created.id);
  await assert.rejects(() => api.getThread(created.id), /Thread not found\./);
});
