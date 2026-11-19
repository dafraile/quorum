import { BookOpen, HelpCircle, NotebookPen, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { negativeAgentId, studyAgentById } from "../../shared/studyRoster";
import type { AgentKey, Debrief, Round, Verdict } from "../../shared/studyTypes";
import {
  StudyApiError,
  fetchClerkCandidates,
  fetchClerkReply,
  fetchClerkSummary,
  fetchContribution,
  fetchDebate,
  fetchDebrief,
  fetchPatientReply,
  fetchStaticFloor,
  logEvent,
  streamChat,
  type ChatRequest,
} from "./api";
import { CardWindow, ClerkPaper, FloorWindow, Ledger, PatientPane, PinTray, RecordPane, Table, listNames, patientPronouns } from "./Chamber";
import { Tour, type TourStep } from "./Tour";
import { changeOptions, confidenceOptions } from "./content";
import { FinalPlanView, FloorPointsEditor, SummarySheet, WorkingPlanEditor, WorkingPlanView } from "./Plan";
import {
  activeAgents,
  createId,
  debateLineFor,
  minutesOf,
  now,
  patientUtterances,
  pinLine,
  proceedingsOf,
  questionsLeft,
  roundBudget,
  roundNames,
  secondsSince,
  threadFor,
  verdictLabels,
  workingOf,
  type CandidateState,
  type CaseSlot,
  type CaseState,
  type FloorPoint,
  type Line,
  type Opening,
  type Pin,
  type Seat,
  type WorkingPlan,
} from "./state";

type CaseViewProps = {
  slot: CaseSlot;
  caseIndex: number;
  caseCount: number;
  caseState: CaseState;
  updateCase: (updater: (current: CaseState) => CaseState) => void;
  onFinished: () => void;
};

const patientMotionGapMs = 30_000;

export function CaseView({ slot, caseIndex, caseCount, caseState, updateCase, onFinished }: CaseViewProps) {
  // Latest state for async callbacks and timers (props are stale inside closures).
  const stateRef = useRef(caseState);
  stateRef.current = caseState;
  const style = slot.openingStyle ?? "paragraph";
  const log = (type: string, data?: unknown) => logEvent(type, data, caseIndex);

  const patchLine = (id: string, patch: Partial<Line> | ((line: Line) => Partial<Line>)) =>
    updateCase((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === id ? { ...line, ...(typeof patch === "function" ? patch(line) : patch) } : line)),
    }));

  const patchOpening = (agentId: AgentKey, patch: Partial<Opening>) =>
    updateCase((current) => ({
      ...current,
      openings: { ...current.openings, [agentId]: { ...current.openings[agentId]!, ...patch } },
    }));

  // ------------------------------------------------------------ openings

  const loadStatic = async (only?: AgentKey) => {
    try {
      const { contributions } = await fetchStaticFloor(caseIndex);
      for (const item of contributions) {
        if (only && item.agentId !== only) continue;
        patchOpening(item.agentId, { ...item, status: "ready", error: undefined });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load";
      for (const agentId of only ? [only] : activeAgents(stateRef.current)) patchOpening(agentId, { status: "error", error: message });
    }
  };

  const loadLive = async (agentId: AgentKey) => {
    try {
      const result = await fetchContribution({ caseIndex, agentId, requestId: createId("open") });
      patchOpening(agentId, { ...result, status: "ready", error: undefined });
    } catch (error) {
      patchOpening(agentId, { status: "error", error: error instanceof Error ? error.message : "Could not load" });
    }
  };

  const retryOpening = (agentId: AgentKey) => {
    patchOpening(agentId, { status: "loading", error: undefined });
    void (slot.floorSource === "static" ? loadStatic(agentId) : loadLive(agentId));
  };

  const openChamber = (precommit: { diagnosis: string; plan: string; confidence: number }) => {
    const openedAt = now();
    const openings = Object.fromEntries(
      activeAgents(stateRef.current).map((agentId) => [
        agentId,
        { agentId, answer: "", keyPoints: [], hook: "", source: slot.floorSource, status: "loading" } satisfies Opening,
      ]),
    );
    updateCase((current) => ({
      ...current,
      precommit: { ...precommit, at: openedAt },
      working: { diagnosis: precommit.diagnosis, plan: precommit.plan, notes: "" },
      phase: "chamber",
      round: 1,
      floorOpenedAt: openedAt,
      roundStartedAt: { 1: openedAt },
      openings,
      focus: "intern",
    }));
    void log("precommit_submitted", {
      ...precommit,
      confidenceLabel: confidenceOptions[precommit.confidence - 1],
      secondsOnRecord: secondsSince(caseState.startedAt),
    });
    void log("floor_opened", { floorSource: slot.floorSource, mode: slot.mode, caseId: slot.caseId, openingStyle: style });
    if (slot.floorSource === "static") void loadStatic();
    else Object.keys(openings).forEach((agentId) => void loadLive(agentId as AgentKey));
  };

  // ------------------------------------------------------------ talking at the table

  const withdrawAdvocate = (trigger: string) => {
    if (stateRef.current.advocateWithdrawnAt) return;
    const at = now();
    stateRef.current = { ...stateRef.current, advocateWithdrawnAt: at };
    updateCase((current) => (current.advocateWithdrawnAt ? current : { ...current, advocateWithdrawnAt: at }));
    void log("advocate_withdrawn", { trigger, round: stateRef.current.round });
  };

  const chatRequest = (current: CaseState, agentId: AgentKey, kind: ChatRequest["kind"], message: string, motionId?: string): ChatRequest => {
    const opening = current.openings[agentId];
    return {
      caseIndex,
      round: current.round,
      agentId,
      kind,
      message,
      motionId,
      requestId: createId("chat"),
      thread: threadFor(current, agentId),
      opening: opening?.status === "ready" ? { answer: opening.answer, hook: opening.hook } : undefined,
      proceedings: current.round > 1 ? proceedingsOf(current, style, current.round) : undefined,
      debateStatement: debateLineFor(current, agentId)?.text || undefined,
      patientUtterances: slot.mode === "triadic" ? patientUtterances(current) : undefined,
    };
  };

  const streamInto = async (lineId: string, request: ChatRequest) => {
    patchLine(lineId, { text: "", status: "streaming", error: undefined });
    try {
      const text = await streamChat(request, (delta) => patchLine(lineId, (line) => ({ text: line.text + delta })));
      patchLine(lineId, { text, status: "done" });
    } catch (error) {
      patchLine(lineId, { status: "error", error: error instanceof Error ? error.message : "No answer" });
    }
  };

  const agentLine = (agentId: AgentKey, kind: Line["kind"], round: Round, motionId?: string): Line => ({
    id: createId("line"),
    round,
    speaker: agentId,
    kind,
    motionId,
    text: "",
    status: "streaming",
    at: now(),
  });

  const hearOut = (agentId: AgentKey) => {
    const current = stateRef.current;
    const line = agentLine(agentId, "hook-reply", 1);
    updateCase((state) => ({
      ...state,
      lines: [...state.lines, line],
      openings: { ...state.openings, [agentId]: { ...state.openings[agentId]!, heardAt: now() } },
    }));
    void log("hook_opened", { agentId, lineId: line.id });
    void streamInto(line.id, chatRequest(current, agentId, "hook", ""));
  };

  const askPatient = async (question: string) => {
    const current = stateRef.current;
    const chairLine: Line = { id: createId("line"), round: current.round, speaker: "chair", to: "patient", kind: "patient-question", text: question, status: "done", at: now() };
    const reply: Line = { id: createId("line"), round: current.round, speaker: "patient", kind: "patient-reply", text: "", status: "streaming", at: now() };
    updateCase((state) => ({ ...state, lines: [...state.lines, chairLine, reply] }));
    void log("patient_question", { question, round: current.round, lineId: chairLine.id, secondsSinceFloorOpened: secondsSince(current.floorOpenedAt) });
    await answerPatient(reply.id, question);
  };

  const answerPatient = async (replyId: string, question: string) => {
    const current = stateRef.current;
    const history = current.lines
      .filter((line) => (line.to === "patient" || line.speaker === "patient") && line.status === "done" && line.kind !== "patient-motion")
      .map((line) => ({ role: line.speaker === "patient" ? ("patient" as const) : ("chair" as const), text: line.text }))
      .slice(0, -1);
    const floorSummary = current.lines
      .filter((line) => line.speaker !== "chair" && line.speaker !== "patient" && line.status === "done")
      .slice(-12)
      .map((line) => `${studyAgentById(line.speaker as AgentKey).shortName}: ${line.text.slice(0, 280)}`);
    patchLine(replyId, { status: "streaming", error: undefined });
    try {
      const { reply } = await fetchPatientReply({ caseIndex, question, history, floorSummary });
      patchLine(replyId, { text: reply, status: "done" });
      withdrawAdvocate("patient_reply");
    } catch (error) {
      patchLine(replyId, { status: "error", error: error instanceof Error ? error.message : "No answer" });
    }
  };

  const ask = (seat: Seat, text: string) => {
    const current = stateRef.current;
    if (seat === "patient") {
      void askPatient(text);
      return;
    }
    if (current.round === 3 || questionsLeft(current) <= 0) return;
    const round = current.round as 1 | 2;
    const motionId = seat === "floor" ? createId("motion") : undefined;
    const chairLine: Line = {
      id: createId("line"),
      round,
      speaker: "chair",
      to: seat,
      kind: seat === "floor" ? "motion" : "question",
      motionId,
      text,
      status: "done",
      at: now(),
    };
    const targets = seat === "floor" ? activeAgents(current) : [seat];
    const replies = targets.map((agentId) => agentLine(agentId, "reply", round, motionId));
    const next: CaseState = {
      ...current,
      lines: [...current.lines, chairLine, ...replies],
      questionsUsed: { ...current.questionsUsed, [round]: current.questionsUsed[round] + 1 },
    };
    stateRef.current = next;
    updateCase((state) => ({
      ...state,
      lines: [...state.lines, chairLine, ...replies],
      questionsUsed: { ...state.questionsUsed, [round]: state.questionsUsed[round] + 1 },
    }));
    void log("motion_filed", { lineId: chairLine.id, motionId, round, target: seat, targets, text, filedBy: "chair" });
    replies.forEach((line, index) =>
      void streamInto(line.id, chatRequest(current, targets[index], seat === "floor" ? "motion" : "question", text, motionId)),
    );
  };

  const retryLine = (lineId: string) => {
    const current = stateRef.current;
    const line = current.lines.find((item) => item.id === lineId);
    if (!line) return;
    if (line.speaker === "patient") {
      const question = [...current.lines].reverse().find((item) => item.to === "patient" && Date.parse(item.at) <= Date.parse(line.at));
      if (question) void answerPatient(lineId, question.text);
      return;
    }
    const agentId = line.speaker as AgentKey;
    if (line.kind === "hook-reply") {
      void streamInto(lineId, chatRequest(current, agentId, "hook", ""));
      return;
    }
    if (line.kind === "debate") {
      void runDebateFor(agentId, lineId);
      return;
    }
    const patientMotion = line.motionId ? current.lines.find((item) => item.id === line.motionId && item.kind === "patient-motion") : undefined;
    const prompt = patientMotion ?? current.lines.find((item) => item.speaker === "chair" && (line.motionId ? item.motionId === line.motionId : item.to === agentId && Date.parse(item.at) <= Date.parse(line.at)));
    if (!prompt) return;
    void log("line_retry", { lineId, agentId });
    void streamInto(lineId, chatRequest(current, agentId, patientMotion ? "patient-motion" : line.motionId ? "motion" : "question", prompt.text, line.motionId));
  };

  const focus = (seat: Seat) => {
    if (stateRef.current.focus === seat) return;
    updateCase((current) => ({ ...current, focus: seat }));
    void log("seat_focused", { seat, round: stateRef.current.round });
  };

  // ------------------------------------------------------------ the patient's own Motions (triadic)

  useEffect(() => {
    if (slot.mode !== "triadic" || caseState.phase !== "chamber") return;
    const tick = () => {
      const current = stateRef.current;
      if (!current.floorOpenedAt || current.round === 3 || current.pendingPatientMotion) return;
      const lastMotion = [...current.lines].reverse().find((line) => line.kind === "patient-motion");
      if (lastMotion && Date.now() - Date.parse(lastMotion.at) < patientMotionGapMs) return;
      const seconds = (Date.now() - Date.parse(current.floorOpenedAt)) / 1000;
      const interactions = current.lines.filter((line) => line.speaker === "chair").length;
      const next = slot.case.patientMotions.find(
        (motion) =>
          !current.firedPatientMotions.includes(motion.id) &&
          ((motion.trigger.afterInteractions !== undefined && interactions >= motion.trigger.afterInteractions) ||
            (motion.trigger.afterSeconds !== undefined && seconds >= motion.trigger.afterSeconds)),
      );
      if (!next) return;
      const line: Line = { id: createId("line"), round: current.round, speaker: "patient", kind: "patient-motion", text: next.text, status: "done", at: now() };
      stateRef.current = { ...current, firedPatientMotions: [...current.firedPatientMotions, next.id], lines: [...current.lines, line], pendingPatientMotion: { lineId: line.id, text: next.text } };
      updateCase((state) =>
        state.firedPatientMotions.includes(next.id)
          ? state
          : {
              ...state,
              firedPatientMotions: [...state.firedPatientMotions, next.id],
              lines: [...state.lines, line],
              pendingPatientMotion: { lineId: line.id, text: next.text },
            },
      );
      void log("patient_motion_filed", { lineId: line.id, patientMotionId: next.id, text: next.text, seconds: Math.round(seconds), interactions, round: current.round });
      withdrawAdvocate("patient_motion");
    };
    tick();
    const timer = window.setInterval(tick, 2000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.mode, caseState.phase]);

  const putPatientMotion = () => {
    const current = stateRef.current;
    const pending = current.pendingPatientMotion;
    if (!pending) return;
    const targets = activeAgents(current);
    const replies = targets.map((agentId) => agentLine(agentId, "reply", current.round, pending.lineId));
    updateCase((state) => ({ ...state, pendingPatientMotion: undefined, lines: [...state.lines, ...replies], focus: "floor" }));
    void log("motion_filed", { motionId: pending.lineId, round: current.round, target: "floor", targets, text: pending.text, filedBy: "patient" });
    replies.forEach((line, index) => void streamInto(line.id, chatRequest(current, targets[index], "patient-motion", pending.text, pending.lineId)));
  };

  const notePatientMotion = () => {
    const pending = stateRef.current.pendingPatientMotion;
    updateCase((state) => ({ ...state, pendingPatientMotion: undefined }));
    void log("patient_motion_noted", { lineId: pending?.lineId });
  };

  // ------------------------------------------------------------ pins

  const pin = (sourceId: string, agentId: AgentKey, quote: string) => {
    const trimmed = quote.trim();
    if (!trimmed || stateRef.current.pins.some((item) => item.quote === trimmed)) return;
    const item: Pin = { id: createId("pin"), sourceId, agentId, quote: trimmed, round: stateRef.current.round, at: now() };
    updateCase((state) => ({ ...state, pins: [...state.pins, item] }));
    void log("pin_added", { pinId: item.id, sourceId, agentId, quote: trimmed, round: item.round, whole: sourceText(sourceId) === trimmed });
  };

  const sourceText = (sourceId: string) => {
    const current = stateRef.current;
    if (sourceId.startsWith("open-")) {
      const opening = current.openings[sourceId.slice(5) as AgentKey];
      return style === "hook" ? opening?.hook : opening?.answer;
    }
    return current.lines.find((line) => line.id === sourceId)?.text;
  };

  const unpin = (item: Pin) => {
    updateCase((state) => ({ ...state, pins: state.pins.filter((pinItem) => pinItem.id !== item.id) }));
    void log("pin_removed", { pinId: item.id, agentId: item.agentId, quote: item.quote, wording: item.wording, round: stateRef.current.round });
  };

  const editPin = (item: Pin, wording: string | undefined) => {
    updateCase((state) => ({ ...state, pins: state.pins.map((pinItem) => (pinItem.id === item.id ? { ...pinItem, wording } : pinItem)) }));
    void log("pin_edited", { pinId: item.id, agentId: item.agentId, quote: item.quote, wording, previousWording: item.wording, round: stateRef.current.round });
  };

  // ------------------------------------------------------------ the Chair's working plan

  const saveWorking = (next: WorkingPlan, where: "drawer" | "between-rounds") => {
    const current = stateRef.current;
    const before = workingOf(current);
    const changed = (["diagnosis", "plan", "notes"] as const).filter((key) => next[key] !== before[key]);
    if (!changed.length) return;
    const working = { diagnosis: next.diagnosis, plan: next.plan, notes: next.notes, updatedAt: now() };
    stateRef.current = { ...current, working };
    updateCase((state) => ({ ...state, working }));
    void log("plan_revised", { round: current.round, where, changed, diagnosis: working.diagnosis, plan: working.plan, notes: working.notes });
  };

  // ------------------------------------------------------------ round 2: the debate

  const runDebateFor = async (agentId: AgentKey, lineId: string) => {
    const current = stateRef.current;
    patchLine(lineId, { status: "streaming", error: undefined, text: "" });
    try {
      const result = await fetchDebate({
        caseIndex,
        agentId,
        others: activeAgents(current).filter((id) => id !== agentId),
        proceedings: proceedingsOf(current, style, 1),
        pinned: current.pins.map(pinLine),
        patientUtterances: slot.mode === "triadic" ? patientUtterances(current) : undefined,
        requestId: lineId,
      });
      patchLine(lineId, { text: result.statement, stances: result.stances, status: "done" });
    } catch (error) {
      patchLine(lineId, { status: "error", error: error instanceof Error ? error.message : "No statement" });
    }
  };

  const callDebate = async () => {
    const current = stateRef.current;
    const at = now();
    const lines = activeAgents(current).map((agentId) => agentLine(agentId, "debate", 2));
    stateRef.current = { ...current, round: 2, debateStatus: "loading", lines: [...current.lines, ...lines] };
    updateCase((state) => ({
      ...state,
      round: 2,
      roundStartedAt: { ...state.roundStartedAt, 2: at },
      debateStatus: "loading",
      lines: [...state.lines, ...lines],
      focus: "floor",
    }));
    void log("round_called", { round: 2, questionsUsedInRound1: current.questionsUsed[1], pins: current.pins.length, secondsInRound: secondsSince(current.roundStartedAt[1]) });
    await Promise.all(lines.map((line) => runDebateFor(line.speaker as AgentKey, line.id)));
    updateCase((state) => ({ ...state, debateStatus: "ready" }));
  };

  // ------------------------------------------------------------ round 3: synthesis with the Clerk

  const pinCandidates = (current: CaseState): CandidateState[] =>
    current.pins.map((item) => ({
      id: `pin-${item.id}`,
      origin: "pin",
      agentIds: [item.agentId],
      quote: item.quote,
      summary: "",
      wording: item.wording,
      sourceLineId: item.sourceId,
    }));

  const gatherCandidates = async () => {
    const current = stateRef.current;
    updateCase((state) => ({ ...state, candidatesStatus: "loading", candidatesError: undefined }));
    try {
      const { candidates } = await fetchClerkCandidates({
        caseIndex,
        proceedings: proceedingsOf(current, style, 2),
        pinned: current.pins.map((item) => ({ agentId: item.agentId, quote: item.quote })),
      });
      const all: CandidateState[] = [...pinCandidates(current), ...candidates];
      updateCase((state) => ({ ...state, candidatesStatus: "ready", candidates: all }));
      void log("candidates_shown", { candidates: all.map(({ id, origin, agentIds, quote, summary, wording }) => ({ id, origin, agentIds, quote, summary, wording })) });
    } catch (error) {
      updateCase((state) => ({ ...state, candidatesStatus: "error", candidatesError: error instanceof Error ? error.message : "Could not gather" }));
    }
  };

  const callSynthesis = () => {
    const current = stateRef.current;
    const at = now();
    updateCase((state) => ({ ...state, round: 3, roundStartedAt: { ...state.roundStartedAt, 3: at }, pendingPatientMotion: undefined }));
    void log("round_called", { round: 3, questionsUsedInRound2: current.questionsUsed[2], pins: current.pins.length, secondsInRound: secondsSince(current.roundStartedAt[2]) });
    void gatherCandidates();
  };

  const rule = (candidate: CandidateState, verdict: Verdict, amendedText: string | undefined, via: "chat" | "direct") => {
    const at = now();
    updateCase((state) => ({
      ...state,
      candidates: state.candidates.map((item) =>
        item.id === candidate.id ? { ...item, proposed: undefined, ruling: { verdict, amendedText, via, at } } : item,
      ),
    }));
    void log("ruling", {
      candidateId: candidate.id,
      origin: candidate.origin,
      agentIds: candidate.agentIds,
      quote: candidate.quote,
      summary: candidate.summary,
      verdict,
      amendedText,
      via,
      previousVerdict: candidate.ruling?.verdict,
    });
  };

  const clerkSend = async (text: string) => {
    const current = stateRef.current;
    const chairTurn = { id: createId("clerk"), speaker: "chair" as const, text, at: now() };
    const pending = { id: createId("clerk"), speaker: "clerk" as const, text: "", status: "loading" as const, at: now() };
    updateCase((state) => ({ ...state, clerk: [...state.clerk, chairTurn, pending] }));
    void log("clerk_message", { text });
    try {
      const result = await fetchClerkReply({
        caseIndex,
        message: text,
        history: current.clerk.filter((turn) => !turn.status).map((turn) => ({ speaker: turn.speaker, text: turn.text })),
        candidates: current.candidates.map(({ ruling, proposed: _proposed, wording, ...item }) => ({
          ...item,
          summary: item.summary || (wording ? `The Chair's own wording: ${wording}` : ""),
          ruling: ruling ? `${verdictLabels[ruling.verdict]}${ruling.amendedText ? `: "${ruling.amendedText}"` : ""}` : undefined,
        })),
      });
      updateCase((state) => ({
        ...state,
        clerk: state.clerk.map((turn) => (turn.id === pending.id ? { ...turn, text: result.reply, status: undefined } : turn)),
        candidates: state.candidates.map((item) => {
          const proposal = result.proposals.find((entry) => entry.candidateId === item.id);
          return proposal ? { ...item, proposed: { verdict: proposal.verdict, amendedText: proposal.amendedText } } : item;
        }),
      }));
    } catch (error) {
      updateCase((state) => ({
        ...state,
        clerk: state.clerk.map((turn) =>
          turn.id === pending.id ? { ...turn, text: `I could not note that: ${error instanceof Error ? error.message : "error"}. Say it again?`, status: undefined } : turn,
        ),
      }));
    }
  };

  const confirmProposals = () => {
    const current = stateRef.current;
    current.candidates
      .filter((item) => item.proposed)
      .forEach((item) => rule(item, item.proposed!.verdict, item.proposed!.amendedText || undefined, "chat"));
    void log("proposals_confirmed", { count: current.candidates.filter((item) => item.proposed).length });
  };

  const discardProposals = () => {
    const count = stateRef.current.candidates.filter((item) => item.proposed).length;
    updateCase((state) => ({ ...state, candidates: state.candidates.map((item) => ({ ...item, proposed: undefined })) }));
    void log("proposals_discarded", { count });
  };

  const summarise = async () => {
    const minutes = minutesOf(stateRef.current);
    updateCase((state) => ({ ...state, summary: { status: "loading", overview: "", points: [] } }));
    try {
      const result = await fetchClerkSummary({ caseIndex, minutes });
      updateCase((state) => ({ ...state, summary: { status: "ready", overview: result.overview, points: result.points } }));
      void log("summary_shown", { overview: result.overview, points: result.points });
    } catch (error) {
      updateCase((state) => ({
        ...state,
        summary: { status: "error", overview: "", points: [], error: error instanceof Error ? error.message : "Could not summarise" },
      }));
    }
  };

  const reopenRulings = () => {
    updateCase((state) => ({ ...state, minutesSealedAt: undefined, summary: undefined }));
    void log("minutes_reopened", { summaryStatus: stateRef.current.summary?.status });
  };

  const toFinal = () => {
    updateCase((state) => ({ ...state, phase: "final" }));
    void log("final_opened", { summaryPoints: stateRef.current.summary?.points.length ?? 0 });
  };

  const sealMinutes = () => {
    const current = stateRef.current;
    const minutes = minutesOf(current);
    updateCase((state) => ({ ...state, minutesSealedAt: now() }));
    void log("minutes_sealed", {
      minutes,
      accepted: current.candidates.filter((item) => item.ruling?.verdict === "accept").length,
      amended: current.candidates.filter((item) => item.ruling?.verdict === "amend").length,
      rejected: current.candidates.filter((item) => item.ruling?.verdict === "reject").length,
      unruled: current.candidates.filter((item) => !item.ruling).length,
      pins: current.pins.length,
      secondsInSynthesis: secondsSince(current.roundStartedAt[3]),
      secondsOnFloor: secondsSince(current.floorOpenedAt),
    });
    void summarise();
  };

  // ------------------------------------------------------------ final plan and debrief

  const submitFinal = async (final: NonNullable<CaseState["final"]>) => {
    const current = stateRef.current;
    updateCase((state) => ({ ...state, final }));
    // The server releases the debrief only after this event is stored, so wait for it.
    await log("final_submitted", {
      ...final,
      confidenceAfterLabel: confidenceOptions[final.confidenceAfter - 1],
      planStart: slot.planStart,
      precommit: current.precommit,
      diagnosisChanged: final.diagnosis.trim() !== (current.precommit?.diagnosis ?? "").trim(),
      planChanged: final.plan.trim() !== (current.precommit?.plan ?? "").trim(),
      working: current.working,
      fromFloorKept: final.fromFloor?.length ?? 0,
      fromFloorEdited: final.fromFloor?.filter((point) => point.text !== point.original).length ?? 0,
      fromFloorRemoved: final.floorRemoved?.length ?? 0,
    });
    updateCase((state) => ({ ...state, phase: "debrief", debriefOpenedAt: now() }));
  };

  const caseLine = `Case ${caseIndex + 1} of ${caseCount}`;

  if (caseState.phase === "record") {
    return (
      <div className="sheet-page">
        <CaseTitle slot={slot} caseLine={caseLine} />
        <div className="record-layout">
          <RecordView slot={slot} />
          <PrecommitForm slot={slot} onSubmit={openChamber} />
        </div>
      </div>
    );
  }

  if (caseState.phase === "chamber") {
    return (
      <Chamber
        slot={slot}
        caseIndex={caseIndex}
        caseLine={caseLine}
        caseState={caseState}
        style={style}
        log={(type, data) => void log(type, data)}
        onTourDone={() => updateCase((state) => (state.tourSeenAt ? state : { ...state, tourSeenAt: now() }))}
        onFocus={focus}
        onAsk={ask}
        onHear={hearOut}
        onPin={pin}
        onUnpin={unpin}
        onEditPin={editPin}
        onSaveWorking={saveWorking}
        onRetryLine={retryLine}
        onRetryOpening={retryOpening}
        onPutPatientMotion={putPatientMotion}
        onNotePatientMotion={notePatientMotion}
        onCallDebate={() => void callDebate()}
        onCallSynthesis={callSynthesis}
        onRule={(candidate, verdict, amendedText) => rule(candidate, verdict, amendedText, "direct")}
        onRetryCandidates={() => void gatherCandidates()}
        onClerkSend={(text) => void clerkSend(text)}
        onConfirm={confirmProposals}
        onDiscard={discardProposals}
        onSeal={sealMinutes}
        onRetrySummary={() => void summarise()}
        onReopen={reopenRulings}
        onToFinal={toFinal}
      />
    );
  }

  if (caseState.phase === "final") {
    return (
      <div className="sheet-page">
        <CaseTitle slot={slot} caseLine={caseLine} after />
        <FinalForm slot={slot} caseState={caseState} onSubmit={submitFinal} />
      </div>
    );
  }

  return (
    <div className="sheet-page">
      <CaseTitle slot={slot} caseLine={caseLine} after />
      <DebriefView
        caseIndex={caseIndex}
        caseState={caseState}
        isLast={caseIndex + 1 >= caseCount}
        onContinue={() => {
          void log("debrief_closed", { secondsOnDebrief: secondsSince(caseState.debriefOpenedAt) });
          onFinished();
        }}
      />
    </div>
  );
}

// ================================================================ the chamber layout

type ChamberProps = {
  slot: CaseSlot;
  caseIndex: number;
  caseLine: string;
  caseState: CaseState;
  style: "paragraph" | "hook";
  log: (type: string, data?: unknown) => void;
  onFocus: (seat: Seat) => void;
  onAsk: (seat: Seat, text: string) => void;
  onHear: (agentId: AgentKey) => void;
  onPin: (sourceId: string, agentId: AgentKey, quote: string) => void;
  onUnpin: (pin: Pin) => void;
  onEditPin: (pin: Pin, wording: string | undefined) => void;
  onSaveWorking: (next: WorkingPlan, where: "drawer" | "between-rounds") => void;
  onRetryLine: (lineId: string) => void;
  onRetryOpening: (agentId: AgentKey) => void;
  onPutPatientMotion: () => void;
  onNotePatientMotion: () => void;
  onCallDebate: () => void;
  onCallSynthesis: () => void;
  onRule: (candidate: CandidateState, verdict: Verdict, amendedText?: string) => void;
  onRetryCandidates: () => void;
  onClerkSend: (text: string) => void;
  onConfirm: () => void;
  onDiscard: () => void;
  onSeal: () => void;
  onRetrySummary: () => void;
  onReopen: () => void;
  onToFinal: () => void;
  onTourDone: () => void;
};

const tourSteps = (slot: CaseSlot, firstCase: boolean): TourStep[] => {
  const label = slot.case.patientLabel;
  const pronoun = patientPronouns(label);
  const steps: Array<TourStep & { always?: boolean }> = [
    {
      target: ".table-stage",
      title: "Your panel",
      body: "Six colleagues sit around the table, each thinking in a different way. Turn the table with the arrows, or click any card: it turns over to show your conversation with that member.",
    },
    {
      target: ".floor-seal",
      title: "The Floor",
      body: "Click the seal to ask everyone the same question at once. Each member answers on their own card, and the Floor shows who said what.",
    },
    {
      target: ".tokens",
      title: "Your questions",
      body: `You can ask the panel ${roundBudget[1]} questions in this round and ${roundBudget[2]} in the debate. A question to the Floor counts as one.${
        slot.mode === "triadic" ? ` Talking to ${label} is free.` : ""
      }`,
    },
    slot.mode === "triadic"
      ? {
          target: ".patient-pane",
          title: `${label} is in the room`,
          body: `Talk to ${pronoun.object} here, as you would in a consultation. ${pronoun.subject[0].toUpperCase()}${pronoun.subject.slice(1)} answers only from what ${pronoun.subject} knows and may raise things ${pronoun.reflexive}.`,
          always: true,
        }
      : {
          target: ".record-pane",
          title: `${label} at a glance`,
          body: `${label} is not in the room this time. The key facts and results stay here; open the full record at any time.`,
          always: true,
        },
    {
      target: ".pin-tray",
      title: "Keep what matters",
      body: "In any reply, select words or press Keep. What you keep collects here, where you can reword or remove it, and goes forward to the synthesis.",
    },
    {
      target: ".rail-plan",
      title: "Your plan and notes",
      body: "Update your working plan or jot notes at any time. The plan you locked at the start stays as it was.",
    },
    {
      target: ".advance",
      title: "Three rounds",
      body: "When you are ready, call the debate: the panel reads everything and argues it out. Then the synthesis, where you decide what goes into the Minutes.",
    },
  ];
  return steps.filter((step) => firstCase || step.always);
};

function Chamber(props: ChamberProps) {
  const { slot, caseState } = props;
  const [drawer, setDrawer] = useState<"plan" | "record">();
  const [confirmRound, setConfirmRound] = useState(false);
  const [open, setOpen] = useState<AgentKey | "floor">();
  const [seen, setSeen] = useState<Partial<Record<AgentKey, number>>>({});
  /** The full tour on the first case or on request; on a later case only what is new (the patient's place). */
  const [touring, setTouring] = useState<"full" | "short">();
  const left = questionsLeft(caseState);
  const busy = caseState.lines.some((line) => line.status === "streaming");
  const openingsReady = Object.values(caseState.openings).every((opening) => opening?.status !== "loading");
  const triadic = slot.mode === "triadic";

  useEffect(() => setConfirmRound(false), [caseState.round]);

  // The debate opens on the Floor, where every statement is listed.
  useEffect(() => {
    if (caseState.round === 2) setOpen("floor");
  }, [caseState.round]);

  // Whatever is on an open card has been seen.
  const lineCount = caseState.lines.filter((line) => line.status === "done").length;
  useEffect(() => {
    if (open && open !== "floor") setSeen((current) => ({ ...current, [open]: Date.now() }));
  }, [open, lineCount]);

  // The tour runs once, when the table first opens (a short version on the second case).
  useEffect(() => {
    if (caseState.tourSeenAt || caseState.round !== 1) return;
    const timer = window.setTimeout(() => {
      setTouring(props.caseIndex === 0 ? "full" : "short");
      props.log("tour_started", { auto: true });
    }, 1400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open && !touring) setOpen(undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, touring]);

  const openSeat = (seat: AgentKey | "floor") => {
    props.onFocus(seat);
    setOpen(seat);
    props.log("card_opened", { seat, round: caseState.round });
  };

  const turnTo = (seat: AgentKey) => {
    props.onFocus(seat);
    if (open) setOpen(seat);
  };

  const advance = caseState.round === 1 ? props.onCallDebate : props.onCallSynthesis;
  const advanceLabel = caseState.round === 1 ? "Call the debate" : "Call the synthesis";

  const windowProps = {
    slot,
    caseState,
    style: props.style,
    onAsk: props.onAsk,
    onHear: props.onHear,
    onPin: props.onPin,
    onRetryLine: props.onRetryLine,
    onRetryOpening: props.onRetryOpening,
    onOpen: openSeat,
    onClose: () => setOpen(undefined),
    onListen: (lineId: string, agentId: AgentKey) => props.log("reply_listened", { lineId, agentId }),
  };

  return (
    <div className={`chamber round-${caseState.round} ${triadic ? "triadic" : "dyadic"}`}>
      <div className="rail">
        <div className="rail-case">
          <span className="rail-step">{props.caseLine}</span>
          <strong>{slot.case.title}</strong>
          <span className={`mode-chip ${slot.mode}`}>{triadic ? `${slot.case.patientLabel} is in the room` : "You and the panel"}</span>
        </div>
        <ol className="rounds" aria-label="Rounds">
          {([1, 2, 3] as Round[]).map((round) => (
            <li key={round} className={round === caseState.round ? "current" : round < caseState.round ? "past" : ""} aria-current={round === caseState.round ? "step" : undefined}>
              <span className="round-number">{round}</span>
              {roundNames[round]}
            </li>
          ))}
        </ol>
        {caseState.round < 3 && (
          <div className="tokens" aria-label={`${left} of ${roundBudget[caseState.round as 1 | 2]} questions left in this round`}>
            {Array.from({ length: roundBudget[caseState.round as 1 | 2] }, (_, index) => (
              <span key={index} className={`token ${index < left ? "" : "spent"}`} />
            ))}
            <span className="tokens-label">{left} left</span>
          </div>
        )}
        <button
          className="rail-record"
          onClick={() => {
            setTouring("full");
            props.log("tour_started", { auto: false });
          }}
        >
          <HelpCircle size={16} /> Guide
        </button>
        <button className="rail-record rail-plan" onClick={() => setDrawer("plan")} aria-pressed={drawer === "plan"}>
          <NotebookPen size={16} /> My plan
        </button>
        <button className="rail-record" onClick={() => setDrawer("record")} aria-pressed={drawer === "record"}>
          <BookOpen size={16} /> Record
        </button>
      </div>

      {caseState.round < 3 &&
        (triadic ? (
          <PatientPane
            slot={slot}
            caseState={caseState}
            onAsk={props.onAsk}
            onRetryLine={props.onRetryLine}
            onPutPatientMotion={() => {
              props.onPutPatientMotion();
              setOpen("floor");
            }}
            onNotePatientMotion={props.onNotePatientMotion}
          />
        ) : (
          <RecordPane slot={slot} onOpenRecord={() => setDrawer("record")} />
        ))}

      <section className="stage" aria-label="The table">
        {caseState.round < 3 ? (
          <>
            <Table slot={slot} caseState={caseState} style={props.style} open={open} seen={seen} onOpen={openSeat} onTurn={turnTo}>
              {open === "floor" ? <FloorWindow {...windowProps} /> : open ? <CardWindow {...windowProps} agentId={open} /> : null}
            </Table>
            <div className="stage-foot">
              <PinTray caseState={caseState} onUnpin={props.onUnpin} onEdit={props.onEditPin} />
              <div className="advance">
                {caseState.round === 2 && caseState.debateStatus === "loading" && <span className="advance-note">The panel is reading round 1…</span>}
                <button
                  className="brass big"
                  disabled={!openingsReady || busy || (caseState.round === 2 && caseState.debateStatus !== "ready")}
                  onClick={() => {
                    setDrawer(undefined);
                    setConfirmRound(true);
                  }}
                >
                  {advanceLabel}
                </button>
              </div>
            </div>
          </>
        ) : caseState.minutesSealedAt ? (
          <SummarySheet caseState={caseState} onRetry={props.onRetrySummary} onReopen={props.onReopen} onToFinal={props.onToFinal} />
        ) : (
          <Ledger slot={slot} caseState={caseState} onRule={props.onRule} onRetry={props.onRetryCandidates} />
        )}

        {confirmRound && caseState.round < 3 && (
          <div className="between" role="dialog" aria-label="Between rounds">
            <div className="between-sheet">
              <span className="rail-step">Between rounds</span>
              <h2>{caseState.round === 1 ? "Before the debate" : "Before the synthesis"}</h2>
              <p>
                {caseState.round === 1
                  ? "Every panel member will read your conversations and argue them out. You cannot return to round 1."
                  : "The Clerk will gather the points for your rulings, and questions to the panel close."}{" "}
                Take a moment to update your working plan or add notes.
              </p>
              <WorkingPlanEditor working={workingOf(caseState)} onSave={(next) => props.onSaveWorking(next, "between-rounds")} />
              <div className="slip-actions">
                <button className="brass big" disabled={busy} onClick={advance}>
                  {advanceLabel}
                </button>
                <button onClick={() => setConfirmRound(false)}>Back to the table</button>
              </div>
            </div>
          </div>
        )}

        {drawer && (
          <div className="drawer" role="dialog" aria-label={drawer === "plan" ? "Your plan and notes" : "The patient record"}>
            <button className="icon drawer-close" onClick={() => setDrawer(undefined)} aria-label="Close">
              <X size={18} />
            </button>
            {drawer === "plan" ? (
              <>
                <section className="locked-plan working-edit">
                  <h2>My working plan</h2>
                  <WorkingPlanEditor working={workingOf(caseState)} onSave={(next) => props.onSaveWorking(next, "drawer")} />
                </section>
                <LockedPlan caseState={caseState} />
              </>
            ) : (
              <>
                <RecordView slot={slot} />
                <LockedPlan caseState={caseState} />
              </>
            )}
          </div>
        )}
      </section>

      {caseState.round === 3 && (
        <ClerkPaper caseState={caseState} onSend={props.onClerkSend} onConfirm={props.onConfirm} onDiscard={props.onDiscard} onSeal={props.onSeal} />
      )}

      {touring && (
        <Tour
          steps={tourSteps(slot, touring === "full")}
          onDone={(completed, reached) => {
            setTouring(undefined);
            props.log("tour_finished", { completed, reached });
            props.onTourDone();
          }}
        />
      )}
    </div>
  );
}

// ================================================================ record, pre-commitment, final, debrief

function CaseTitle({ slot, caseLine, after = false }: { slot: CaseSlot; caseLine: string; after?: boolean }) {
  return (
    <header className="case-title">
      <span className="rail-step">{caseLine}</span>
      <h1>{slot.case.title}</h1>
      <span className={`mode-chip ${slot.mode}`}>{slot.mode === "triadic" ? `${slot.case.patientLabel} ${after ? "joined you" : "will be"} at the table` : "You and the panel"}</span>
    </header>
  );
}

function RecordView({ slot }: { slot: CaseSlot }) {
  return (
    <section className="record">
      <h2>Patient record</h2>
      <p className="record-note">A synthetic record. No real patient.</p>
      {slot.case.record.map((section) => (
        <div className="record-section" key={section.heading}>
          <h3>{section.heading}</h3>
          <ul>
            {section.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function LockedPlan({ caseState }: { caseState: CaseState }) {
  return (
    <section className="locked-plan">
      <h2>Your plan before the panel spoke</h2>
      <p className="record-note">Locked when you opened the table.</p>
      <h3>Working diagnosis</h3>
      <p>{caseState.precommit?.diagnosis}</p>
      <h3>Plan</h3>
      <p>{caseState.precommit?.plan}</p>
    </section>
  );
}

function Scale({ name, options, value, onChange }: { name: string; options: string[]; value?: number; onChange: (value: number) => void }) {
  return (
    <div className="scale" role="radiogroup">
      {options.map((label, index) => (
        <label key={label} className={value === index + 1 ? "selected" : ""}>
          <input type="radio" name={name} checked={value === index + 1} onChange={() => onChange(index + 1)} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

function PrecommitForm({ slot, onSubmit }: { slot: CaseSlot; onSubmit: (value: { diagnosis: string; plan: string; confidence: number }) => void }) {
  const [diagnosis, setDiagnosis] = useState("");
  const [plan, setPlan] = useState("");
  const [confidence, setConfidence] = useState<number>();
  const ready = diagnosis.trim().length > 1 && plan.trim().length > 1 && confidence !== undefined;

  return (
    <section className="form-sheet precommit">
      <h2>Before the panel speaks</h2>
      <p>
        Record your own working diagnosis and plan. It is locked when you open the table, and you can look back at it at any time.
        {slot.mode === "triadic" ? ` ${slot.case.patientLabel} will be at the table with you and the panel.` : ""}
      </p>
      <label className="field">
        Working diagnosis
        <textarea rows={3} value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} />
      </label>
      <label className="field">
        Plan
        <textarea rows={5} value={plan} onChange={(event) => setPlan(event.target.value)} />
      </label>
      <fieldset className="field">
        <legend>Before the panel's discussion is shown, how confident are you in your working diagnosis and plan?</legend>
        <Scale name="confidence-before" options={confidenceOptions} value={confidence} onChange={setConfidence} />
      </fieldset>
      <button className="brass big" disabled={!ready} onClick={() => onSubmit({ diagnosis: diagnosis.trim(), plan: plan.trim(), confidence: confidence! })}>
        Lock my plan and open the table
      </button>
    </section>
  );
}

function FinalForm({ slot, caseState, onSubmit }: { slot: CaseSlot; caseState: CaseState; onSubmit: (value: NonNullable<CaseState["final"]>) => Promise<void> }) {
  const prefilled = slot.planStart === "prefilled";
  const working = workingOf(caseState);
  const workingChanged =
    Boolean(caseState.working?.updatedAt) &&
    (working.diagnosis !== caseState.precommit?.diagnosis || working.plan !== caseState.precommit?.plan || working.notes.trim() !== "");
  const [saving, setSaving] = useState(false);
  const [diagnosis, setDiagnosis] = useState(prefilled ? working.diagnosis : "");
  const [plan, setPlan] = useState(prefilled ? working.plan : "");
  const [floor, setFloor] = useState<FloorPoint[]>(() =>
    (caseState.summary?.points ?? []).map((point) => ({ id: point.id, text: point.text, original: point.text, agentIds: point.agentIds })),
  );
  const [floorRemoved, setFloorRemoved] = useState<FloorPoint[]>([]);
  const [confidenceAfter, setConfidenceAfter] = useState<number>();
  const [change, setChange] = useState<number>();
  const [changeReason, setChangeReason] = useState("");
  const minutes = minutesOf(caseState);
  const ready = diagnosis.trim() && (plan.trim() || floor.length > 0) && confidenceAfter && change;

  return (
    <div className="record-layout">
      <div className="side-stack">
        <LockedPlan caseState={caseState} />
        {workingChanged && <WorkingPlanView working={working} />}
        <section className="minutes">
          <h2>The Minutes</h2>
          {minutes.length ? (
            <ol>
              {minutes.map((item) => (
                <li key={item.id}>
                  <span className="minutes-who">{listNames(item.agentIds.map((id) => studyAgentById(id).shortName))}</span>
                  {item.text}
                  {item.verdict === "amend" && <span className="minutes-part"> (in part)</span>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="record-note">You did not carry anything forward into the Minutes.</p>
          )}
        </section>
      </div>

      <section className="form-sheet">
        <h2>Your final diagnosis and plan</h2>
        <p>
          {prefilled
            ? "This starts from your working plan. The Clerk's summary of your Minutes is in the plan, marked as from the Floor. Keep, edit or remove each point, and change the rest as you see fit."
            : "Write your final working diagnosis and plan. The Clerk's summary of your Minutes is already in the plan, marked as from the Floor. Keep, edit or remove each point."}
        </p>
        <label className="field">
          Working diagnosis
          <textarea rows={3} value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} />
        </label>
        <div className="field">
          <span>Plan</span>
          <div className="plan-composite">
            <FloorPointsEditor
              points={floor}
              removed={floorRemoved}
              onChange={(points, removed) => {
                setFloor(points);
                setFloorRemoved(removed);
              }}
            />
            <label className="own-plan-label">
              <span className="own-plan-tag">Your plan</span>
              <textarea rows={6} value={plan} onChange={(event) => setPlan(event.target.value)} />
            </label>
          </div>
        </div>
        <fieldset className="field">
          <legend>After ruling on the panel's contributions, how confident are you in your final diagnosis and plan?</legend>
          <Scale name="confidence-after" options={confidenceOptions} value={confidenceAfter} onChange={setConfidenceAfter} />
        </fieldset>
        <fieldset className="field">
          <legend>Did the deliberation change your working diagnosis or plan?</legend>
          <Scale name="change" options={changeOptions} value={change} onChange={setChange} />
        </fieldset>
        <label className="field">
          What changed it, or why did you keep your original plan?
          <textarea rows={3} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} />
        </label>
        <button
          className="brass big"
          disabled={!ready || saving}
          onClick={() => {
            setSaving(true);
            void onSubmit({
              diagnosis: diagnosis.trim(),
              plan: plan.trim(),
              fromFloor: floor.map((point) => ({ ...point, text: point.text.trim() })),
              floorRemoved,
              confidenceAfter: confidenceAfter!,
              change: changeOptions[change! - 1],
              changeReason: changeReason.trim(),
              at: now(),
            });
          }}
        >
          {saving ? "Saving…" : "Submit and see the debrief"}
        </button>
      </section>
    </div>
  );
}

function DebriefView({ caseIndex, caseState, isLast, onContinue }: { caseIndex: number; caseState: CaseState; isLast: boolean; onContinue: () => void }) {
  const [debrief, setDebrief] = useState<Debrief>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(undefined);
    let timer: number | undefined;
    const load = (triesLeft: number) =>
      fetchDebrief(caseIndex)
        .then((value) => !cancelled && setDebrief(value))
        .catch((reason) => {
          if (cancelled) return;
          // 409: the final-plan event is still on its way to the server.
          if (reason instanceof StudyApiError && reason.status === 409 && triesLeft > 0) {
            timer = window.setTimeout(() => void load(triesLeft - 1), 1500);
            return;
          }
          setError(reason instanceof Error ? reason.message : "Could not load the debrief");
        });
    void load(4);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [caseIndex, attempt]);

  const negativeSaid = [
    caseState.openings[negativeAgentId]?.status === "ready" ? caseState.openings[negativeAgentId]!.answer : "",
    ...caseState.lines.filter((line) => line.speaker === negativeAgentId && line.status === "done").map((line) => line.text),
  ].filter(Boolean);
  const negativeRulings = caseState.candidates.filter((item) => item.agentIds.includes(negativeAgentId));

  if (error) {
    return (
      <section className="form-sheet">
        <p>{error}</p>
        <button onClick={() => setAttempt((value) => value + 1)}>Try again</button>
      </section>
    );
  }
  if (!debrief) return <section className="form-sheet">Loading the debrief…</section>;

  return (
    <section className="form-sheet debrief">
      <h2>Debrief</h2>
      {debrief.draft && <p className="draft-flag">Draft reference plan: pending review by the Chief Investigator.</p>}

      <div className="debrief-negative">
        <img src={studyAgentById(negativeAgentId).art} alt="" />
        <div>
          <h3>The deliberately unreliable panel member</h3>
          <p>
            <strong>{debrief.negativeAgentName}.</strong> {debrief.negativePurpose}
          </p>
        </div>
      </div>
      {negativeSaid.length > 0 && (
        <div className="negative-recap">
          {negativeSaid.slice(0, 3).map((text, index) => (
            <blockquote key={index}>{text}</blockquote>
          ))}
          {negativeRulings.length > 0 && (
            <p className="record-note">
              Your rulings on its points: {negativeRulings.map((item) => (item.ruling ? verdictLabels[item.ruling.verdict].toLowerCase() : "not ruled on")).join(", ")}.
            </p>
          )}
        </div>
      )}

      {caseState.final && (
        <div className="debrief-final">
          <h3>Your final plan</h3>
          <FinalPlanView final={caseState.final} />
        </div>
      )}

      <h3>Reference assessment</h3>
      <p>{debrief.referenceAssessment}</p>
      <h3>Reference plan</h3>
      <ul>
        {debrief.referencePlan.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="caveat">{debrief.caveat}</p>
      <button className="brass big" onClick={onContinue}>
        {isLast ? "Continue to the questionnaire" : "Continue to the next case"}
      </button>
    </section>
  );
}
