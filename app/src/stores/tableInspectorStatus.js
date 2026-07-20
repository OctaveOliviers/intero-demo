// Pure state-derivation for the thread TableInspector — kept separate from the
// store so it can be unit-tested without a Svelte component harness (Issue 1's
// pattern). Maps a tracked table's populatedTables-store record to the three inspector
// states the inline inspector renders: running → done (or error).
//
// The inspector tracks the DURABLE run record (populatedTables.js, persisted to
// localStorage — Q36), so a "running" record with no active stream (e.g. after a
// reload) still reads as running rather than being silently flipped to done. Only
// a record the run stream marked "completed"/"error" leaves the running state.

// `record` is the populatedTables.js entry that owns the table's run (or null before it
// exists); `isActiveStream` is true while this run is the one actively streaming.
export function inspectorStatus(record, _isActiveStream) {
  const status = record?.status || "running";
  if (status === "completed") return "done";
  if (status === "error") return "error";
  // "running" (live or stored), or any pre-terminal status, shows as building.
  return "running";
}

export function isTerminalInspectorStatus(status) {
  return status === "done" || status === "error";
}

// The terminal-SUCCESS labels a finished table can carry. VOCAB GOTCHA: the
// populatedTables store says "completed", the table contract says "complete", and the
// inspector says "done" — all three mean the same "this table is filled".
const FINISHED_STATUSES = new Set(["complete", "completed", "done"]);

// How a Tables-section card should OPEN, from its (summary) status. A FINISHED
// table opens INSTANTLY via the populated-snapshot path (openWorkbook — no agent
// re-run); anything still working (or an error/unknown — never re-open empty)
// keeps the live streaming path (trackTable). Pure so openTableCard is testable.
export function openDecisionForStatus(status) {
  return FINISHED_STATUSES.has(status) ? "instant" : "stream";
}

// The honest sidebar dot for one table — THREE states (Slice 3):
//   • "working"  → amber dot: the run is still going.
//   • "unopened" → blue dot:  finished, but THIS user hasn't opened the full
//                  grid yet (the per-user "seen" flag is false).
//   • "none"     → no dot:    finished AND this user has opened it.
// Merges the persisted summary `status` with the LIVE inspector overlay (the
// per-table tableInspectorState entry, or null when not session-tracked) to
// decide working-vs-finished — the live overlay WINS when present, so a tracked
// table that just finished flips its amber dot to blue (or none) even though the
// summary list (not yet refreshed) still says "in_progress"; conversely a stale
// "complete" summary stays amber while its run is genuinely still streaming.
//
// `opened` is the per-user seen flag (default false). It ONLY suppresses the
// blue state: a still-working table stays amber even when opened (it goes
// straight to "none" when it finishes).
export function tableDotState(summaryStatus, liveState, opened = false) {
  if (!isTableFinished(summaryStatus, liveState)) return "working";
  return opened ? "none" : "unopened";
}

// Is this table finished? The single working-vs-finished line; tableDotState
// then splits "finished" into "unopened" (blue) vs "none" (no dot) on the
// per-user seen flag, so that decision stays in one place.
//
// The LIVE overlay (the session-tracked tableInspectorState entry) WINS when
// present: it is finished only at a TERMINAL inspector status (done/error) — a
// non-terminal live status (running OR queued) is still working, so a tracked
// queued/streaming table keeps its amber dot. With no live overlay we fall back
// to the persisted summary status: only the genuine working states (queued/
// in_progress/blocked/in_verification) are working; complete OR error are finished.
function isTableFinished(summaryStatus, liveState) {
  if (liveState && liveState.status) {
    return isTerminalInspectorStatus(liveState.status);
  }
  return !WORKING_STATUSES.has(summaryStatus);
}

// The summary statuses that count as "genuinely working" (amber dot). The table
// contract enum's pre-terminal states; "complete" is finished, "error" no dot.
const WORKING_STATUSES = new Set([
  "queued",
  "in_progress",
  "blocked",
  "in_verification",
]);

// The human line the inspector shows per state (reuses the activity-feed idiom:
// a quiet status line, not a shouty banner).
export function inspectorLabel(status) {
  if (status === "done") return "Table ready — open it";
  if (status === "error") return "We couldn't finish this table";
  if (status === "queued") return "Queued — not started yet";
  return "Building your table…";
}
