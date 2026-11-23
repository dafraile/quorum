import { allStudyAgentIds } from "../../shared/studyRoster";
import { agentById, words } from "./tableConfig";
import type {
  AgentKey,
  Candidate,
  DebateStance,
  FloorSource,
  ProceedingLine,
  Round,
  SessionPayload,
  Verdict,
} from "../../shared/studyTypes";

/** Questions (to one panel member or the whole Floor) the Chair may ask per round. Patient questions are free. */
export const roundBudget: Record<1 | 2, number> = { 1: 5, 2: 3 };

export const roundNames: Record<Round, string> = { 1: "Consultations", 2: "Debate", 3: "Synthesis" };

/** A round's name as this table calls it. */
export const roundLabel = (round: Round) => words().roundNames?.[round] ?? roundNames[round];

export type Seat = AgentKey | "patient" | "floor";

export type Opening = {
  agentId: AgentKey;
  answer: string;
  keyPoints: string[];
  hook: string;
  source: FloorSource;
  status: "loading" | "ready" | "error";
  error?: string;
  /** Hook style: the Chair turned to this card to hear it out. */
  heardAt?: string;
};

export type LineKind =
  | "question" // Chair to one panel member
  | "motion" // Chair to the whole Floor
  | "reply" // a panel member answering the Chair or a Motion
  | "hook-reply" // a panel member making its point after its hook
  | "patient-motion" // the patient raising something on the Floor
  | "patient-question" // Chair to the patient
  | "patient-reply"
  | "debate"; // a panel member's round-2 statement

export type Line = {
  id: string;
  round: Round;
  speaker: AgentKey | "chair" | "patient";
  to?: AgentKey | "floor" | "patient";
  kind: LineKind;
  /** Groups a Motion (or a patient Motion put to the Floor) with its replies. */
  motionId?: string;
  text: string;
  status: "streaming" | "done" | "error";
  error?: string;
  stances?: DebateStance[];
  at: string;
};

export type Pin = {
  id: string;
  sourceId: string;
  agentId: AgentKey;
  /** The panel member's words, verbatim: never changed. */
  quote: string;
  /** The Chair's own restatement of the point, if they edited it. */
  wording?: string;
  round: Round;
  at: string;
};

export type Ruling = { verdict: Verdict; amendedText?: string; via: "chat" | "direct"; at: string };

export type CandidateState = Candidate & {
  /** For a pin the Chair restated: their wording, carried as an in-part ruling. */
  wording?: string;
  ruling?: Ruling;
  proposed?: { verdict: Verdict; amendedText: string };
};

export type ClerkTurn = { id: string; speaker: "chair" | "clerk"; text: string; status?: "loading" | "error"; at: string };

/** The Chair's plan as it evolves at the table; it starts as the locked pre-commitment. */
export type WorkingPlan = { diagnosis: string; plan: string; notes: string; updatedAt?: string };

export type SummaryPoint = { id: string; text: string; minuteIds: string[]; agentIds: AgentKey[] };

export type FloorPoint = {
  id: string;
  /** What enters the final plan (the Clerk's line, or the Chair's edit of it). */
  text: string;
  /** The Clerk's line as written. */
  original: string;
  agentIds: AgentKey[];
};

export type CasePhase = "record" | "chamber" | "final" | "debrief";

export type CaseState = {
  phase: CasePhase;
  round: Round;
  startedAt: string;
  precommit?: { diagnosis: string; plan: string; confidence: number; at: string };
  floorOpenedAt?: string;
  roundStartedAt: Partial<Record<Round, string>>;
  openings: Partial<Record<AgentKey, Opening>>;
  lines: Line[];
  pins: Pin[];
  focus: Seat;
  questionsUsed: Record<1 | 2, number>;
  firedPatientMotions: string[];
  /** A patient Motion waiting for the Chair: put it to the Floor or note it. */
  pendingPatientMotion?: { lineId: string; text: string };
  advocateWithdrawnAt?: string;
  debateStatus: "idle" | "loading" | "ready";
  candidates: CandidateState[];
  candidatesStatus: "idle" | "loading" | "ready" | "error";
  candidatesError?: string;
  clerk: ClerkTurn[];
  working?: WorkingPlan;
  minutesSealedAt?: string;
  summary?: { status: "loading" | "ready" | "error"; overview: string; points: SummaryPoint[]; error?: string };
  final?: {
    diagnosis: string;
    plan: string;
    /** The Clerk's summary points the Chair kept in the final plan (possibly edited). */
    fromFloor?: FloorPoint[];
    /** Summary points the Chair removed from the final plan. */
    floorRemoved?: FloorPoint[];
    confidenceAfter: number;
    change: string;
    changeReason: string;
    at: string;
  };
  debriefOpenedAt?: string;
  /** When the Chair finished or skipped the table tour for this case. */
  tourSeenAt?: string;
  /** Who sits at the table (the demo lets the Chair choose); the whole panel when unset. */
  seats?: AgentKey[];
  /** Questions per round; null means no limit. The study's budget when unset. */
  budget?: Record<1 | 2, number | null>;
};

export type StudyStep = "welcome" | "consent" | "declined" | "demographics" | "case" | "questionnaire" | "done" | "stopped";

export type StudyState = {
  version: 2;
  step: StudyStep;
  caseIndex: number;
  cases: CaseState[];
  consentAt?: string;
  demographics?: Record<string, string>;
  questionnaire?: Record<string, string>;
};

export type CaseSlot = SessionPayload["sequence"][number];

export const createId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const now = () => new Date().toISOString();

export const secondsSince = (iso?: string) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 1000) : undefined);

export const newCaseState = (): CaseState => ({
  phase: "record",
  round: 1,
  startedAt: now(),
  roundStartedAt: {},
  openings: {},
  lines: [],
  pins: [],
  focus: "intern",
  questionsUsed: { 1: 0, 2: 0 },
  firedPatientMotions: [],
  debateStatus: "idle",
  candidates: [],
  candidatesStatus: "idle",
  clerk: [],
});

export const initialStudyState = (): StudyState => ({ version: 2, step: "welcome", caseIndex: 0, cases: [] });

/** Requests in flight when the page was closed never return: surface them as retryable errors. */
export const restoreSnapshot = (value: unknown): StudyState | null => {
  if (!value || typeof value !== "object" || (value as StudyState).version !== 2) return null;
  const state = value as StudyState;
  const interrupted = "Interrupted when the page was reloaded.";
  return {
    ...state,
    cases: state.cases.map((item) => ({
      ...item,
      openings: Object.fromEntries(
        Object.entries(item.openings).map(([id, opening]) => [
          id,
          opening && opening.status === "loading" ? { ...opening, status: "error", error: interrupted } : opening,
        ]),
      ),
      lines: item.lines.map((line) => (line.status === "streaming" ? { ...line, status: "error", error: interrupted } : line)),
      debateStatus: item.debateStatus === "loading" ? "ready" : item.debateStatus,
      candidatesStatus: item.candidatesStatus === "loading" ? "error" : item.candidatesStatus,
      candidatesError: item.candidatesStatus === "loading" ? interrupted : item.candidatesError,
      clerk: item.clerk.filter((turn) => turn.status !== "loading"),
      summary:
        item.summary?.status === "loading" ? { ...item.summary, status: "error", error: interrupted } : item.summary,
    })),
  };
};

/** The Chair's current plan: the working plan if they have one, otherwise the locked pre-commitment. */
export const workingOf = (caseState: CaseState): WorkingPlan =>
  caseState.working ?? {
    diagnosis: caseState.precommit?.diagnosis ?? "",
    plan: caseState.precommit?.plan ?? "",
    notes: "",
  };

/** How a pin reads to the panel and the Clerk: the verbatim words, plus the Chair's restatement if any. */
export const pinLine = (pin: Pin) =>
  `${agentById(pin.agentId).shortName}: ${pin.quote}${pin.wording ? ` (the Chair's wording: ${pin.wording})` : ""}`;

export const agentName = (id: AgentKey) => agentById(id).name;

/** Everyone seated at the table, in panel order. */
export const seatsOf = (caseState: CaseState): AgentKey[] =>
  caseState.seats ? allStudyAgentIds.filter((id) => caseState.seats!.includes(id)) : allStudyAgentIds;

/** Panel members still at the table: the Advocate withdraws once the patient speaks. */
export const activeAgents = (caseState: CaseState): AgentKey[] =>
  seatsOf(caseState).filter((id) => !(id === "patientAdvocate" && caseState.advocateWithdrawnAt));

/** The question budget for a round: a number, or null for no limit. */
export const budgetFor = (caseState: CaseState, round: 1 | 2): number | null =>
  caseState.budget ? caseState.budget[round] : roundBudget[round];

export const patientUtterances = (caseState: CaseState) =>
  caseState.lines.filter((line) => line.speaker === "patient" && line.status === "done").map((line) => line.text);

export const questionsLeft = (caseState: CaseState) => {
  if (caseState.round === 3) return 0;
  const budget = budgetFor(caseState, caseState.round);
  return budget === null ? Number.POSITIVE_INFINITY : budget - caseState.questionsUsed[caseState.round];
};

/** What a panel member has said at the table (hook-style openings count only once heard, otherwise the hook). */
export const openingSaid = (opening: Opening | undefined, style: "paragraph" | "hook") => {
  if (!opening || opening.status !== "ready") return "";
  return style === "hook" ? opening.hook || opening.answer : opening.answer;
};

/** The proceedings in the order they happened, as sent to the debate and the Clerk. */
export const proceedingsOf = (caseState: CaseState, style: "paragraph" | "hook", upToRound: Round): ProceedingLine[] => {
  const openings: ProceedingLine[] = seatsOf(caseState).flatMap((agentId) => {
    const text = openingSaid(caseState.openings[agentId], style);
    return text ? [{ id: `open-${agentId}`, round: 1 as Round, speaker: agentId, text }] : [];
  });
  const lines = caseState.lines
    .filter((line) => line.status === "done" && line.round <= upToRound && line.text)
    .map<ProceedingLine>((line) => ({
      id: line.id,
      round: line.round,
      speaker: line.speaker,
      to: line.speaker === "chair" ? line.to : undefined,
      text: line.kind === "patient-motion" ? `(raises on the Floor) ${line.text}` : line.text,
    }));
  return [...openings, ...lines];
};

/** One panel member's own conversation with the Chair, for continuity in chat. */
export const threadFor = (caseState: CaseState, agentId: AgentKey) => {
  const motionIdsAnswered = new Set(
    caseState.lines.filter((line) => line.speaker === agentId && line.motionId).map((line) => line.motionId),
  );
  type Turn = { speaker: "chair" | "agent"; text: string; toFloor?: boolean };
  return caseState.lines
    .filter((line) => line.status === "done")
    .flatMap((line): Turn[] => {
      if (line.speaker === agentId && line.kind !== "debate") return [{ speaker: "agent" as const, text: line.text }];
      if (line.speaker === "chair" && line.to === agentId) return [{ speaker: "chair" as const, text: line.text }];
      if (line.speaker === "chair" && line.to === "floor" && motionIdsAnswered.has(line.motionId))
        return [{ speaker: "chair" as const, text: line.text, toFloor: true }];
      if (line.kind === "patient-motion" && motionIdsAnswered.has(line.id))
        return [{ speaker: "chair" as const, text: `(The patient's point, put to the Floor) ${line.text}`, toFloor: true }];
      return [];
    })
    .slice(-16);
};

export const debateLineFor = (caseState: CaseState, agentId: AgentKey) =>
  caseState.lines.find((line) => line.kind === "debate" && line.speaker === agentId);

export const isSpeaking = (caseState: CaseState, agentId: AgentKey) =>
  caseState.lines.some((line) => line.speaker === agentId && line.status === "streaming") ||
  caseState.openings[agentId]?.status === "loading";

export const verdictLabels: Record<Verdict, string> = {
  accept: "Carried forward",
  amend: "Carried in part",
  reject: "Left out",
};

export const minutesOf = (caseState: CaseState) =>
  caseState.candidates
    .filter((candidate) => candidate.ruling && candidate.ruling.verdict !== "reject")
    .map((candidate) => ({
      id: candidate.id,
      agentIds: candidate.agentIds,
      text:
        candidate.ruling?.verdict === "amend" && candidate.ruling.amendedText ? candidate.ruling.amendedText : candidate.quote,
      verdict: candidate.ruling!.verdict,
    }));
