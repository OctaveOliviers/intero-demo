// Run streaming + the LIVE VIEWS of the selected audit.
//
// Since the single-run-store refactor (T3): the per-audit record in
// audits.js is the ONLY owned run state. The stores components read here
// (messages / activity / activeWorkbook / reviewSummary / runStatus) are
// DERIVED from (audits, currentAuditId, activeStream) — switching audits is
// just a pointer move, the stream sink writes once through the audits.js
// mutators, and persistence is audits.js's localStorage subscriber. The old
// dual-write (transient stores + per-audit copies + mirror layer) is gone.
import { writable, derived, get } from "svelte/store";
import * as XLSX from "xlsx";
import {
  getWorkbook as apiGetWorkbook,
  downloadWorkbookExport as apiDownloadWorkbookExport,
  executeSql,
  stopRun as apiStopRun,
  createRunFromDescription,
  refreshRun as apiRefreshRun,
} from "../lib/api.js";
import { handleRefreshConflict } from "../lib/refreshConflict.js";
import { isMockMode, mockStartRunStream } from "../lib/mock.js";
import {
  audits,
  currentAuditId,
  activeStream,
  syncAuditActivity,
  syncAuditMessages,
  syncAuditReviewSummary,
  syncAuditWorkbook,
  setAuditRefreshState,
  setAuditStatus,
  setAuditRunTiming,
  startAudit,
  setAuditRunId,
} from "./audits.js";
import { goToResults } from "./navigation.js";
import {
  closePanel as closeResultViewPanel,
  activeCommand,
} from "./resultViewUi.js";
import { applyRunEvent, terminalStatusForEventType } from "./runStreamHandlers.js";
import { parseRunSsePayload, runEventDiscriminator } from "./runSseContract.js";

// Re-exported for existing readers (the command itself is result-view UI
// state and lives in resultViewUi.js).
export { activeCommand };

// Transient, audit-independent state.
export const isSubmitting = writable(false);
export const error = writable(null);
// True from the moment the user hits the activity-box stop button until the run
// finalizes — drives the "Finalizing…" now-line while the backend writes its
// closing summary.
export const runStopping = writable(false);

// --- The live views: derived from the selected audit's record -------------

const currentEntry = derived([audits, currentAuditId], ([list, id]) =>
  id ? list.find((a) => a.id === id) || null : null,
);

export const messages = derived(currentEntry, (e) => e?.messages || []);
export const activity = derived(currentEntry, (e) => e?.activity || []);
export const reviewSummary = derived(currentEntry, (e) => e?.reviewSummary || null);
export const activeWorkbook = derived(currentEntry, (e) => e?.workbook || null);
// Run timing for the activity-box elapsed timer (epoch ms; null when unknown).
export const runStartedAt = derived(currentEntry, (e) => e?.runStartedAt || null);
export const runEndedAt = derived(currentEntry, (e) => e?.runEndedAt || null);

// "running" only while this audit IS the active stream. A record whose stored
// status is "running" but which is no longer streaming (e.g. after a page
// reload) reads as idle — same rule the old selectAudit restore applied.
export const runStatus = derived([currentEntry, activeStream], ([e, s]) => {
  if (!e) return "idle";
  if (s && s.auditId === e.id) return "running";
  if (e.status === "running") return "idle";
  return e.status || "idle";
});

let activeSource = null;
let activeMockHandle = null;

// The run id currently streaming (null when idle). Lets other modules tell
// whether an audit being viewed is the one still actively streaming.
export function getActiveRunId() {
  return get(activeStream)?.runId || null;
}

// Parse an A1 ref ("C4") into zero-based { row, col } for cell_update writes.
function refToRC(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref || "");
  if (!m) return { row: -1, col: -1 };
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: parseInt(m[2], 10) - 1, col: col - 1 };
}

// Append a message to the CURRENT audit's record (no-op without one — every
// run flow creates its record via startAudit before messaging).
export function addMessage(msg) {
  const id = get(currentAuditId);
  if (!id) return;
  const owner = get(audits).find((a) => a.id === id);
  syncAuditMessages(id, [...(owner?.messages || []), { id: crypto.randomUUID(), ...msg }]);
}

// A stream belongs to the audit that started it, NOT to whatever audit happens
// to be on screen. The sink writes ONLY into the owner audit's record; the
// derived views above reflect it automatically when that audit is the one
// being viewed — a background run can never pollute the audit you switched to.
// On a fresh run the sink starts blank. On RESUME (reconnecting to an in-flight
// run after a reload) it is seeded with the snapshot workbook + hydrated
// activity already on screen, so incoming cell_update / activity events apply
// ON TOP of what we fetched rather than replacing it. The stream has no replay,
// so a fresh connection only delivers FUTURE events — snapshot + future = whole.
function makeStreamSink(auditId, runId, seed = {}) {
  const acts = Array.isArray(seed.activity) ? seed.activity.slice() : [];
  let wb = seed.workbook || null;
  let chipEmitted = Boolean(seed.workbook);  // resumed runs already showed the chip

  function append(event) {
    // Agent tool/thinking elements carry a stable `id` and UPSERT in place, so a
    // part that streams in chunks stays ONE growing line (with the full text)
    // rather than appending a new partial copy per chunk. Everything else
    // (orchestrator steps, refresh_summary) appends.
    if (event && event.id != null) {
      const i = acts.findIndex((a) => a && a.id === event.id);
      if (i !== -1) {
        acts[i] = event;
        syncAuditActivity(auditId, acts.slice());
        return;
      }
    }
    acts.push(event);
    syncAuditActivity(auditId, acts.slice());
  }

  function emitMessage(msg) {
    const owner = get(audits).find((a) => a.id === auditId);
    syncAuditMessages(auditId, [
      ...(owner?.messages || []),
      { id: crypto.randomUUID(), ...msg },
    ]);
  }

  function setStatus(status) {
    setAuditStatus(auditId, status);
  }

  // workbook_created: structured workbook with a blank body. Cells fill via
  // applyCells; cellMetadata grows as cells gain values + provenance.
  function createWorkbook(event) {
    wb = {
      runId,
      sheets: (event.sheets || []).map((s) => ({
        ...s,
        data: (s.data || []).map((row) => row.slice()),
      })),
      cellMetadata: { ...(event.cellMetadata || {}) },
      currentSheetIndex: 0,
      // RUN -> SHEET live-fill contract: `recentlyUpdated` lists the full
      // "<Sheet>!<A1>" refs written in the latest cell_update batch (so the
      // viewer can flash them); `updateTick` increments every batch so the
      // viewer detects a new batch even when the same cells change again.
      recentlyUpdated: [],
      updateTick: 0,
    };
    syncAuditWorkbook(auditId, wb);
  }

  // cell_update: write value(s) + metadata immutably so the viewer reacts, and
  // mark just-changed cells for the fill flash.
  function applyCells(event) {
    if (!wb) return;
    // Rebase on the latest workbook from the store before applying this batch.
    // markCellReviewed's dwell (yellow -> white) writes review flips straight to
    // the store via updateCurrentAuditWorkbook, bumping ITS updateTick. If we
    // kept building on our private closure, our next updateTick would re-use the
    // value the dwell already produced — the viewer's `updateTick !== lastTick`
    // guard then treats this batch as already-seen and SKIPS painting it, so the
    // streamed cells land in the data model but never render (they look blank
    // until clicked). Re-reading keeps one monotonic tick across both writers
    // (and preserves the just-reviewed state instead of reverting it).
    const owner = get(audits).find((a) => a.id === auditId);
    if (owner?.workbook) wb = owner.workbook;
    const sheets = wb.sheets.slice();
    const si = sheets.findIndex((s) => s.name === event.sheet);
    if (si === -1) return;
    const src = sheets[si];
    const data = src.data.map((row) => row.slice());
    const cellMetadata = { ...wb.cellMetadata };
    const updated = [];
    for (const cell of event.cells || []) {
      const { row, col } = refToRC(cell.ref);
      if (row >= 0 && data[row] && col >= 0) data[row][col] = cell.value;
      const key = event.sheet + "!" + cell.ref;
      if (cell.meta) cellMetadata[key] = cell.meta;
      updated.push(key);
    }
    sheets[si] = { ...src, data };
    wb = {
      ...wb,
      sheets,
      cellMetadata,
      recentlyUpdated: updated,
      updateTick: (wb.updateTick || 0) + 1,
    };
    syncAuditWorkbook(auditId, wb);
  }

  // Emit the file chip exactly once, on workbook_created.
  function emitChip(label) {
    if (chipEmitted) return;
    chipEmitted = true;
    emitMessage({
      role: "assistant",
      type: "chip",
      label: label || "result.xlsx",
      workbookUrl: `/api/runs/${runId}/workbook`,
      downloadUrl: null,
    });
  }

  function setReviewSummary(event) {
    syncAuditReviewSummary(auditId, event);
  }

  return {
    acts,
    append,
    emitMessage,
    setStatus,
    createWorkbook,
    applyCells,
    emitChip,
    setReviewSummary,
  };
}

export function startRunStream(runId, auditId, { resume = false, startedAt = null } = {}) {
  // One live stream at a time: `activeSource`/`activeMockHandle` are module
  // globals, so starting a new stream (e.g. opening a second still-running run,
  // now that reconnect fires for any in-flight run) must first tear down the
  // prior one — otherwise its EventSource is orphaned but keeps mutating the
  // shared globals (its later `done` would null out OUR source). Closing an
  // EventSource is silent (no onerror), so the prior run isn't flipped to
  // error; it stays running on the backend and recovers via the snapshot +
  // reconnect when reopened.
  if (activeSource) {
    activeSource.close();
    activeSource = null;
  }
  if (activeMockHandle) {
    activeMockHandle.close();
    activeMockHandle = null;
  }
  activeStream.set({ auditId, runId });
  const owner0 = get(audits).find((a) => a.id === auditId);
  // Resume seeds the sink from what's already on screen (the snapshot we just
  // fetched + hydrated activity); a fresh run starts blank.
  const sink = resume
    ? makeStreamSink(auditId, runId, {
        workbook: owner0?.workbook || null,
        activity: owner0?.activity || [],
      })
    : makeStreamSink(auditId, runId);
  const isRefreshRun = Boolean(owner0?.refreshInFlight);

  function finalizeRefreshStateOnDone() {
    if (isRefreshRun) {
      setAuditRefreshState(auditId, { refreshInFlight: false, refreshAvailable: false });
      return;
    }
    setAuditRefreshState(auditId, { refreshInFlight: false, refreshAvailable: true });
  }

  function clearRefreshStateOnFailure() {
    if (!isRefreshRun) return;
    setAuditRefreshState(auditId, { refreshInFlight: false, refreshAvailable: false });
  }

  function endStream() {
    isSubmitting.set(false);
    runStopping.set(false);
    // Freeze the elapsed timer at the moment the run reached a terminal state.
    setAuditRunTiming(auditId, { endedAt: Date.now() });
    activeStream.set(null);
    activeSource = null;
    activeMockHandle = null;
  }

  // A fresh run resets prior state; a RESUME must preserve the snapshot +
  // activity already on screen (that's the whole point — apply live deltas on
  // top of it). Refresh runs keep activity history either way.
  if (!resume) {
    if (!isRefreshRun) {
      syncAuditActivity(auditId, []);
    }
    syncAuditReviewSummary(auditId, null);
    syncAuditWorkbook(auditId, null);
    setAuditRefreshState(auditId, { refreshAvailable: false, refreshInFlight: isRefreshRun });
  }
  // Seed the elapsed-timer clock: a fresh/refresh run starts now; a resume
  // prefers the backend's authoritative started_at so a reconnect shows the
  // TRUE elapsed time, falling back to any local stamp, then now.
  runStopping.set(false);
  setAuditRunTiming(auditId, {
    startedAt: resume ? (startedAt || owner0?.runStartedAt || Date.now()) : Date.now(),
    endedAt: null,
  });
  setAuditStatus(auditId, "running");

  if (isMockMode("runs")) {
    activeMockHandle = mockStartRunStream(runId, {
      onActivity(event) {
        applyRunEvent(event, sink);
      },
      onWorkbookCreated(event) {
        applyRunEvent(event, sink);
      },
      onCellUpdate(event) {
        applyRunEvent(event, sink);
      },
      onReviewSummary(event) {
        applyRunEvent(event, sink);
      },
      onDone() {
        applyRunEvent({ type: "done" }, sink);
        finalizeRefreshStateOnDone();
        sink.setStatus("completed");
        endStream();
      },
      onError(event) {
        applyRunEvent(
          { type: "error", message: "Run failed: " + ((event && event.message) || "unknown error") },
          sink,
        );
        clearRefreshStateOnFailure();
        sink.setStatus("error");
        endStream();
      },
    });
    return activeMockHandle;
  }

  const source = new EventSource(`/api/runs/${runId}/stream`);
  activeSource = source;

  source.onmessage = (e) => {
    const event = parseRunSsePayload(e.data);
    if (!event) return;
    if (!runEventDiscriminator(event)) return;
    if (event.type === "refresh_summary") {
      sink.append(event);
      return;
    }
    if (event.type === "done") {
      const hasSummaryForExecution =
        sink.acts.findIndex(
          (entry) =>
            entry?.type === "refresh_summary" && entry?.executionId === (event.executionId || null),
        ) !== -1;
      if (!hasSummaryForExecution && event.summary && typeof event.summary === "object") {
        sink.append({
          type: "refresh_summary",
          executionId: event.executionId || null,
          summary: event.summary,
        });
      }
      // Fallback chip for any backend that never sent workbook_created.
      sink.emitChip(event.label);
    }
    const terminal = applyRunEvent(event, sink);
    const status = terminalStatusForEventType(terminal);
    if (status === "completed") {
      finalizeRefreshStateOnDone();
      sink.setStatus(status);
      endStream();
      source.close();
      return;
    }
    if (status === "error") {
      clearRefreshStateOnFailure();
      // On a RESUME, an error usually means "this run is no longer live"
      // (finished while we were away, or the server restarted) — not that the
      // analysis failed. We already hold a valid DB snapshot, so settle the
      // spinner without showing a failure or discarding the data. Likewise a
      // user STOP finalizes gracefully (the backend normally sends a summary +
      // done, but if an error slips through after a stop we still settle clean).
      sink.setStatus(resume || get(runStopping) ? "completed" : status);
      endStream();
      source.close();
    }
  };

  source.onerror = () => {
    // Only flip to error if the run was still in flight (ignore the close that
    // fires after a normal "done"). On a RESUME we hold a valid snapshot, so a
    // transport error just means the live link dropped — settle quietly to
    // completed rather than surfacing a failure over good data. A user STOP holds
    // the stream open for the backend's finalize frames; if the transport drops
    // in that window we still settle to completed, never a failure.
    const owner = get(audits).find((a) => a.id === auditId);
    if (owner?.status === "running") {
      sink.setStatus(resume || get(runStopping) ? "completed" : "error");
    }
    clearRefreshStateOnFailure();
    endStream();
    source.close();
  };

  return source;
}

// Stop & FINALIZE the active run (the activity-box pause button): ask the
// backend to wind down and write a summary of the work done so far, as if the
// run had finished. We DELIBERATELY keep the live stream open — the backend now
// emits review_summary + done on stop, which the normal stream handler turns
// into a completed run with its terminal summary. Closing the stream here (the
// old behavior) would drop those finalize events and lose the summary.
export async function stopActiveRun() {
  const stream = get(activeStream);
  if (!stream?.runId) return;
  const { runId } = stream;

  runStopping.set(true);

  // Mock has no backend: finalize the in-memory timeline in place (emit the
  // review_summary + done it would have reached) instead of just cancelling.
  if (activeMockHandle) {
    if (typeof activeMockHandle.finalize === "function") {
      activeMockHandle.finalize();
    } else {
      activeMockHandle.close();
      activeMockHandle = null;
    }
    return;
  }

  try {
    await apiStopRun(runId);
  } catch (_) {
    // Best-effort — if the stop call fails the run keeps streaming to its own
    // natural end, which still finalizes correctly.
  }
}

// Hard reset transient chat/run runtime on auth transitions (e.g. logout) so
// no in-memory run state remains visible. The derived views clear when
// resetAuditHistory wipes the records.
export function resetChatRuntime() {
  if (activeSource) {
    activeSource.close();
    activeSource = null;
  }
  if (activeMockHandle) {
    activeMockHandle.close();
    activeMockHandle = null;
  }
  activeStream.set(null);
  isSubmitting.set(false);
  error.set(null);
  activeCommand.set(null);
}

// Open (or focus) a run's workbook. The backend (`/workbook`, built from
// state.db — the source of truth) is re-fetched every time, so the view always
// reflects the database, not a stale localStorage cache. The ONE exception is
// the run that is actively streaming into this tab right now: its in-memory
// workbook is being live-filled by the stream and must not be clobbered by a
// snapshot. A run with no local record (server history on a fresh browser) gets
// a minimal record so the snapshot has somewhere durable to live.
export async function openWorkbook(runId) {
  // The actively-streaming run is authoritative live — focus it, don't refetch.
  if (getActiveRunId() === runId) {
    const owner = get(audits).find((a) => a.runId === runId);
    if (owner) currentAuditId.set(owner.id);
    return;
  }

  let owner = get(audits).find((a) => a.runId === runId);
  if (!owner) {
    owner = {
      id: `run:${runId}`,
      runId,
      title: `Run ${String(runId).slice(0, 8)}`,
      createdAt: Date.now(),
      status: "completed",
      messages: [],
      activity: [],
      reviewSummary: null,
      workbook: null,
      runStartedAt: null,
      runEndedAt: null,
    };
    audits.update((list) => [owner, ...list]);
  }

  // Always re-read the authoritative state from the backend. This is what makes
  // a run recover correctly after a page reload / navigate-away / fresh browser:
  // every cell the agent wrote (out-of-process, straight to state.db) is in the
  // response even if it never reached this browser over the live stream.
  let snapshot = null;
  try {
    snapshot = await apiGetWorkbook(runId);
    syncAuditWorkbook(owner.id, {
      runId,
      sheets: snapshot.sheets,
      cellMetadata: snapshot.cellMetadata || {},
      currentSheetIndex: 0,
    });
  } catch (e) {
    // Keep any cached workbook on a transient fetch failure rather than blanking.
    if (!owner.workbook) {
      error.set(e.message);
      return;
    }
  }
  currentAuditId.set(owner.id);

  // Seed the activity-box timer from the snapshot. For a FINISHED run reopened
  // from history (reload / fresh browser) this is the only place it's set — no
  // stream reconnect happens — so the timer freezes at the real duration
  // (endedAt − startedAt) instead of showing 0s. A live run is re-seeded just
  // below by startRunStream (which clears endedAt).
  const snapStarted = snapshot?.startedAt ? Date.parse(snapshot.startedAt) : NaN;
  const snapEnded = snapshot?.endedAt ? Date.parse(snapshot.endedAt) : NaN;
  setAuditRunTiming(owner.id, {
    startedAt: Number.isFinite(snapStarted) ? snapStarted : null,
    endedAt: Number.isFinite(snapEnded) ? snapEnded : null,
  });

  // Reconnect the live stream iff the backend says the run is still live, so
  // cells AND agent activity keep updating on top of the snapshot we just
  // loaded. `runStatus` from /workbook is the AUTHORITATIVE signal: a fresh
  // browser (or any reload) has no trustworthy local "running" flag, because
  // server history is hydrated as "completed". The snapshot is the catch-up;
  // the stream is the live tail — re-fetching /workbook alone can't tail, HTTP
  // is one-shot pull. Reconnecting a run that actually finished is safe: the
  // broker settles it immediately (synthesized done), so this never hangs.
  const live = snapshot?.runStatus === "in_progress" || snapshot?.runStatus === "queued";
  if (live && getActiveRunId() !== runId && !isMockMode("runs")) {
    // Seed the elapsed timer from the backend's authoritative started_at so a
    // reconnect shows the true elapsed time, not a restart from 0.
    startRunStream(runId, owner.id, {
      resume: true,
      startedAt: Number.isFinite(snapStarted) ? snapStarted : null,
    });
  }
}

// In real mode, download through the backend export route so server-side export
// policy is enforced. Mock mode still serializes the in-memory workbook via SheetJS.
export async function downloadWorkbook(runId, label) {
  if (!runId) return;
  if (!isMockMode("runs")) {
    try {
      const blob = await apiDownloadWorkbookExport(runId);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = label || "result.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      error.set(e instanceof Error ? e.message : String(e));
    }
    return;
  }

  let workbook = null;

  const live = get(activeWorkbook);
  if (live && live.runId === runId) {
    workbook = live;
  } else {
    const owner = get(audits).find((a) => a.runId === runId);
    if (owner && owner.workbook) {
      workbook = owner.workbook;
    } else {
      try {
        workbook = await apiGetWorkbook(runId);
      } catch (e) {
        error.set(e.message);
        return;
      }
    }
  }

  if (!workbook || !workbook.sheets) return;

  const wb = XLSX.utils.book_new();
  for (const sheet of workbook.sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.data || []);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  XLSX.writeFile(wb, label || "result.xlsx");
}

export async function runCommand(sql, explanation = null, database = null, evidence = null) {
  activeCommand.set({ sql, explanation, evidence, result: null, loading: true, error: null });
  try {
    const result = await executeSql(sql, database);
    activeCommand.update((c) => ({ ...c, result, loading: false }));
  } catch (e) {
    activeCommand.update((c) => ({ ...c, loading: false, error: e.message }));
  }
}

export function closeCommand() {
  activeCommand.set(null);
  closeResultViewPanel();
}

// Right-panel refresh entrypoint. This calls the backend refresh API and
// reconnects the live stream on success. When the backend reports an already
// active execution, this returns `{ status: "resumed", runId }` after reattach.
export async function startRefreshFromPanel() {
  const auditId = get(currentAuditId);
  if (!auditId) throw new Error("No audit selected for update check.");

  const owner = get(audits).find((a) => a.id === auditId);
  if (!owner) throw new Error("Selected audit was not found.");
  if (get(runStatus) === "running") {
    throw new Error("Execution is active; updates can only be checked while idle.");
  }
  if (!owner.runId) throw new Error("No run is available yet for update checks.");

  setAuditRefreshState(auditId, { refreshAvailable: false, refreshInFlight: true });
  try {
    const response = await apiRefreshRun(owner.runId);
    startRunStream(owner.runId, auditId);
    return response;
  } catch (err) {
    const code = err?.code;
    const handled = handleRefreshConflict(code, owner.runId, auditId, startRunStream);
    if (handled) {
      return handled;
    }
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    if (get(runStatus) !== "running") {
      setAuditRefreshState(auditId, { refreshInFlight: false });
    }
  }
}

// Derive a short sidebar title from the pasted description: prefer the first
// substantive line (skip short greetings/sign-offs like "Hi team,").
function titleFromPrompt(text) {
  const lines = (text || "").split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const line = lines.find((l) => l.length >= 15) || lines[0];
  if (!line) return "New audit";
  return line.length > 48 ? line.slice(0, 47).trimEnd() + "…" : line;
}

// Flow B entry point (README §8): start the SAME live-population run engine from
// a free-text description instead of a template. HOME calls this from the
// "Describe the data you want" box in place of the old generateData text stream.
export async function startDescribeRun(promptText) {
  const text = (promptText || "").trim();
  if (!text || get(isSubmitting)) return;

  isSubmitting.set(true);
  let histId = null;
  try {
    histId = startAudit({ id: "describe", name: titleFromPrompt(text) }, {});
    goToResults();
    addMessage({ role: "user", type: "text", content: text });
    const data = await createRunFromDescription(text);
    setAuditRunId(histId, data.runId);
    startRunStream(data.runId, histId);
  } catch (err) {
    addMessage({ role: "assistant", type: "text", content: "Run failed: " + err.message });
    if (histId) setAuditStatus(histId, "error");
    activeStream.set(null);
    isSubmitting.set(false);
  }
}
