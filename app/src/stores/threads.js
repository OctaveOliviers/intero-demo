// The threads store — the only conversation surface in the app (product-flows.md
// §Threads, tables & outputs). A thread is free-ranging, UNSCOPED, persisted
// server-side, and does NOT fork. This store is the thin client over the FROZEN
// threads control plane (lib/api.js): it holds the summary list + the open thread
// and exposes action functions that call the API and fold the result back in.
//
// State is server-backed, NOT localStorage: every action returns the full thread
// (or summary list) the server computed — including the agent's per-message
// resolution (output = table | chat) — and we simply mirror it. There is no second
// copy to keep in sync.
import { writable, get } from "svelte/store";
import {
  listThreads,
  getThread,
  createThread,
  postThreadMessageStream,
  postThreadQuestionAnswersStream,
  renameThread as apiRenameThread,
  deleteThread,
  markThreadOpened,
} from "../lib/api.js";
import { activeCommand, clearCellEvidenceSelection, closePanel } from "./resultViewUi.js";
import { currentView } from "./navigation.js";

// The recency-ordered summary list:
// [{ id, title, updated_at, message_count, status, opened }].
export const threads = writable([]);
// The full open thread (or null), and its id for cheap selection checks.
export const currentThread = writable(null);
export const currentThreadId = writable(null);
// True while a fresh chat is open but no thread has been persisted yet — the
// "pending new chat" landing. Pressing "New chat" (and first sign-in) set this
// and clear the open thread, so the centered composer shows with NOTHING in the
// Chats list; the thread is minted only when the first message is sent
// (sendFirstMessage), which clears this flag.
export const pendingNewChat = writable(false);
// Transient UI flags. `threadsLoading` covers the open/refresh round-trip;
// `sending` is the in-flight guard for a message send (disables the composer).
export const threadsLoading = writable(false);
export const sending = writable(false);
export const threadsError = writable(null);

export function pendingAskUserQuestions(thread) {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const request = messages[i]?.resolution?.ask_user_questions;
    if (request?.status === "pending" && Array.isArray(request.questions)) {
      return { ...request, messageIndex: i };
    }
  }
  return null;
}

function messageFromError(err, fallback) {
  return (err && err.message) || fallback;
}

function normalizeAttachments(attachments) {
  const normalized = [];
  const seen = new Set();
  for (const item of attachments || []) {
    const type = String(item?.type || "");
    const id = String(item?.id || "").trim();
    if (!["dataset", "template"].includes(type) || !id || seen.has(type)) continue;
    seen.add(type);
    normalized.push({ type, id });
  }
  return normalized;
}

function clearEvidencePanel() {
  activeCommand.set(null);
  clearCellEvidenceSelection();
  closePanel();
}

// The thread the user most recently asked to make current — the intent token a
// post-await write checks before committing, so a result that resolves after the
// user has switched threads is dropped rather than clobbering the new selection.
// Bumped by openThread (an explicit selection) and startNewChat/removeThread
// (which deselect). sendThreadMessage reads it too: a send that resolves after a
// switch must not pull the view back to the old thread. Out-of-order resolves are
// covered because only the LATEST request matches this token.
let activeSelectionId = null;
const pendingOpened = new Set();

// If a thread's LAST (agent) message produced a table, refresh the Tables section
// so the new table's card surfaces (with its running dot while it builds). Shared
// by sendFirstMessage and sendThreadMessage so the two can't drift. Dynamically
// imported to keep this store off the tables↔chat↔navigation import cycle.
async function refreshTablesIfMessageSpawnedOne(thread) {
  const last = thread?.messages?.[thread.messages.length - 1];
  if (last?.resolution?.artifact_id) {
    const { refreshTables } = await import("./tables.js");
    await refreshTables();
  }
}

function isThreadVisible(id) {
  return get(currentThreadId) === id && get(currentView) === "thread";
}

function summaryFromThread(thread, fallbackStatus) {
  return {
    id: thread.id,
    title: thread.title,
    updated_at: thread.updated_at,
    message_count: Array.isArray(thread.messages) ? thread.messages.length : 0,
    status: thread.status || fallbackStatus,
    opened: thread.opened ?? (fallbackStatus === "running" || isThreadVisible(thread.id)),
  };
}

function upsertThreadSummary(summary) {
  if (!summary?.id) return;
  threads.update((list) => {
    const next = (list || []).filter((item) => item.id !== summary.id);
    next.push(summary);
    return next.sort((a, b) =>
      a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0,
    );
  });
}

function markOpenedIfVisible(id) {
  if (!isThreadVisible(id)) return;
  pendingOpened.add(id);
  threads.update((list) =>
    (list || []).map((thread) =>
      thread.id === id ? { ...thread, opened: true } : thread,
    ),
  );
  void markThreadOpened(id)
    .catch(() => {})
    .finally(() => pendingOpened.delete(id));
}

export function applyThreadStreamEvent(event, targetThreadId) {
  if (!event || get(currentThreadId) !== targetThreadId) return;
  if (event.type === "thread_snapshot" && event.thread) {
    currentThread.set(event.thread);
    upsertThreadSummary(summaryFromThread(event.thread, "running"));
    return;
  }
  if (event.type === "chat_delta") {
    currentThread.update((thread) => {
      if (!thread || thread.id !== targetThreadId) return thread;
      const index = Number(event.messageIndex);
      if (!Number.isInteger(index) || !thread.messages?.[index]) return thread;
      return {
        ...thread,
        messages: thread.messages.map((message, i) =>
          i === index ? { ...message, content: event.content || "" } : message,
        ),
      };
    });
    return;
  }
  if (event.type === "chat_activity") {
    currentThread.update((thread) => {
      if (!thread || thread.id !== targetThreadId) return thread;
      const index = Number(event.messageIndex);
      if (!Number.isInteger(index) || !thread.messages?.[index]) return thread;
      return {
        ...thread,
        messages: thread.messages.map((message, i) =>
          i === index
            ? {
                ...message,
                resolution: {
                  ...(message.resolution || {}),
                  activity: upsertActivity(
                    message.resolution?.activity,
                    event.activity,
                  ),
                },
              }
            : message,
        ),
      };
    });
    return;
  }
  if (event.type === "chat_citation") {
    currentThread.update((thread) => {
      if (!thread || thread.id !== targetThreadId) return thread;
      const index = Number(event.messageIndex);
      if (!Number.isInteger(index) || !thread.messages?.[index]) return thread;
      return {
        ...thread,
        messages: thread.messages.map((message, i) =>
          i === index
            ? {
                ...message,
                content: appendCitationMarker(message.content, event.citation),
                resolution: {
                  ...(message.resolution || {}),
                  citations: upsertCitation(
                    message.resolution?.citations,
                    event.citation,
                  ),
                },
              }
            : message,
        ),
      };
    });
    return;
  }
  if (event.type === "thread_title" && event.threadId === targetThreadId) {
    const nextTitle = String(event.title || "").trim();
    if (!nextTitle) return;
    const updatedAt = event.updated_at || new Date().toISOString();
    currentThread.update((thread) =>
      thread && thread.id === targetThreadId
        ? { ...thread, title: nextTitle, updated_at: updatedAt }
        : thread,
    );
    threads.update((list) =>
      (list || []).map((thread) =>
        thread.id === targetThreadId
          ? { ...thread, title: nextTitle, updated_at: updatedAt }
          : thread,
      ).sort((a, b) =>
        a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0,
      ),
    );
    return;
  }
  if (event.type === "done" && event.thread) {
    currentThread.set(event.thread);
    upsertThreadSummary(summaryFromThread(event.thread, "complete"));
  }
}

function appendCitationMarker(content, citation) {
  const text = String(content || "");
  const marker = String(citation?.marker || "").trim();
  if (!marker) return text;
  const token = `[${marker}]`;
  if (text.includes(token)) return text;
  const stripped = text.replace(/[ \t]+$/, "");
  if (!stripped) return text;
  return `${stripped} ${token}`;
}

function upsertCitation(citationList, citation) {
  if (!citation || typeof citation !== "object") return citationList || [];
  const list = Array.isArray(citationList) ? citationList : [];
  const marker = String(citation.marker || "");
  if (!marker) return [...list, citation];
  const index = list.findIndex((item) => String(item?.marker || "") === marker);
  if (index === -1) return [...list, citation];
  return list.map((item, i) => (i === index ? citation : item));
}

function upsertActivity(activityList, activity) {
  if (!activity || typeof activity !== "object") return activityList || [];
  const list = Array.isArray(activityList) ? activityList : [];
  if (!activity.id) return [...list, activity];
  const index = list.findIndex((item) => item?.id === activity.id);
  if (index === -1) return [...list, activity];
  return list.map((item, i) => (i === index ? activity : item));
}

// Reload the summary list (recency-ordered server-side). On failure the list is
// left as-is and the error is surfaced — a refresh never blanks the sidebar.
export async function refreshThreads() {
  threadsError.set(null);
  try {
    const list = await listThreads();
    const next = Array.isArray(list) ? list : [];
    threads.set(
      pendingOpened.size === 0
        ? next
        : next.map((thread) =>
            pendingOpened.has(thread.id) ? { ...thread, opened: true } : thread,
          ),
    );
  } catch (err) {
    threadsError.set(messageFromError(err, "Failed to load threads"));
  }
}

// Open a thread by id: load the full thread and make it current. A failed load
// surfaces the error and leaves the previous selection untouched.
export async function openThread(id) {
  if (!id) return;
  // Record this as the intended selection BEFORE the await. If the user switches
  // to another thread (or a new chat) while getThread is in flight, that bumps
  // the token and this stale result is dropped — covering both the clobber race
  // (a slow open landing over a newer selection) and the out-of-order race (an
  // earlier request resolving after a later one).
  activeSelectionId = id;
  clearEvidencePanel();
  threadsLoading.set(true);
  threadsError.set(null);
  // Leave the "pending new chat" landing the instant a chat is selected — BEFORE
  // the load resolves — so the view never flashes the centered new-chat composer
  // while getThread is still awaiting (ThreadView's isLanding reads this flag).
  pendingNewChat.set(false);
  try {
    const thread = await getThread(id);
    // Only commit if this is still the thread the user wants open.
    if (activeSelectionId !== id) return;
    currentThread.set(thread);
    currentThreadId.set(thread.id);
    threads.update((list) =>
      (list || []).map((item) =>
        item.id === id ? { ...item, opened: true } : item,
      ),
    );
  } catch (err) {
    // Don't surface a stale error over a thread the user has since moved off.
    if (activeSelectionId === id) threadsError.set(messageFromError(err, "Failed to load thread"));
  } finally {
    // Only the latest in-flight open owns the loading flag; an older resolve must
    // not flip it off while a newer open is still pending.
    if (activeSelectionId === id) threadsLoading.set(false);
  }
}

// Start a fresh thread, optionally routing an opening message. The created thread
// (with its first user+agent exchange when a message was given) becomes current
// and the summary list is refreshed so it appears in the sidebar. Returns the
// created thread so callers can navigate to it.
export async function newThread(message, attachments = [], options = {}) {
  threadsLoading.set(true);
  threadsError.set(null);
  try {
    const normalizedAttachments = normalizeAttachments(attachments);
    const body = message
      ? { message, attachments: normalizedAttachments }
      : {};
    const thread = await createThread(body);
    currentThread.set(thread);
    currentThreadId.set(thread.id);
    // The minted thread is now the active selection — so a stale open/send for a
    // previous thread that resolves later is dropped rather than clobbering it.
    activeSelectionId = thread.id;
    if (options.refreshList !== false) await refreshThreads();
    return thread;
  } catch (err) {
    threadsError.set(messageFromError(err, "Could not start a thread"));
    return null;
  } finally {
    threadsLoading.set(false);
  }
}

// Open a fresh "new chat" LANDING without persisting anything: clear the open
// thread and flag the pending state so the centered composer renders with NO row
// in the Chats list. The thread is minted only when the first message is sent
// (sendFirstMessage). Pressing "New chat" again, or from inside a thread, just
// returns to this clean landing.
export function startNewChat() {
  // Deselect: a new-chat landing is its own intent, so any in-flight open/send
  // for a previous thread is now stale and must not write back over this landing.
  activeSelectionId = null;
  clearEvidencePanel();
  currentThread.set(null);
  currentThreadId.set(null);
  threadsError.set(null);
  pendingNewChat.set(true);
}

// Send the FIRST message of a pending new chat: mint an empty thread, then use the
// streaming message endpoint so first-message chats render the same inline
// activity/deltas as later messages. The backend derives the title from the first
// user message when that stream appends it. No-op on blank input or while a send
// is in flight.
// Returns the created thread (or null).
export async function sendFirstMessage(content, attachments = []) {
  const text = String(content || "").trim();
  if (!text || get(sending)) return null;
  const normalizedAttachments = normalizeAttachments(attachments);
  sending.set(true);
  try {
    const created = await newThread(null, [], { refreshList: false });
    if (!created) return null;
    pendingNewChat.set(false);
    const id = created.id;
    const thread = await postThreadMessageStream(
      id,
      text,
      (event) => applyThreadStreamEvent(event, id),
      normalizedAttachments,
    );
    if (activeSelectionId === id && get(currentThreadId) === id) {
      currentThread.set(thread);
    }
    markOpenedIfVisible(id);
    await refreshThreads();
    pendingNewChat.set(false);
    await refreshTablesIfMessageSpawnedOne(thread);
    return thread;
  } catch (err) {
    threadsError.set(messageFromError(err, "Send failed"));
    return null;
  } finally {
    sending.set(false);
  }
}

// Send a message into the current thread. The server appends the user message and
// the agent resolution message and returns the full thread; we mirror it and
// refresh the list so the thread's recency/preview updates. No-op with no current
// thread or while a send is already in flight.
export async function sendThreadMessage(content, attachments = []) {
  const id = get(currentThreadId);
  const text = String(content || "").trim();
  if (!id || !text || get(sending)) return;
  const normalizedAttachments = normalizeAttachments(attachments);
  // The thread this send targets. If the user switches threads while the post is
  // in flight, the reply must NOT pull the view back to this (now background)
  // thread — so the post-await write is gated on the selection still matching.
  activeSelectionId = id;
  sending.set(true);
  threadsError.set(null);
  try {
    const thread = await postThreadMessageStream(
      id,
      text,
      (event) => applyThreadStreamEvent(event, id),
      normalizedAttachments,
    );
    // Still refresh the list (recency/preview) regardless, but only fold the
    // returned thread into the open view if the user hasn't moved on.
    if (activeSelectionId === id && get(currentThreadId) === id) {
      currentThread.set(thread);
    }
    markOpenedIfVisible(id);
    await refreshThreads();
    await refreshTablesIfMessageSpawnedOne(thread);
  } catch (err) {
    // Don't surface this thread's send error over a thread the user switched to.
    if (get(currentThreadId) === id) threadsError.set(messageFromError(err, "Could not send your message"));
  } finally {
    sending.set(false);
  }
}

export async function submitQuestionAnswers(answers) {
  const id = get(currentThreadId);
  if (!id || get(sending)) return null;
  activeSelectionId = id;
  sending.set(true);
  threadsError.set(null);
  try {
    const thread = await postThreadQuestionAnswersStream(id, answers, (event) =>
      applyThreadStreamEvent(event, id),
    );
    if (activeSelectionId === id && get(currentThreadId) === id) {
      currentThread.set(thread);
    }
    markOpenedIfVisible(id);
    await refreshThreads();
    await refreshTablesIfMessageSpawnedOne(thread);
    return thread;
  } catch (err) {
    if (get(currentThreadId) === id) {
      threadsError.set(messageFromError(err, "Could not submit answers"));
    }
    return null;
  } finally {
    sending.set(false);
  }
}

// Logout-scoped wipe: drop the summary list, the open thread, the pending
// landing, the error, and the selection token so the next user signing in on the
// same tab starts clean (no previous user's thread resident, no stale post-await
// write committing into the new session). Mirrors populatedTables.resetPopulatedTableHistory.
export function resetThreads() {
  activeSelectionId = null;
  pendingOpened.clear();
  threads.set([]);
  currentThread.set(null);
  currentThreadId.set(null);
  pendingNewChat.set(false);
  threadsError.set(null);
}

// Pure search over the thread summaries (tested directly) — matches `title`
// case-insensitively; an empty/blank query returns all. The summary list is
// already recency-ordered server-side, so this preserves input order.
export function filterThreads(list, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return list || [];
  return (list || []).filter((t) => (t.title || "").toLowerCase().includes(q));
}

// Rename a thread server-side (title only), then mirror the new title into the
// summary list entry and — if that thread is the open one — into currentThread.
export async function renameThread(id, title) {
  if (!id) return;
  const next = String(title || "").trim();
  if (!next) return;
  try {
    await apiRenameThread(id, next);
    threads.update((list) => list.map((t) => (t.id === id ? { ...t, title: next } : t)));
    if (get(currentThreadId) === id) {
      currentThread.update((t) => (t ? { ...t, title: next } : t));
    }
  } catch (err) {
    threadsError.set(messageFromError(err, "Rename failed"));
  }
}

// Delete a thread server-side, drop it from the list, and clear the open thread
// if it was the one removed.
export async function removeThread(id) {
  if (!id) return;
  try {
    await deleteThread(id);
    threads.update((list) => list.filter((t) => t.id !== id));
    if (get(currentThreadId) === id) {
      activeSelectionId = null;
      clearEvidencePanel();
      currentThread.set(null);
      currentThreadId.set(null);
    }
  } catch (err) {
    threadsError.set(messageFromError(err, "Delete failed"));
  }
}
