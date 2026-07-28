<script>
  // The chat surface — the ONLY conversation surface in the app (UI label
  // "chat"; "thread" stays the backend/domain term — product-flows.md §Threads,
  // tables & outputs). It opens like the old "new audit" home: a clean CENTERED
  // composer (no live agent suggestion while typing — the primary agent receives
  // the full prompt only on send). On
  // the first message the composer drops to the BOTTOM and the conversation
  // appears: user messages as a right-aligned bubble, the agent's reply as plain
  // text on the left (no bubble), with its `resolution` below:
  //   - a quiet scope chip (scope.disclosure);
  //   - output "table" → the inline TableInspector (running → done, click-to-open);
  //   - output "chat"  → the streamed answer is the agent text; evidenced values
  //     are buttons that open the evidence panel.
  import { afterUpdate, onDestroy, tick } from "svelte";
  import DOMPurify from "dompurify";
  import { _ } from "svelte-i18n";
  import {
    currentThread,
    currentThreadId,
    pendingNewChat,
    threadsLoading,
    sending,
    threadsError,
    sendThreadMessage,
    sendFirstMessage,
    submitQuestionAnswers,
    pendingAskUserQuestions,
  } from "../stores/threads.js";
  import { openThread } from "../stores/threads.js";
  import { openThreadView } from "../stores/navigation.js";
  import { isMockMode } from "../lib/mock.js";
  import { CONTENT } from "../lib/mock/content/index.js";
  import { listDatasets } from "../lib/api.js";
  import { attachmentTypeIcon } from "../lib/attachmentTypes.js";
  import { answerSegments, markdownHtml, scopeDisclosureVariant } from "../lib/chatAnswer.js";
  import { templates, templatesLoading, refreshTemplates } from "../lib/templates.js";
  import { openChatCitationEvidence } from "../stores/chatEvidence.js";
  import Icon from "./Icon.svelte";
  import TableInspector from "./TableInspector.svelte";
  import { createThreadMessageKeyer } from "./threadMessageKey.js";
  import {
    ARTIFACT_WORKSPACE_STATES,
    ARTIFACT_WORKSPACE_THREAD_ID,
    LUNG_MOC_ARTIFACT_ID,
    LUNG_MOC_TABLE_ID,
    demoAttentionItems,
    visibleDemoArtifacts,
    evidenceById,
    patientForm,
    patientList,
    cellAwaitingReview,
    matchFollowUp,
    followUpById,
    sourceDocById,
  } from "../lib/artifactWorkspaceDemo.js";
  import {
    artifactWorkspaceDemoState,
    addDemoFollowUpNote,
    activateDemoTab,
    clearDemoContextChips,
    commitDemoContextChip,
    closeDemoArtifact,
    closeDemoEvidence,
    closeDemoTab,
    markDemoCellReviewed,
    openDemoArtifact,
    openDemoEvidence,
    openDemoReportTab,
    removeDemoArtifact,
    removeDemoContextChip,
    renameDemoArtifact,
    selectDemoCell,
    selectDemoPatient,
    editDemoField,
    toggleDemoArtifactPin,
    toggleDemoContextCapture,
    toggleDemoPendingContextCell,
    toggleDemoChatFold,
    startLungMocDemoRun,
    finishLungMocDemoRun,
  } from "../stores/artifactWorkspaceDemo.js";
  import AgentActivityStream from "./AgentActivityStream.svelte";
  import ContextChip from "./artifact-workspace/ContextChip.svelte";
  import AttentionList from "./artifact-workspace/AttentionList.svelte";
  import FollowUpTurn from "./artifact-workspace/FollowUpTurn.svelte";
  import ArtifactTray from "./artifact-workspace/ArtifactTray.svelte";
  import ArtifactBox from "./artifact-workspace/ArtifactBox.svelte";

  // Lung MOC demo strings (columns, agent messages, chips, follow-up questions).
  // Numbers, ids and codes stay in logic; the pack holds the localisable text.
  const AW = CONTENT.artifactWorkspace;

  let draft = "";
  let listEl = null;
  let inputEl = null;
  let otherInputEl = null;
  let threadWorkspaceEl = null;
  let lastCount = 0;
  let selectedAttachments = [];
  let attachmentMenuOpen = false;
  let datasets = [];
  let datasetsLoading = false;
  let attachmentError = "";
  let artifactPaneWidthPct = 50;
  let artifactResizing = false;
  let stopArtifactResize = null;
  // Measured width of the floating artifact tray — feeds the chat column's
  // centering rule via --tray-width. Forced back to 0 whenever the tray is not
  // rendered (bind:clientWidth would otherwise keep the stale last value).
  let trayFloatWidth = 0;
  $: trayShowing =
    artifactMode && hasArtifactTray && workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED;
  $: trayDockWidth = trayShowing ? trayFloatWidth : 0;
  const ARTIFACT_MIN_PCT = 36;
  const ARTIFACT_MAX_PCT = 86;
  const ARTIFACT_EXPAND_PCT = 84;
  const messageKey = createThreadMessageKeyer();
  let activeQuestionRequestId = null;
  let questionIndex = 0;
  let questionAnswers = {};

  $: messages = $currentThread?.messages || [];
  $: selectedDatasetId =
    selectedAttachments.find((attachment) => attachment.type === "dataset")?.id || null;
  $: selectedTemplateId =
    selectedAttachments.find((attachment) => attachment.type === "template")?.id || null;
  // The composer's AskUserQuestion flow renders whatever `questionRequest` holds.
  // For the mock follow-ups we feed it a LOCAL question (e.g. "Add to MOC Notes?")
  // so the prompt reuses the exact product UI instead of a bespoke chat widget.
  $: questionRequest = artifactMode && demoQuestion ? demoQuestion : pendingAskUserQuestions($currentThread);
  $: if ((questionRequest?.id || null) !== activeQuestionRequestId) {
    activeQuestionRequestId = questionRequest?.id || null;
    questionIndex = 0;
    questionAnswers = {};
  }
  $: questionList = questionRequest?.questions || [];
  $: currentQuestion = questionList[questionIndex] || null;
  $: currentQuestionAnswer = currentQuestion ? questionAnswers[currentQuestion.id] : null;
  $: isLastQuestion = questionIndex >= questionList.length - 1;
  $: canSubmitQuestion =
    currentQuestionAnswer?.status === "answered" &&
    (currentQuestionAnswer.choice_id !== "other" ||
      Boolean(String(currentQuestionAnswer.text || "").trim()));
  // A proposal (Dataset/Template write authorization) and the free-text Other
  // row both need an explicit confirm click; every other choice submits the
  // instant it's selected.
  $: requiresExplicitConfirm =
    Boolean(currentQuestion?.proposal) || currentQuestionAnswer?.choice_id === "other";
  // LANDING = the centered composer: either a PENDING new chat (no thread
  // persisted yet — the first message mints it) or an open thread with no
  // messages yet. After the first send the composer drops to the bottom and the
  // conversation shows.
  $: artifactMode = $currentThread?.id === ARTIFACT_WORKSPACE_THREAD_ID;
  $: artifactState = $artifactWorkspaceDemoState;
  $: workspaceState = artifactState.workspaceState;
  // Streamed opening run (mock demo): a live agent-activity turn + progressive
  // table fill, replacing the old pre-seeded opening message.
  $: runStatus = artifactMode ? artifactState.runStatus : "idle";
  $: runActive = runStatus !== "idle";
  // The composer owns stop: while the opening run or a follow-up streams, the
  // send button becomes a stop (square) that fast-forwards to the finished state.
  $: streamingTurn = demoTurns.find((turn) => turn.status === "streaming") || null;
  $: demoRunning = artifactMode && (runStatus === "running" || Boolean(streamingTurn));
  function stopDemoRun() {
    if (runStatus === "running") finishLungMocDemoRun();
    else if (streamingTurn) revealFollowUp(streamingTurn);
  }
  // A run in flight fills the (otherwise empty) demo thread, so leave the
  // landing state the moment it starts.
  $: isLanding = ($pendingNewChat || (Boolean($currentThread) && messages.length === 0)) && !runActive;
  // The tray lists every (non-deleted) artifact of this thread, with the
  // session's renames applied; `pinned` only reflects an explicit pin.
  $: visibleArtifacts = artifactMode ? visibleDemoArtifacts(artifactState) : [];
  $: hasArtifactTray = visibleArtifacts.length > 0;
  // Chrome-style tabs: the box shows one tab at a time. The table tab carries a
  // side-panel evidence; note tabs are reports opened from chat. Tab titles
  // follow the session's renames.
  $: tabs = (artifactState.tabs || []).map((tab) =>
    artifactState.artifactTitleOverrides?.[tab.id]
      ? { ...tab, title: artifactState.artifactTitleOverrides[tab.id] }
      : tab,
  );
  $: activeTab = tabs.find((tab) => tab.id === artifactState.activeTabId) || null;
  // The record on screen and the cohort beside it — both straight from the
  // demo module's selectors, so this component only routes them.
  $: form = artifactMode ? patientForm(artifactState) : null;
  $: patients = artifactMode ? patientList(artifactState) : [];
  $: streaming = runStatus === "running";
  $: noteDoc = activeTab?.kind === "note" ? sourceDocById(activeTab.sourceId) : null;
  $: evidence = evidenceById(artifactState, artifactState.activeEvidenceId);
  $: contextChips = artifactMode ? artifactState.contextChips || [] : [];

  // Scripted follow-up turns live locally (not in the mock chat backend) so the
  // canned replies stay deterministic. Reset when leaving the demo thread.
  let demoTurns = [];
  // The pending "Add to MOC Notes?" question (product AskUserQuestion shape) and
  // the turn it belongs to, so answering can write that turn's note.
  let demoQuestion = null;
  let demoQuestionTurn = null;
  let followUpTimers = [];
  $: if ($currentThreadId !== ARTIFACT_WORKSPACE_THREAD_ID && (demoTurns.length || demoQuestion)) {
    followUpTimers.forEach((t) => clearTimeout(t));
    followUpTimers = [];
    demoTurns = [];
    demoQuestion = null;
    demoQuestionTurn = null;
  }

  // Review-on-dwell for interpreted (yellow) cells, mirroring the product: once
  // the doctor has kept a needs-review cell's note evidence open for 2s, the
  // cell settles needs-review -> reviewed (yellow -> white). Switching cells or
  // closing the evidence before then cancels the pending review.
  const DEMO_REVIEW_DWELL_MS = 2000;
  let demoReviewTimer = null;
  let demoReviewEvidenceId = null;
  $: armDemoReview(artifactState);
  function armDemoReview(state) {
    const id = String(state.activeEvidenceId || "");
    const [prefix, tableId, rowId, columnId] = id.split(":");
    const awaiting = prefix === "cell" && cellAwaitingReview(state, tableId, rowId, columnId);
    if (awaiting && demoReviewEvidenceId === id) return; // timer already armed for this cell
    if (demoReviewTimer) {
      clearTimeout(demoReviewTimer);
      demoReviewTimer = null;
    }
    demoReviewEvidenceId = awaiting ? id : null;
    if (!awaiting) return;
    demoReviewTimer = setTimeout(() => {
      demoReviewTimer = null;
      demoReviewEvidenceId = null;
      // Only settle if the same cell's evidence is still open.
      if ($artifactWorkspaceDemoState.activeEvidenceId === id) {
        markDemoCellReviewed(tableId, rowId, columnId);
      }
    }, DEMO_REVIEW_DWELL_MS);
  }

  function openAttentionItem(item) {
    selectDemoCell(LUNG_MOC_TABLE_ID, item.rowId, item.columnId);
  }

  // A field's source control hands back either a cited document or the field's
  // own cell evidence; both open in the same side panel.
  function openDemoFieldSource(sourceId) {
    const id = String(sourceId || "");
    if (id.startsWith("cell:")) {
      const [, tableId, rowId, columnId] = id.split(":");
      selectDemoCell(tableId, rowId, columnId);
      return;
    }
    openDemoEvidence(id);
  }

  // A follow-up first streams fake agent activity (~8s), then reveals its reply
  // and raises the MOC-notes question — so the answer never appears instantly.
  const GENERIC_FOLLOWUP_ACTIVITY = AW.genericFollowUpActivity;

  function streamFollowUp(turn) {
    const followUp = turn.followUpId ? followUpById(turn.followUpId) : null;
    const lines = followUp?.activity || GENERIC_FOLLOWUP_ACTIVITY;
    let at = 400;
    lines.forEach((text, i) => {
      followUpTimers.push(
        setTimeout(() => {
          turn.activity = [...turn.activity, { id: `fa-${turn.key}-${i}`, label: text, headline: text, kind: "tool" }];
          demoTurns = [...demoTurns];
        }, at),
      );
      at += 1400 + Math.floor(Math.random() * 1600);
    });
    followUpTimers.push(setTimeout(() => revealFollowUp(turn), at + 800));
  }

  function revealFollowUp(turn) {
    if (turn.status === "revealed") return;
    turn.status = "revealed";
    turn.endedAt = Date.now();
    const followUp = turn.followUpId ? followUpById(turn.followUpId) : null;
    if (followUp) {
      // Resolve any earlier pending question, then raise this turn's.
      if (demoQuestionTurn && demoQuestionTurn.answered === null) demoQuestionTurn.answered = "skipped";
      demoQuestionTurn = turn;
      demoQuestion = {
        id: `moc-${turn.key}`,
        questions: [
          {
            id: "moc",
            question: AW.followUpQuestion(followUp.noteRowId),
            choices: [
              { id: "add", label: AW.addToMocNotes },
              { id: "skip", label: AW.skip },
            ],
            allow_other: false,
          },
        ],
      };
    }
    demoTurns = [...demoTurns];
  }

  // Follow the tail as messages arrive. Done in afterUpdate (not a reactive `$:`
  // block) and guarded on the message count: a reactive statement that calls
  // tick() re-enters Svelte's flush and freezes the renderer. afterUpdate runs
  // once per applied DOM update; the count guard scrolls only on a new message.
  afterUpdate(() => {
    const followUpProgress = demoTurns.reduce(
      (n, t) => n + (t.activity?.length || 0) + (t.status === "revealed" ? 1 : 0),
      0,
    );
    const count =
      messages.length + demoTurns.length + followUpProgress + (runActive ? 1 : 0) + (runStatus === "done" ? 1 : 0);
    if (listEl && count !== lastCount) {
      lastCount = count;
      listEl.scrollTop = listEl.scrollHeight;
    }
  });

  onDestroy(() => {
    stopArtifactResize?.();
    followUpTimers.forEach((t) => clearTimeout(t));
    if (demoReviewTimer) clearTimeout(demoReviewTimer);
  });

  async function submit() {
    const text = draft.trim();
    // The follow-up question can come from the composer draft OR the comments
    // the doctor typed on their context chips (or both).
    const chipComments = contextChips.map((chip) => chip.comment).filter(Boolean);
    if ((!text && chipComments.length === 0) || $sending) return;
    const submittedText = [text, ...chipComments].filter(Boolean).join(" ") || "Follow up on selected context.";
    draft = "";
    if (inputEl) inputEl.style.height = "auto";

    // Mock demo trigger: a message mentioning the MOC — from a New chat OR the
    // empty demo thread — routes into the Lung MOC Prep thread and plays the
    // streamed opening (agent activity + progressive table fill). Not while a
    // run is already in flight.
    if (isMockMode("audits") && /\bmoc\b/i.test(submittedText) && !(artifactMode && runStatus === "running")) {
      if (!artifactMode) {
        await openThread(ARTIFACT_WORKSPACE_THREAD_ID);
        openThreadView();
      }
      startLungMocDemoRun(submittedText);
      if (contextChips.length) clearDemoContextChips();
      return;
    }

    // In the mock demo thread, follow-ups are scripted locally and matched by
    // keyword — we never call the chat backend, so the canned replies (and the
    // charts / precedent cases / MOC-note widget) are deterministic on stage.
    if (artifactMode) {
      const match = matchFollowUp(submittedText);
      // The turn first streams fake agent activity, then reveals (see
      // streamFollowUp) — the reply and its MOC-notes question appear after.
      const turn = {
        key: `demo-${demoTurns.length}`,
        userText: submittedText,
        followUpId: match?.id ?? null,
        answered: null,
        status: "streaming",
        activity: [],
        startedAt: Date.now(),
        endedAt: null,
      };
      demoTurns = [...demoTurns, turn];
      streamFollowUp(turn);
      if (contextChips.length) clearDemoContextChips();
      return;
    }
    // No current thread → this is the first message of a pending new chat: mint
    // the thread FROM it (and surface any table it produced). Otherwise send into
    // the open thread.
    if (!$currentThreadId) {
      // On a failed create the landing stays put and $threadsError is shown
      // below — restore the draft so the user doesn't lose their typed message.
      const created = await sendFirstMessage(submittedText, selectedAttachments);
      if (!created) {
        draft = text;
        return;
      }
    } else {
      await sendThreadMessage(submittedText, selectedAttachments);
    }
    if (contextChips.length) clearDemoContextChips();
  }


  function startArtifactResize(event) {
    if (workspaceState !== ARTIFACT_WORKSPACE_STATES.CHAT_AND_ARTIFACT) return;
    const rect = threadWorkspaceEl?.getBoundingClientRect?.();
    if (!rect?.width) return;

    artifactResizing = true;
    event.preventDefault();
    let nextArtifactPaneWidthPct = artifactPaneWidthPct;

    const updateWidth = (moveEvent) => {
      const nextPct = ((rect.right - moveEvent.clientX) / rect.width) * 100;
      nextArtifactPaneWidthPct = Math.min(ARTIFACT_MAX_PCT, Math.max(ARTIFACT_MIN_PCT, nextPct));
      threadWorkspaceEl.style.setProperty("--artifact-pane-width", `${nextArtifactPaneWidthPct}%`);
    };

    const onMove = (moveEvent) => updateWidth(moveEvent);
    const onUp = () => {
      if (nextArtifactPaneWidthPct >= ARTIFACT_EXPAND_PCT) {
        artifactPaneWidthPct = 50;
        toggleDemoChatFold();
      } else {
        artifactPaneWidthPct = nextArtifactPaneWidthPct;
      }
      artifactResizing = false;
      stopArtifactResize?.();
      stopArtifactResize = null;
    };

    stopArtifactResize?.();
    stopArtifactResize = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    updateWidth(event);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function toggleAttachmentMenu() {
    attachmentMenuOpen = !attachmentMenuOpen;
    if (attachmentMenuOpen) await loadAttachmentOptions();
  }

  async function loadAttachmentOptions() {
    attachmentError = "";
    const loads = [];
    if (!$templatesLoading && $templates.length === 0) {
      loads.push(refreshTemplates());
    }
    if (!datasetsLoading && datasets.length === 0) {
      datasetsLoading = true;
      loads.push(
        listDatasets()
          .then((items) => {
            datasets = Array.isArray(items) ? items : [];
          })
          .finally(() => {
            datasetsLoading = false;
          }),
      );
    }
    try {
      await Promise.all(loads);
    } catch (err) {
      attachmentError = err?.message || $_("home.attachmentsError");
    }
  }

  function attachItem(type, id) {
    if (!id) return;
    selectedAttachments = [
      ...selectedAttachments.filter((attachment) => attachment.type !== type),
      { type, id },
    ];
    attachmentMenuOpen = false;
  }

  function removeAttachment(type) {
    selectedAttachments = selectedAttachments.filter((attachment) => attachment.type !== type);
  }

  function attachmentLabel(attachment) {
    if (attachment.type === "dataset") {
      return datasets.find((dataset) => dataset.id === attachment.id)?.name || attachment.id;
    }
    return $templates.find((template) => template.id === attachment.id)?.name || attachment.id;
  }

  function answerForChoice(choice) {
    if (!currentQuestion || $sending) return;
    questionAnswers = {
      ...questionAnswers,
      [currentQuestion.id]: {
        question_id: currentQuestion.id,
        status: "answered",
        choice_id: choice.id,
        text: null,
      },
    };
    // Proposal choices (accept/reject a Dataset or Template change) still wait
    // for an explicit confirm click; every other choice advances right away.
    if (!currentQuestion.proposal) advanceQuestion();
  }

  async function selectOther() {
    if (!currentQuestion) return;
    questionAnswers = {
      ...questionAnswers,
      [currentQuestion.id]: {
        question_id: currentQuestion.id,
        status: "answered",
        choice_id: "other",
        text: currentQuestionAnswer?.text || "",
      },
    };
    await tick();
    otherInputEl?.focus();
  }

  function updateOther(e) {
    if (!currentQuestion) return;
    questionAnswers = {
      ...questionAnswers,
      [currentQuestion.id]: {
        question_id: currentQuestion.id,
        status: "answered",
        choice_id: "other",
        text: e.target.value,
      },
    };
  }

  function answerPayload() {
    return questionList.map((question) => (
      questionAnswers[question.id] || {
        question_id: question.id,
        status: "skipped",
        choice_id: null,
        text: null,
      }
    ));
  }

  async function finishQuestions() {
    // Local MOC-notes question: apply the choice to the demo table, don't hit the backend.
    if (demoQuestion) {
      const answer = questionAnswers.moc;
      const followUp = demoQuestionTurn ? followUpById(demoQuestionTurn.followUpId) : null;
      if (answer?.choice_id === "add" && followUp) {
        addDemoFollowUpNote(LUNG_MOC_TABLE_ID, followUp.noteRowId, followUp.noteText, followUp.noteSourceIds);
        if (demoQuestionTurn) demoQuestionTurn.answered = "added";
      } else if (demoQuestionTurn) {
        demoQuestionTurn.answered = "skipped";
      }
      demoTurns = [...demoTurns];
      demoQuestion = null;
      demoQuestionTurn = null;
      questionIndex = 0;
      questionAnswers = {};
      return;
    }
    await submitQuestionAnswers(answerPayload());
    questionIndex = 0;
    questionAnswers = {};
  }

  async function advanceQuestion() {
    if (isLastQuestion) {
      await finishQuestions();
      return;
    }
    questionIndex += 1;
  }

  // Bound to the form's submit — the explicit-confirm path for a proposal's
  // accept/reject choice and for a typed Other answer.
  async function confirmQuestionStep() {
    if (!currentQuestion || !canSubmitQuestion || $sending) return;
    await advanceQuestion();
  }

  async function skipQuestion() {
    if (!currentQuestion || $sending) return;
    questionAnswers = {
      ...questionAnswers,
      [currentQuestion.id]: {
        question_id: currentQuestion.id,
        status: "skipped",
        choice_id: null,
        text: null,
      },
    };
    if (isLastQuestion) {
      await finishQuestions();
      return;
    }
    questionIndex += 1;
  }

  function backQuestion() {
    if (questionIndex > 0 && !$sending) questionIndex -= 1;
  }

  // Enter sends; Shift+Enter inserts a newline (standard composer behaviour).
  function onKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  // Grow the textarea up to a cap as the user types (mirrors the home bar).
  function autoResize(e) {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 104) + "px";
  }

  function activityLabel(event) {
    return event?.label || event?.headline || $_("agentActivity.working");
  }

  function activityDetail(event) {
    const detail = event?.headline || "";
    return detail && detail !== activityLabel(event) ? detail : "";
  }

  function activitySummary(events) {
    if (!Array.isArray(events) || events.length === 0) return $_("agentActivity.fallback");
    return activityLabel(events[events.length - 1]);
  }

  function hasActivityDetails(events) {
    return Array.isArray(events) && (events.length > 1 || Boolean(activityDetail(events[0])));
  }

  function messageIndex(message) {
    return messages.indexOf(message);
  }

  function md(text) {
    return DOMPurify.sanitize(markdownHtml(text));
  }
</script>

<div
  bind:this={threadWorkspaceEl}
  class="thread-workspace"
  class:artifact-thread={artifactMode}
  class:artifact-resizing={artifactResizing}
  class:state-artifact-closed={artifactMode && workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED}
  class:state-chat-and-artifact={artifactMode && workspaceState === ARTIFACT_WORKSPACE_STATES.CHAT_AND_ARTIFACT}
  class:state-artifact-expanded={artifactMode && workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_EXPANDED}
  class:hasTray={artifactMode && hasArtifactTray}
  style={`--artifact-pane-width: ${artifactPaneWidthPct}%; --tray-width: ${trayDockWidth}px;`}
>
<div class="thread-view" class:landing={isLanding}>
  {#if $threadsLoading && !$currentThread && !$pendingNewChat}
    <div class="state">{$_("common.loading")}</div>
  {:else if !$currentThread && !$pendingNewChat}
    <div class="state">{$_("home.noChatOpen")}</div>
  {:else}
    {#if isLanding}
      <div class="thread-col">
        <h1 class="landing-title">{$_("home.heading")}</h1>
      </div>
    {:else}
      <!-- The scroller spans the full pane so its scrollbar sits at the screen
           edge; the reading column inside stays centered (.thread-col). -->
      <div class="messages" bind:this={listEl}>
        <div class="messages-col thread-col">
        {#each messages as message (messageKey(message))}
          {#if message.role === "user"}
            <div class="row user">
              <div class="user-message">
                {#if message.attachments?.length}
                  <div class="message-attachments" aria-label={$_("home.attachedContext")}>
                    {#each message.attachments as attachment (attachment.type)}
                      <span
                        class="message-attachment-chip"
                        title={attachmentLabel(attachment)}
                      >
                        <span class="attachment-icon" aria-hidden="true">
                          <Icon name={attachmentTypeIcon(attachment.type)} size={14} />
                        </span>
                        <span>{attachmentLabel(attachment)}</span>
                      </span>
                    {/each}
                  </div>
                {/if}
                <div class="bubble user-bubble">{message.content}</div>
              </div>
            </div>
          {:else}
            <div class="row agent">
              <div class="agent-msg">
                {#if message.resolution?.activity?.length}
                  <details
                    class="chat-activity"
                    aria-label={$_("agentActivity.fallback")}
                  >
                    <summary>
                      <span>{activitySummary(message.resolution.activity)}</span>
                      <span class="activity-caret" aria-hidden="true">›</span>
                    </summary>
                    {#if hasActivityDetails(message.resolution.activity)}
                      <div class="chat-activity-list">
                        {#each message.resolution.activity as event}
                          <div class="chat-activity-line">
                            {#if message.resolution.activity.length === 1 && activityDetail(event)}
                              <span>{activityDetail(event)}</span>
                            {:else}
                              <span>{activityLabel(event)}</span>
                              {#if activityDetail(event)}
                                <span class="chat-activity-detail">{activityDetail(event)}</span>
                              {/if}
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </details>
                {/if}

                <div class="agent-text">
                  {#if message.resolution?.output === "chat" && message.resolution.citations?.length}
                    {#each answerSegments(message.content, message.resolution.citations) as segment}{#if segment.type === "citation"}<button
                        type="button"
                        class="citation"
                        class:linked-citation={segment.linkedText}
                        title={segment.citation.explanation || $_("home.sourceLabel", { values: { number: segment.displayNumber } })}
                        aria-label={segment.linkedText
                          ? $_("home.openEvidenceFor", { values: { text: segment.text } })
                          : $_("home.openEvidenceSource", { values: { number: segment.displayNumber } })}
                        on:click={() =>
                          openChatCitationEvidence(segment.citation, {
                            threadId: $currentThread?.id,
                            messageIndex: messageIndex(message),
                            marker: segment.marker,
                          })}
                      >{segment.text}</button>{:else}{@html md(segment.text)}{/if}{/each}
                  {:else}
                    {@html md(message.content)}
                  {/if}
                </div>

                {#if message.resolution}
                  <!-- Dataset-scoped replies disclose the slice. Whole-database
                       answers stay quiet to avoid repeated low-value callouts. -->
                  {#if message.resolution.scope?.disclosure &&
                    scopeDisclosureVariant(message.resolution.scope) === "chip"}
                    <div
                      class="scope-chip"
                      title={$_("home.scopeTitle")}
                    >
                      {message.resolution.scope.disclosure}
                    </div>
                  {/if}

                  {#if message.resolution.output === "table"}
                    <!-- The inline inspector tracks the wrapped run running→done
                         (via the existing run pipeline) and is click-to-open. -->
                    {#if message.resolution.artifact_id}
                      <TableInspector tableId={message.resolution.artifact_id} />
                    {/if}
                  {/if}

                  {#if artifactMode && message.role === "agent"}
                    <AttentionList items={demoAttentionItems} onOpen={openAttentionItem} />
                  {/if}
                {/if}
              </div>
            </div>
          {/if}
        {/each}

        {#if artifactMode && runActive}
          <div class="row user">
            <div class="user-message">
              <div class="bubble user-bubble">{artifactState.runUserText}</div>
            </div>
          </div>
          <div class="row agent">
            <div class="agent-msg agent-msg-full">
              <AgentActivityStream
                events={artifactState.runActivity}
                tablePopulationStatus={runStatus === "running" ? "running" : "done"}
                startedAt={artifactState.runStartedAt}
                endedAt={artifactState.runEndedAt}
                variant="inline"
                collapseOnDone
                startCollapsed
              />

              <button class="run-artifact-chip" type="button" on:click={openDemoArtifact}>
                <Icon name="table" size={16} />
                <span class="chip-title"
                  >{artifactState.artifactTitleOverrides?.[LUNG_MOC_ARTIFACT_ID] ?? AW.artifactTitle}</span
                >
                <span class="chip-status" class:live={runStatus === "running"}>
                  {runStatus === "running" ? AW.chipPopulating : AW.chipReady}
                </span>
              </button>

              {#if runStatus === "done"}
                <div class="agent-text">
                  {AW.opening.usingYour} <strong>{AW.templateName}</strong> {AW.opening.templateColumnsAre} <strong>Annexe 55</strong>
                  {AW.opening.registrationFields(9, 7)}
                </div>
                <AttentionList items={demoAttentionItems} onOpen={openAttentionItem} />
              {/if}
            </div>
          </div>
        {/if}

        {#if artifactMode}
          {#each demoTurns as turn (turn.key)}
            <div class="row user">
              <div class="user-message">
                <div class="bubble user-bubble">{turn.userText}</div>
              </div>
            </div>
            <div class="row agent">
              <div class="agent-msg agent-msg-full">
                <AgentActivityStream
                  events={turn.activity}
                  tablePopulationStatus={turn.status === "streaming" ? "running" : "done"}
                  startedAt={turn.startedAt}
                  endedAt={turn.endedAt}
                  variant="inline"
                  collapseOnDone
                  startCollapsed
                />

                {#if turn.status === "revealed"}
                  {#if turn.followUpId}
                    <FollowUpTurn
                      followUp={followUpById(turn.followUpId)}
                      answered={turn.answered}
                      onSource={openDemoReportTab}
                    />
                  {:else}
                    <div class="agent-text">
                      {AW.agentSurfaceHint}
                    </div>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
        {/if}
        </div>
      </div>
    {/if}

    <!-- Errors surface in BOTH states: a failed first-message send leaves the
         landing in place (no thread was minted), so the error must show here too,
         not only in the conversation. -->
    {#if $threadsError}
      <div class="thread-col">
        <div class="thread-error" role="alert">{$threadsError}</div>
      </div>
    {/if}

    <!-- ONE composer: centered in the landing, pinned to the bottom in the
         conversation (positioned by .thread-view.landing). Mirrors the home
         "bar" and keeps the ARROW send trigger — no Voice. -->
    <div class="thread-col">
    <form
      class="bar"
      class:question-bar={questionRequest}
      on:submit|preventDefault={questionRequest ? confirmQuestionStep : submit}
    >
      {#if questionRequest && currentQuestion}
        <div class="question-mode">
          <div class="question-progress">
            {$_("home.questionProgress", { values: { current: questionIndex + 1, total: questionList.length } })}
          </div>
          <div class="question-text">{currentQuestion.question}</div>
          <div class="question-options">
            {#each currentQuestion.choices || [] as choice}
              <button
                type="button"
                class:selected={currentQuestionAnswer?.choice_id === choice.id}
                class="question-option"
                on:click={() => answerForChoice(choice)}
              >
                {choice.label}
              </button>
            {/each}
            {#if currentQuestion.allow_other}
              {#if currentQuestionAnswer?.choice_id === "other"}
                <input
                  class="question-option question-other-input selected"
                  bind:this={otherInputEl}
                  value={currentQuestionAnswer?.text || ""}
                  on:input={updateOther}
                  placeholder={$_("home.other")}
                />
              {:else}
                <button
                  type="button"
                  class="question-option question-option-other"
                  on:click={selectOther}
                >
                  {$_("home.other")}
                </button>
              {/if}
            {/if}
          </div>
          <div class="question-actions">
            {#if questionIndex > 0}
              <button type="button" class="question-action" on:click={backQuestion} disabled={$sending}>
                {$_("common.back")}
              </button>
            {/if}
            <button type="button" class="question-action" on:click={skipQuestion} disabled={$sending}>
              {$_("common.skip")}
            </button>
            {#if requiresExplicitConfirm}
              <button
                type="submit"
                class="question-action primary"
                disabled={$sending || !canSubmitQuestion}
              >
                {isLastQuestion ? $_("common.submit") : $_("common.next")}
              </button>
            {/if}
          </div>
        </div>
      {:else}
        {#if contextChips.length}
          <div class="artifact-context-row">
            <ContextChip chips={contextChips} onRemove={removeDemoContextChip} />
          </div>
        {/if}
        {#if selectedAttachments.length}
          <div class="attachment-chips" aria-label={$_("home.attachedContext")}>
            {#each selectedAttachments as attachment (attachment.type)}
              <button
                type="button"
                class="attachment-chip"
                on:click={() => removeAttachment(attachment.type)}
                title={$_("common.remove", { values: { label: attachmentLabel(attachment) } })}
                aria-label={$_("common.remove", { values: { label: attachmentLabel(attachment) } })}
              >
                <span class="attachment-icon" aria-hidden="true">
                  <Icon name={attachmentTypeIcon(attachment.type)} size={14} />
                </span>
                <span>{attachmentLabel(attachment)}</span>
                <span aria-hidden="true">×</span>
              </button>
            {/each}
          </div>
        {/if}
        <div class="input-row">
          <div class="attachment-control">
            <button
              type="button"
              class="add-btn"
              title={$_("home.attachContext")}
              aria-label={$_("home.attachContext")}
              aria-expanded={attachmentMenuOpen}
              on:click={toggleAttachmentMenu}
              disabled={$sending}
            >
              <span class="plus">+</span>
            </button>
            {#if attachmentMenuOpen}
              <div class="attachment-menu">
                {#if attachmentError}
                  <div class="attachment-error">{attachmentError}</div>
                {/if}
                <div class="attachment-section">
                  <div class="attachment-heading">{$_("home.datasets")}</div>
                  {#if datasetsLoading}
                    <div class="attachment-empty">{$_("common.loading")}</div>
                  {:else if datasets.length === 0}
                    <div class="attachment-empty">{$_("home.noDatasets")}</div>
                  {:else}
                    {#each datasets as dataset (dataset.id)}
                      <button
                        type="button"
                        class:selected={selectedDatasetId === dataset.id}
                        on:click={() => attachItem("dataset", dataset.id)}
                      >
                        <Icon name={attachmentTypeIcon("dataset")} size={16} />
                        <span>{dataset.name}</span>
                      </button>
                    {/each}
                  {/if}
                </div>
                <div class="attachment-section">
                  <div class="attachment-heading">{$_("leftPanel.templates")}</div>
                  {#if $templatesLoading}
                    <div class="attachment-empty">{$_("common.loading")}</div>
                  {:else if $templates.length === 0}
                    <div class="attachment-empty">{$_("home.noTemplates")}</div>
                  {:else}
                    {#each $templates as template (template.id)}
                      <button
                        type="button"
                        class:selected={selectedTemplateId === template.id}
                        on:click={() => attachItem("template", template.id)}
                      >
                        <Icon name={attachmentTypeIcon("template")} size={16} />
                        <span>{template.name}</span>
                      </button>
                    {/each}
                  {/if}
                </div>
              </div>
            {/if}
          </div>
          <textarea
            class="bar-input"
            rows="1"
            bind:this={inputEl}
            bind:value={draft}
            on:input={autoResize}
            on:keydown={onKeydown}
            placeholder={$_("home.askAnything")}
            disabled={$sending}
          ></textarea>
          {#if demoRunning}
            <!-- The composer owns stop while the agent streams (ChatGPT-style). -->
            <button
              type="button"
              class="send-btn"
              on:click={stopDemoRun}
              aria-label={$_("activity.stopTablePopulation")}
              title={$_("activity.stopTablePopulation")}
            >
              <Icon name="stop" size={16} />
            </button>
          {:else}
            <button
              type="button"
              class="send-btn"
              on:click={submit}
              disabled={$sending || (!draft.trim() && contextChips.length === 0)}
              aria-label={$_("common.send")}>→</button
            >
          {/if}
        </div>
      {/if}
    </form>
    </div>
  {/if}
</div>
{#if artifactMode}
  {#if workspaceState === ARTIFACT_WORKSPACE_STATES.ARTIFACT_CLOSED}
    {#if hasArtifactTray}
      <!-- Floated over the right edge (not a grid column). Its measured width
           feeds --tray-width so the chat treats it as a docked neighbour while
           the left panel is open (see .thread-col's centering rule). -->
      <div class="tray-float" bind:clientWidth={trayFloatWidth}>
        <ArtifactTray
          artifacts={visibleArtifacts}
          onOpen={openDemoArtifact}
          onTogglePin={toggleDemoArtifactPin}
          onRename={renameDemoArtifact}
          onDelete={removeDemoArtifact}
        />
      </div>
    {/if}
  {:else}
    <ArtifactBox
      state={artifactState}
      {tabs}
      {activeTab}
      {form}
      {patients}
      {streaming}
      {noteDoc}
      {evidence}
      onActivateTab={activateDemoTab}
      onCloseTab={closeDemoTab}
      onToggleFold={toggleDemoChatFold}
      onClose={closeDemoArtifact}
      onEvidenceClose={closeDemoEvidence}
      onReference={openDemoReportTab}
      onSelectPatient={selectDemoPatient}
      onEdit={(fieldId, value) => editDemoField(LUNG_MOC_TABLE_ID, artifactState.selectedPatientId, fieldId, value)}
      onSource={openDemoFieldSource}
      onFieldPick={(fieldId, anchor) =>
        toggleDemoPendingContextCell(LUNG_MOC_TABLE_ID, artifactState.selectedPatientId, fieldId, anchor)}
      contextCaptureMode={artifactState.contextCaptureMode}
      onContextToggle={toggleDemoContextCapture}
      onContextSend={submit}
      onContextCommit={commitDemoContextChip}
      resizable={workspaceState === ARTIFACT_WORKSPACE_STATES.CHAT_AND_ARTIFACT}
      resizeActive={artifactResizing}
      onResizeStart={startArtifactResize}
    />
  {/if}
{/if}
</div>

<style>
  .thread-workspace {
    height: 100%;
    min-height: 0;
    width: 100%;
  }

  .thread-workspace.artifact-thread {
    --screen-margin: var(--space-6);
    --artifact-radius: var(--radius-md);
    --artifact-chat-width: 704px;
    container-type: inline-size;
    display: grid;
    grid-template-columns: minmax(0, min(100%, var(--artifact-chat-width))) minmax(220px, 280px);
    align-items: stretch;
    justify-content: center;
    gap: 0;
    padding: 0;
    background: var(--color-bg);
    transition:
      grid-template-columns 260ms cubic-bezier(0.22, 0.61, 0.36, 1),
      gap 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }

  .thread-workspace.artifact-thread.state-chat-and-artifact {
    grid-template-columns: minmax(0, 1fr) minmax(0, var(--artifact-pane-width, 50%));
    justify-content: stretch;
  }

  .thread-workspace.artifact-thread.artifact-resizing {
    cursor: col-resize;
    user-select: none;
    transition: none;
  }

  /* Artifact closed: ONE full-width column (the tray floats over the right
     edge), so the chat column inside can center itself on the screen. */
  .thread-workspace.artifact-thread.state-artifact-closed {
    position: relative;
    grid-template-columns: minmax(0, 1fr);
    justify-content: stretch;
  }

  .tray-float {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 5;
  }

  .thread-workspace.artifact-thread.state-artifact-expanded {
    grid-template-columns: minmax(0, 0fr) minmax(0, 1fr);
    gap: 0;
  }

  .thread-workspace.artifact-thread .thread-view {
    margin: 0;
    --thread-col-width: var(--artifact-chat-width);
    transition:
      opacity var(--dur) var(--ease),
      visibility var(--dur) var(--ease);
  }

  /* With the artifact open, the chat pane is a grid column, deliberately NOT
     screen-centered — center within the pane regardless of the left panel. */
  .thread-workspace.artifact-thread.state-chat-and-artifact .thread-view,
  .thread-workspace.artifact-thread.state-artifact-expanded .thread-view {
    --thread-col-offset: calc((100% - var(--thread-col-box)) / 2);
  }

  .thread-workspace.artifact-thread.state-artifact-expanded .thread-view {
    width: 0;
    opacity: 0;
    overflow: hidden;
    pointer-events: none;
    visibility: hidden;
  }

  .thread-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    width: 100%;
    /* Horizontal padding lives on .thread-col, not here, so the messages
       scroller reaches the pane's right edge (scrollbar at the screen edge). */
    padding: var(--screen-margin, var(--space-6)) 0;
    gap: var(--space-4);
    /* Reading-column width + its left offset. ONE rule drives every state:
       the chat centers between whatever is DOCKED beside it — the open left
       panel (the pane already starts at its edge), the artifact tray
       (--tray-width, 0 when absent), or the artifact box (the pane ends at
       its edge). Exception below: with the panel FOLDED and no artifact, the
       rail and the tray are floating chrome, nothing is docked, so the chat
       centers on the entire screen. */
    --thread-col-box: min(100%, var(--thread-col-width, var(--content-width)));
    --thread-col-offset: clamp(
      0px,
      calc((100% - var(--tray-width, 0px) - var(--thread-col-box)) / 2),
      calc(100% - var(--thread-col-box))
    );
  }

  /* Panel folded + no artifact: nothing is docked — center on the SCREEN
     (50vw), compensating for the floating rail. .thread-col's margin
     transition glides between the two positions on fold/unfold. */
  :global(html.left-panel-collapsed) .thread-view {
    --thread-col-offset: clamp(
      0px,
      calc(50vw - var(--left-panel-width, 0px) - (var(--thread-col-box) / 2)),
      calc(100% - var(--thread-col-box))
    );
  }

  /* One centered reading column: caps at the column width, positioned by the
     offset above. Inner padding keeps content off the edges when narrow. The
     margin transition matches the panel's width animation so a panel toggle
     glides the column instead of jumping it. */
  .thread-col {
    flex: 0 0 auto;
    width: 100%;
    max-width: var(--thread-col-width, var(--content-width));
    box-sizing: border-box;
    padding: 0 var(--screen-margin, var(--space-6));
    margin-left: var(--thread-col-offset);
    margin-right: auto;
    transition: margin-left var(--dur) var(--ease);
  }
  /* Landing: heading + composer centered in the screen (the clean "new audit"
     entry). On the first send the chat leaves this state and the composer drops
     to the bottom. */
  .thread-view.landing {
    justify-content: center;
    gap: var(--space-6);
  }

  .state {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    text-align: center;
    padding: var(--space-8) 0;
  }

  .landing-title {
    margin: 0;
    text-align: center;
    font-size: var(--text-2xl);
    font-weight: var(--weight-normal);
    letter-spacing: -0.01em;
    color: var(--color-text);
  }

  .messages {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .messages-col {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .row {
    display: flex;
  }
  .row.user {
    justify-content: flex-end;
  }
  .row.agent {
    justify-content: flex-start;
  }

  /* User = a quiet rounded bubble on the right. */
  .user-message {
    max-width: 80%;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-1);
  }
  .user-bubble {
    max-width: 100%;
    /* Surface white on the gray thread canvas, hairline border — the same
       card language as the chips, one radius across the thread. */
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    border-radius: var(--radius-lg);
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-base);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Agent = plain text on the left, NO bubble (the clean chat look). The
     resolution elements (scope chip, inspector, seam) stack below the text. */
  .agent-msg {
    max-width: 90%;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* Demo turns that lead with the agent-activity box: span the full column so
     the box lines up with the composer's width; text below stays left-aligned. */
  .agent-msg-full {
    width: 100%;
    max-width: 100%;
  }

  /* The click-to-open matrix chip shown during/after the streamed opening. */
  .run-artifact-chip {
    align-self: flex-start;
    max-width: 100%;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-text);
    text-align: left;
    transition:
      border-color var(--dur-fast) var(--ease),
      background var(--dur-fast) var(--ease);
  }

  .run-artifact-chip:hover,
  .run-artifact-chip:focus-visible {
    border-color: var(--color-border-strong);
    background: var(--color-surface-muted);
  }

  .run-artifact-chip :global(.icon) {
    flex-shrink: 0;
    color: var(--color-text-secondary);
  }

  .run-artifact-chip .chip-title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .run-artifact-chip .chip-status {
    flex-shrink: 0;
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--color-surface-muted);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .run-artifact-chip .chip-status.live {
    background: var(--color-accent-weak);
    color: var(--color-accent);
  }
  .agent-text {
    color: var(--color-text);
    font-size: var(--text-base);
    line-height: 1.6;
    white-space: normal;
    word-break: break-word;
  }
  .agent-text :global(p) {
    margin: 0 0 var(--space-2);
  }
  .agent-text :global(p:last-child) {
    margin-bottom: 0;
  }
  .agent-text :global(ul),
  .agent-text :global(ol) {
    margin: var(--space-2) 0;
    padding-left: var(--space-5);
  }
  .agent-text :global(hr) {
    border: 0;
    border-top: 1px solid var(--color-border);
    margin: var(--space-3) 0;
  }
  .agent-text :global(code) {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.92em;
    background: var(--color-surface-muted);
    border-radius: 3px;
    padding: 0 3px;
  }
  .agent-text :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: var(--space-2) 0;
    font-size: var(--text-sm);
  }
  .agent-text :global(th),
  .agent-text :global(td) {
    border-bottom: 1px solid var(--color-border);
    padding: 6px 8px;
    text-align: left;
    vertical-align: top;
  }
  .agent-text :global(th) {
    color: var(--color-text-secondary);
    font-weight: var(--weight-semibold);
  }
  .agent-text :global(.align-right) {
    text-align: right;
  }
  .agent-text :global(.align-center) {
    text-align: center;
  }

  /* A quiet, low-emphasis disclosure of the answer's scope. */
  .scope-chip {
    align-self: flex-start;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    padding: 2px var(--space-3);
  }

  .citation {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.9em;
    min-width: 1.9em;
    height: 1.9em;
    border: 1px solid color-mix(in srgb, var(--color-accent) 35%, transparent);
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-accent) 10%, transparent);
    margin-left: 0.25em;
    margin-right: 0.1em;
    padding: 0;
    font: inherit;
    font-size: 0.78em;
    font-weight: var(--weight-normal);
    line-height: 1;
    color: var(--color-accent);
    cursor: pointer;
    text-decoration: none;
    vertical-align: baseline;
    white-space: nowrap;
  }
  .citation.linked-citation {
    display: inline;
    width: auto;
    min-width: 0;
    height: auto;
    border: 0;
    border-radius: 0;
    background: transparent;
    margin: 0;
    padding: 0;
    font-size: inherit;
    line-height: inherit;
    color: var(--color-accent);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
    vertical-align: baseline;
    white-space: normal;
  }
  .citation:hover {
    background: color-mix(in srgb, var(--color-accent) 16%, transparent);
    border-color: color-mix(in srgb, var(--color-accent) 55%, transparent);
  }
  .citation.linked-citation:hover {
    background: transparent;
    border-color: transparent;
    color: color-mix(in srgb, var(--color-accent) 80%, black);
  }

  .chat-activity {
    display: block;
    max-width: min(520px, 100%);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }
  .chat-activity summary {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    position: relative;
    cursor: pointer;
    list-style: none;
  }
  .chat-activity summary::-webkit-details-marker {
    display: none;
  }
  .activity-caret {
    display: inline-flex;
    align-items: center;
    color: var(--color-text-muted);
    transform: rotate(0deg);
    transition: transform var(--dur-fast) var(--ease);
  }
  .chat-activity[open] .activity-caret {
    transform: rotate(90deg);
  }
  .chat-activity summary:hover span {
    text-decoration: underline;
  }
  .chat-activity-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: var(--space-1);
  }
  .chat-activity-line {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .chat-activity-line span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chat-activity-detail {
    color: var(--color-text-muted);
  }

  .thread-error {
    color: var(--color-danger);
    font-size: var(--text-sm);
    text-align: center;
  }

  /* Composer — mirrors the home "bar": a rounded surface with the +, the input,
     and the arrow on one row. */
  .bar {
    display: flex;
    flex-direction: column;
    width: 100%;
    flex: 0 0 auto;
    box-sizing: border-box;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
  }
  .bar:focus-within {
    border-color: var(--color-border-strong);
  }
  .artifact-context-row {
    display: flex;
    min-width: 0;
    padding: var(--space-2) var(--space-2) 0;
  }
  .attachment-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) 0;
  }
  .attachment-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    max-width: 100%;
    min-height: 28px;
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-surface-muted);
    color: var(--color-text);
    font-size: var(--text-xs);
  }
  .attachment-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--color-text-muted);
  }
  .attachment-chip span:nth-child(2) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .message-attachments {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-1);
    max-width: 100%;
  }
  .message-attachment-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 22px;
    max-width: 100%;
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-surface);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }
  .message-attachment-chip span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .message-attachment-chip .attachment-icon {
    color: var(--color-text-muted);
  }
  .input-row {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    padding: var(--space-2);
  }
  .attachment-control {
    position: relative;
    flex-shrink: 0;
  }
  .attachment-menu {
    position: absolute;
    left: 0;
    bottom: calc(100% + var(--space-2));
    z-index: 5;
    width: min(320px, calc(100vw - var(--space-8)));
    max-height: 360px;
    overflow-y: auto;
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-lg);
  }
  .attachment-section + .attachment-section {
    margin-top: var(--space-3);
  }
  .attachment-heading {
    padding: var(--space-1) var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
  }
  .attachment-section button {
    width: 100%;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: var(--text-sm);
    text-align: left;
  }
  .attachment-section button:hover,
  .attachment-section button.selected {
    background: var(--color-hover);
  }
  .attachment-section button span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .attachment-empty,
  .attachment-error {
    padding: var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }
  .attachment-error {
    color: var(--color-danger);
  }
  .bar-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    font: inherit;
    font-size: var(--text-base);
    line-height: 1.4;
    color: var(--color-text);
    resize: none;
    outline: none;
    padding: var(--space-1);
    min-height: 24px;
    max-height: 104px;
    overflow-y: auto;
  }
  .bar-input:focus {
    box-shadow: none;
  }
  .bar-input::placeholder {
    color: var(--color-text-faint);
  }

  .add-btn,
  .send-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .add-btn {
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 22px;
  }
  .add-btn:hover {
    background: var(--color-hover);
  }
  .add-btn .plus {
    display: block;
    line-height: 1;
    transform: translateY(-1px);
  }

  .send-btn {
    background: var(--color-primary);
    color: var(--color-on-primary);
    font-size: 16px;
    font-weight: var(--weight-bold);
    transition: background var(--dur-fast) var(--ease);
  }
  .send-btn:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }
  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .question-bar {
    padding: var(--space-2);
  }
  .question-mode {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
  }
  .question-progress {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }
  .question-text {
    color: var(--color-text);
    font-size: var(--text-base);
    line-height: 1.45;
  }
  .question-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .question-option {
    width: 100%;
    min-height: 36px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-muted);
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-sm);
    line-height: 1.35;
    text-align: left;
    padding: var(--space-2) var(--space-3);
    box-sizing: border-box;
  }
  .question-option:hover,
  .question-option.selected {
    border-color: var(--color-border-strong);
    background: var(--color-surface);
  }
  .question-option-other,
  .question-other-input::placeholder {
    color: var(--color-text-faint);
  }
  .question-other-input {
    outline: none;
  }
  .question-other-input:focus {
    border-color: var(--color-border-strong);
    background: var(--color-surface);
  }
  .question-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-2);
  }
  .question-action {
    min-height: 32px;
    border-radius: var(--radius-md);
    padding: 0 var(--space-3);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }
  .question-action:hover:not(:disabled) {
    background: var(--color-hover);
  }
  .question-action.primary {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }
  .question-action.primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }
  .question-action:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
