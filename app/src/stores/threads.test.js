import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";

// Exercise the threads store actions against the in-memory mock layer (the same
// env seam isMockMode() reads). Set before importing anything that pulls api.js.
globalThis.__INTERO_MOCK_ENV = { VITE_MOCK: "true" };

const threadsStore = await import("./threads.js");
const {
  threads,
  currentThread,
  currentThreadId,
  threadsError,
  pendingNewChat,
  refreshThreads,
  openThread,
  newThread,
  startNewChat,
  sendFirstMessage,
  sendThreadMessage,
  submitQuestionAnswers,
  pendingAskUserQuestions,
  removeThread,
  renameThread,
  filterThreads,
  resetThreads,
} = threadsStore;
const { activeCommand, resultViewUiState, openCellEvidence } = await import(
  "./resultViewUi.js"
);
const { currentView } = await import("./navigation.js");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("refreshThreads loads the recency-ordered summary list", async () => {
  await refreshThreads();
  const list = get(threads);
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1);
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i - 1].updated_at >= list[i].updated_at, "newest first");
  }
});

test("openThread loads the full thread into currentThread", async () => {
  await refreshThreads();
  const id = get(threads)[0].id;
  await openThread(id);
  assert.equal(get(currentThreadId), id);
  const thread = get(currentThread);
  assert.equal(thread.id, id);
  assert.ok(Array.isArray(thread.messages));
});

test("openThread clears the pending new-chat landing so the conversation renders", async () => {
  await refreshThreads();
  const id = get(threads)[0].id;
  // Simulate sitting on the "New chat" landing, then selecting an existing chat.
  pendingNewChat.set(true);
  await openThread(id);
  assert.equal(get(pendingNewChat), false, "selecting a chat leaves the landing");
  assert.equal(get(currentThreadId), id);
});

test("openThread clears the pending landing even when the load FAILS (cleared at the start)", async () => {
  // Bug A: the landing must be left the instant a chat is selected — before the
  // load resolves — so the view never flashes the new-chat landing while
  // getThread is still awaiting. Proven via a failed load: the flag is cleared up
  // front regardless of whether the thread loads.
  pendingNewChat.set(true);
  await openThread("thread-nope");
  assert.equal(get(pendingNewChat), false, "cleared at the start, not only on success");
});

test("opening a thread clears stale citation evidence", async () => {
  await refreshThreads();
  const id = get(threads)[0].id;
  activeCommand.set({ sql: "SELECT stale", loading: false });
  openCellEvidence("A1", { state: "filled" });

  await openThread(id);

  assert.equal(get(activeCommand), null);
  const ui = get(resultViewUiState);
  assert.equal(ui.selectedCellRef, null);
  assert.equal(ui.rightPanelOpen, false);
});

test("newThread sends table-style text through the table agent", async () => {
  const thread = await newThread("Audit the discharge summaries per patient");
  assert.equal(get(currentThreadId), thread.id);
  const agent = get(currentThread).messages.find((m) => m.role === "agent");
  assert.ok(agent, "an agent resolution message was appended");
  assert.equal(agent.content, "I started that table.");
  assert.equal(agent.resolution.output, "table");
  assert.match(agent.resolution.artifact_id, /^table-/);
  assert.equal(agent.resolution.seam, null);
  assert.deepEqual(thread.artifact_ids, [agent.resolution.artifact_id]);
});

test("sendThreadMessage appends a user+agent pair to the current thread", async () => {
  const created = await newThread();
  const before = get(currentThread).messages.length;
  await sendThreadMessage("Build me a table of patients per ward");
  const msgs = get(currentThread).messages;
  assert.equal(msgs.length, before + 2);
  assert.equal(msgs[msgs.length - 2].role, "user");
  assert.equal(msgs[msgs.length - 1].role, "agent");
  assert.equal(msgs[msgs.length - 1].resolution.output, "table");
});

test("sendThreadMessage with a chat-style message yields an inline answer + citations", async () => {
  await newThread();
  await sendThreadMessage("How is the hospital doing this morning?");
  const agent = get(currentThread).messages.at(-1);
  assert.equal(agent.resolution.output, "chat");
  // Chat is built: no seam; the answer is the agent content + ≥1 inline citation.
  assert.equal(agent.resolution.seam, null);
  assert.ok(agent.content.trim().length > 0, "the answer is the agent content");
  assert.ok(agent.resolution.citations.length >= 1, "≥1 inline citation");
  assert.ok(agent.resolution.activity.length >= 1, "streamed activity is retained");
});

test("chat_citation stream events append backend-owned citations to the agent message", () => {
  currentThreadId.set("thread-stream-cite");
  currentThread.set({
    id: "thread-stream-cite",
    messages: [
      {
        role: "agent",
        content: "There were 412 births",
        resolution: { output: "chat", citations: [] },
      },
    ],
  });

  assert.equal(typeof threadsStore.applyThreadStreamEvent, "function");
  threadsStore.applyThreadStreamEvent(
    {
      type: "chat_citation",
      messageIndex: 0,
      citation: {
        marker: "1",
        database: "cord-ph",
        query: "SELECT COUNT(*) AS n FROM cord_ph_birth_records",
        table_column: "cord_ph_birth_records.patient_code",
        explanation: "count of birth records",
      },
    },
    "thread-stream-cite",
  );

  const agent = get(currentThread).messages[0];
  assert.equal(agent.resolution.citations.length, 1);
  assert.equal(agent.resolution.citations[0].marker, "1");
  assert.equal(agent.content, "There were 412 births [1]");
  assert.equal(agent.content.match(/\[1\]/g).length, 1);
});

test("thread_snapshot stream events upsert a running sidebar summary", () => {
  resetThreads();
  currentThreadId.set("thread-stream-summary");

  threadsStore.applyThreadStreamEvent(
    {
      type: "thread_snapshot",
      thread: {
        id: "thread-stream-summary",
        title: "How is the hospital",
        updated_at: "2026-06-30T10:00:00.000Z",
        messages: [
          { role: "user", content: "How is the hospital?", created_at: "2026-06-30T10:00:00.000Z" },
          { role: "agent", content: "", created_at: "2026-06-30T10:00:01.000Z" },
        ],
      },
    },
    "thread-stream-summary",
  );

  assert.deepEqual(get(threads), [
    {
      id: "thread-stream-summary",
      title: "How is the hospital",
      updated_at: "2026-06-30T10:00:00.000Z",
      message_count: 2,
      status: "running",
      opened: true,
    },
  ]);
});

test("done stream events update the sidebar summary to the final thread", () => {
  resetThreads();
  currentThreadId.set("thread-stream-summary");
  currentView.set("thread");
  threads.set([
    {
      id: "thread-stream-summary",
      title: "Draft title",
      updated_at: "2026-06-30T10:00:00.000Z",
      message_count: 2,
      status: "running",
      opened: true,
    },
  ]);

  threadsStore.applyThreadStreamEvent(
    {
      type: "done",
      thread: {
        id: "thread-stream-summary",
        title: "Final derived title",
        updated_at: "2026-06-30T10:01:00.000Z",
        messages: [
          { role: "user", content: "How is the hospital?", created_at: "2026-06-30T10:00:00.000Z" },
          { role: "agent", content: "The answer", created_at: "2026-06-30T10:01:00.000Z" },
        ],
      },
    },
    "thread-stream-summary",
  );

  assert.deepEqual(get(threads), [
    {
      id: "thread-stream-summary",
      title: "Final derived title",
      updated_at: "2026-06-30T10:01:00.000Z",
      message_count: 2,
      status: "complete",
      opened: true,
    },
  ]);
});

test("startNewChat opens a pending landing — clears the current thread and persists nothing", async () => {
  await refreshThreads();
  const before = get(threads).length;
  // Land on an existing thread first, so we can prove startNewChat clears it.
  await newThread("audit something so a thread is current");
  assert.ok(get(currentThreadId), "a thread is current before");
  activeCommand.set({ sql: "SELECT stale", loading: false });
  openCellEvidence("A1", { state: "filled" });
  const countWithNew = get(threads).length;

  startNewChat();
  assert.equal(get(currentThread), null, "no thread is open on the landing");
  assert.equal(get(currentThreadId), null);
  assert.equal(get(pendingNewChat), true, "the landing is flagged pending");
  assert.equal(get(activeCommand), null);
  assert.equal(get(resultViewUiState).selectedCellRef, null);
  // No NEW thread was persisted by opening the landing (the list only grew by
  // the one newThread above, not by startNewChat).
  await refreshThreads();
  assert.equal(get(threads).length, countWithNew, "startNewChat persisted nothing");
  assert.ok(countWithNew >= before);
});

test("sendFirstMessage mints the thread from the first message and lists it with its derived title", async () => {
  startNewChat();
  const created = await sendFirstMessage("How is the hospital doing this morning?");
  assert.ok(created?.id, "a thread was created");
  assert.equal(get(currentThreadId), created.id, "it became the current thread");
  assert.equal(get(pendingNewChat), false, "the pending landing is cleared");
  // It appears in the Chats list with a derived (non-default) title.
  const summary = get(threads).find((t) => t.id === created.id);
  assert.ok(summary, "the new thread appears in the Chats list");
  assert.ok(summary.title && summary.title.trim().length > 0, "with a derived title");
  // The first user message is in the thread.
  const user = get(currentThread).messages.find((m) => m.role === "user");
  assert.equal(user.content, "How is the hospital doing this morning?");
});

test("sendFirstMessage starts streaming before refreshing the sidebar list", async () => {
  startNewChat();
  const sending = sendFirstMessage("How is the hospital doing this morning?");
  await delay(230);

  const inFlight = get(currentThread);
  assert.ok(inFlight?.messages?.some((m) => m.role === "user"), "user message is visible while the send is still in flight");

  await sending;
});

test("sendFirstMessage keeps a watched completed thread opened after the final refresh", async () => {
  startNewChat();
  currentView.set("thread");
  const created = await sendFirstMessage("How is the hospital doing this morning?");

  const summary = get(threads).find((t) => t.id === created.id);
  assert.equal(summary.status, "complete");
  assert.equal(summary.opened, true);
});

test("sendFirstMessage leaves a completed thread unopened when the user navigated away", async () => {
  startNewChat();
  currentView.set("thread");
  const sending = sendFirstMessage("How is the hospital doing this morning?");
  await delay(80);
  currentView.set("results");
  const created = await sending;

  const summary = get(threads).find((t) => t.id === created.id);
  assert.equal(summary.status, "complete");
  assert.equal(summary.opened, false);
});

test("sendFirstMessage applies the delayed diabetes demo title to the open thread and list", async () => {
  startNewChat();
  const send = sendFirstMessage("Can you check diabetes reimbursements?");
  await delay(450);

  const id = get(currentThreadId);
  assert.ok(id, "the thread has been minted while the agent is still streaming");
  assert.equal(get(currentThread)?.title, "Remboursements diabète pedia");
  assert.equal(
    get(threads).find((thread) => thread.id === id)?.title,
    "Remboursements diabète pedia",
  );

  const created = await send;
  assert.equal(created.title, "Remboursements diabète pedia");
});

test("submitQuestionAnswers completes the pending composer question flow", async () => {
  startNewChat();
  await sendFirstMessage("needs dataset");
  const request = pendingAskUserQuestions(get(currentThread));
  assert.ok(request, "pending questions are exposed");

  await submitQuestionAnswers([
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

  assert.equal(pendingAskUserQuestions(get(currentThread)), null);
  assert.equal(
    get(currentThread).messages[1].resolution.ask_user_questions.status,
    "answered",
  );
  assert.equal(get(currentThread).messages.at(-1).role, "agent");
});

test("submitQuestionAnswers streams the follow-up agent turn while it runs", async () => {
  startNewChat();
  await sendFirstMessage("needs dataset");

  const pending = submitQuestionAnswers([
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
  await delay(45);

  const inFlight = get(currentThread);
  assert.equal(pendingAskUserQuestions(inFlight), null);
  assert.equal(inFlight.messages.at(-1).role, "agent");
  assert.ok(
    Array.isArray(inFlight.messages.at(-1).resolution.activity),
    "agent activity is visible before the final answer returns",
  );

  await pending;
});

test("sendFirstMessage preserves template attachments on the user message", async () => {
  startNewChat();
  await sendFirstMessage("Run this for me", [{ type: "template", id: "npda" }]);

  const thread = get(currentThread);
  const [user, agent] = thread.messages;
  assert.deepEqual(user.attachments, [{ type: "template", id: "npda" }]);
  assert.equal(agent.resolution.output, "chat");
  assert.equal(agent.resolution.artifact_id, null);
});

test("sendFirstMessage no-ops on blank input (nothing is persisted)", async () => {
  await refreshThreads();
  const before = get(threads).length;
  startNewChat();
  const result = await sendFirstMessage("   ");
  assert.equal(result, null, "blank input creates no thread");
  assert.equal(get(currentThreadId), null);
  assert.equal(get(pendingNewChat), true, "still on the landing");
  await refreshThreads();
  assert.equal(get(threads).length, before, "nothing persisted");
});

test("removeThread drops it from the list and clears it if current", async () => {
  const created = await newThread("audit something to delete");
  const id = created.id;
  activeCommand.set({ sql: "SELECT stale", loading: false });
  openCellEvidence("A1", { state: "filled" });
  await removeThread(id);
  assert.equal(
    get(threads).find((t) => t.id === id),
    undefined,
  );
  assert.equal(get(currentThreadId), null);
  assert.equal(get(currentThread), null);
  assert.equal(get(activeCommand), null);
  assert.equal(get(resultViewUiState).selectedCellRef, null);
});

test("renameThread updates the list entry's title", async () => {
  const created = await newThread("audit something to rename");
  const id = created.id;
  await refreshThreads();
  await renameThread(id, "A brand new title");
  assert.equal(
    get(threads).find((t) => t.id === id)?.title,
    "A brand new title",
  );
});

test("renameThread updates currentThread.title when that thread is open", async () => {
  const created = await newThread("audit open then rename");
  const id = created.id;
  await openThread(id);
  await renameThread(id, "Open thread renamed");
  assert.equal(get(currentThread)?.title, "Open thread renamed");
});

test("a failed open surfaces the error and does not throw to the caller", async () => {
  await openThread("thread-nope");
  assert.match(get(threadsError) || "", /Thread not found\./);
});

// --- #6: post-await writes are gated on the selection still matching ----------
// openThread / sendThreadMessage must not commit a now-stale result if the user
// switched threads while the request was in flight (clobber + out-of-order races).

test("openThread that resolves after the user starts a NEW chat does not clobber the landing", async () => {
  await refreshThreads();
  const id = get(threads)[0].id;
  // Kick off the open, then synchronously land on a fresh new chat BEFORE it
  // resolves (the user clicked New chat mid-load). The stale open must drop.
  const opening = openThread(id);
  startNewChat();
  await opening;
  assert.equal(get(pendingNewChat), true, "still on the new-chat landing");
  assert.equal(get(currentThread), null, "the stale open did not clobber the landing");
  assert.equal(get(currentThreadId), null);
});

test("two rapid openThread calls end on the LAST requested thread (out-of-order safe)", async () => {
  await refreshThreads();
  const list = get(threads);
  assert.ok(list.length >= 2, "need two threads");
  const a = list[0].id;
  const b = list[1].id;
  // Start A, then B before A resolves. Whatever the resolution order, the view
  // must end on B (the latest selection), not snap back to A.
  const openA = openThread(a);
  const openB = openThread(b);
  await Promise.all([openA, openB]);
  assert.equal(get(currentThreadId), b, "ends on the last requested thread");
  assert.equal(get(currentThread)?.id, b);
});

test("sendThreadMessage that resolves after a thread switch does not pull the view back", async () => {
  // Send into A, then switch to B before the post resolves. The reply must not
  // re-open A. (refreshThreads still runs; only the open-view write is gated.)
  const threadA = await newThread("Audit discharge summaries for A");
  const threadB = await newThread("Audit discharge summaries for B");
  // Land on A as the current thread, then fire a send into it.
  await openThread(threadA.id);
  const sending = sendThreadMessage("Build me another table in A");
  // User switches to B while A's post is mid-flight.
  await openThread(threadB.id);
  await sending;
  assert.equal(get(currentThreadId), threadB.id, "still on B after A's send resolved");
  assert.equal(get(currentThread)?.id, threadB.id, "the view was not pulled back to A");
});

// --- #7: resetThreads wipes thread state for the next sign-in -----------------

test("resetThreads clears the list, the open thread, the pending landing and the error", async () => {
  await refreshThreads();
  await newThread("a thread to leave resident");
  startNewChat();
  threadsError.set("stale error");
  resetThreads();
  assert.deepEqual(get(threads), [], "summary list cleared");
  assert.equal(get(currentThread), null, "open thread cleared");
  assert.equal(get(currentThreadId), null, "open thread id cleared");
  assert.equal(get(pendingNewChat), false, "pending landing flag cleared");
  assert.equal(get(threadsError), null, "error cleared");
});

test("filterThreads searches over title (case-insensitive), empty returns all", () => {
  const list = [
    { id: "1", title: "Audit discharge summaries" },
    { id: "2", title: "Admissions trend this week" },
    { id: "3", title: "Cord pH compliance" },
  ];
  assert.deepEqual(filterThreads(list, "discharge").map((t) => t.id), ["1"]);
  assert.deepEqual(filterThreads(list, "CORD").map((t) => t.id), ["3"]);
  assert.equal(filterThreads(list, "   ").length, 3);
  assert.equal(filterThreads(list, "").length, 3);
});
