import { get } from "svelte/store";

import { executeChatCitationEvidence } from "../lib/api.js";
import {
  activeCommand,
  clearCellEvidenceSelection,
  openPanel,
  RIGHT_PANEL_MODES,
} from "./resultViewUi.js";

let evidenceRequestId = 0;

function citationRequest(citation, context = {}) {
  return {
    ...citation,
    thread_id: context.threadId || citation?.thread_id || null,
    message_index: context.messageIndex ?? citation?.message_index ?? null,
    marker: context.marker || citation?.marker || null,
    covered_row_index:
      context.coveredRowIndex ?? citation?.covered_row_index ?? null,
  };
}

export function commandFromCitation(citation, context = {}) {
  if (!citation || typeof citation !== "object") return null;
  const request = citationRequest(citation, context);
  const sql = String(citation.query || "").trim();
  if (!sql) return null;
  const kind = citation.kind === "aggregate" ? "aggregate" : "source";
  const evidence = Array.isArray(citation.citations)
    ? citation.citations.filter(Boolean).map(String)
    : null;
  const aggregate =
    kind === "aggregate"
      ? {
          denominator: citation.denominator || null,
          completeness: citation.completeness || null,
          coveredRows: Array.isArray(citation.covered_rows)
            ? citation.covered_rows.map((row, index) =>
                citationRequest(row, {
                  threadId: request.thread_id,
                  messageIndex: request.message_index,
                  marker: request.marker,
                  coveredRowIndex: index,
                }),
              )
            : [],
        }
      : null;
  return {
    sql,
    citation: request,
    database: citation.database || null,
    explanation: citation.explanation || null,
    evidence,
    aggregate,
    result: null,
    loading: true,
    error: null,
  };
}

export async function openChatCitationEvidence(citation, context = {}) {
  const command = commandFromCitation(citation, context);
  if (!command) return;
  const requestId = ++evidenceRequestId;
  activeCommand.set(command);
  clearCellEvidenceSelection();
  openPanel(RIGHT_PANEL_MODES.CELL_EVIDENCE);
  try {
    const result = await executeChatCitationEvidence(command.citation);
    if (requestId !== evidenceRequestId) return;
    activeCommand.update((current) =>
      current ? { ...current, result, loading: false } : current,
    );
  } catch (error) {
    if (requestId !== evidenceRequestId) return;
    activeCommand.update((current) =>
      current
        ? {
            ...current,
            loading: false,
            error: error?.message || String(error),
          }
        : current,
    );
  }
}

export function currentEvidenceCommand() {
  return get(activeCommand);
}
