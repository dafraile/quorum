import { negativeAgentId, panelAgentIds, studyAgentById } from "../../shared/studyRoster";
import type { AgentKey, SessionPayload, Verdict } from "../../shared/studyTypes";

export type FloorItemKind = "opening" | "motion-response" | "patient-motion";

export type Ruling = { verdict: Verdict; amendedText?: string; at: string };

export type FloorItem = {
  id: string;
  kind: FloorItemKind;
  agentId?: AgentKey;
  motionId?: string;
  patientMotionId?: string;
  text: string;
  status: "loading" | "ready" | "error";
  error?: string;
  source: "static" | "live" | "script";
  ruling?: Ruling;
  createdAt: string;
};

export type ChairMotion = {
  id: string;
  text: string;
  target: AgentKey | "floor";
  targets: AgentKey[];
  /** A patient's Motion the Chair put to the panel is recorded as filedBy "patient". */
  filedBy: "chair" | "patient";
  at: string;
};

export type ChatTurn = { id: string; role: "chair" | "patient"; text: string; at: string; status?: "loading" | "error" };

export type CasePhase = "record" | "floor" | "final" | "debrief";

export type CaseState = {
  phase: CasePhase;
  startedAt: string;
  precommit?: { diagnosis: string; plan: string; confidence: number; at: string };
  floorOpenedAt?: string;
  items: FloorItem[];
  motions: ChairMotion[];
  chat: ChatTurn[];
  firedPatientMotions: string[];
  advocateWithdrawnAt?: string;
  final?: {
    diagnosis: string;
    plan: string;
    confidenceAfter: number;
    change: string;
    changeReason: string;
    at: string;
  };
  debriefOpenedAt?: string;
};

export type StudyStep = "welcome" | "consent" | "declined" | "demographics" | "case" | "questionnaire" | "done" | "stopped";

export type StudyState = {
  version: 1;
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

export const newCaseState = (): CaseState => ({
  phase: "record",
  startedAt: now(),
  items: [],
  motions: [],
  chat: [],
  firedPatientMotions: [],
});

export const initialStudyState = (): StudyState => ({ version: 1, step: "welcome", caseIndex: 0, cases: [] });

/** Requests in flight when the page was closed never return: surface them as retryable errors. */
export const restoreSnapshot = (value: unknown): StudyState | null => {
  if (!value || typeof value !== "object" || (value as StudyState).version !== 1) return null;
  const state = value as StudyState;
  return {
    ...state,
    cases: state.cases.map((item) => ({
      ...item,
      items: item.items.map((floorItem) =>
        floorItem.status === "loading"
          ? { ...floorItem, status: "error", error: "Interrupted when the page was reloaded." }
          : floorItem,
      ),
      chat: item.chat.filter((turn) => turn.status !== "loading"),
    })),
  };
};

export const agentName = (id: AgentKey) => studyAgentById(id).name;

export const effectiveText = (item: FloorItem) =>
  item.ruling?.verdict === "amend" && item.ruling.amendedText ? item.ruling.amendedText : item.text;

export const isRuled = (item: FloorItem) => Boolean(item.ruling);

/** Agents a Motion to the whole Floor goes to: the panel (minus a withdrawn Advocate) and the negative archetype. */
export const activeAgents = (caseState: CaseState): AgentKey[] =>
  [...panelAgentIds, negativeAgentId].filter(
    (id) => !(id === "patientAdvocate" && caseState.advocateWithdrawnAt),
  );

export const latestAnswerFor = (caseState: CaseState, agentId: AgentKey) =>
  [...caseState.items].reverse().find((item) => item.agentId === agentId && item.status === "ready")?.text;

export const patientUtterances = (caseState: CaseState) => [
  ...caseState.items.filter((item) => item.kind === "patient-motion").map((item) => item.text),
  ...caseState.chat.filter((turn) => turn.role === "patient" && !turn.status).map((turn) => turn.text),
];

export const rulingCounts = (caseState: CaseState) => {
  const ruled = caseState.items.filter(isRuled);
  return {
    ruled: ruled.length,
    accept: ruled.filter((item) => item.ruling?.verdict === "accept").length,
    amend: ruled.filter((item) => item.ruling?.verdict === "amend").length,
    reject: ruled.filter((item) => item.ruling?.verdict === "reject").length,
    unruled: caseState.items.filter((item) => item.status === "ready" && !item.ruling).length,
  };
};
