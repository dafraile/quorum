// Wire types for the study API, shared by client and server. No imports on purpose.

export type StudyProviderId = "openai" | "anthropic";
export type StudyMode = "dyadic" | "triadic";
export type FloorSource = "static" | "live";
export type PlanStart = "prefilled" | "blank";
export type Verdict = "accept" | "amend" | "reject";
export type AgentKey = "intern" | "oldNurse" | "biblioRat" | "contrarian" | "patientAdvocate" | "oldGeezer";

export type SequenceItem = {
  caseId: string;
  mode: StudyMode;
  floorSource: FloorSource;
  planStart: PlanStart;
};

export type ParticipantStatus = "created" | "in_progress" | "completed";

export type ParticipantConfig = {
  participantId: string;
  pilot: boolean;
  showConsent: boolean;
  label?: string;
  allocation: number;
  sequence: SequenceItem[];
  /** Provider for each agent's live calls (static floors are pre-generated). */
  providerMix: Record<AgentKey, StudyProviderId>;
  createdAt: string;
};

export type RecordSection = { heading: string; lines: string[] };

export type PatientMotionScript = {
  id: string;
  text: string;
  /** Fires when either threshold is reached (whichever comes first). */
  trigger: { afterRulings?: number; afterSeconds?: number };
};

/** What the participant's browser may see of a case (no hidden script, no reference plan). */
export type PublicCase = {
  id: string;
  title: string;
  patientLabel: string;
  record: RecordSection[];
  motion: string;
  patientMotions: PatientMotionScript[];
};

export type SessionPayload = {
  participantId: string;
  pilot: boolean;
  showConsent: boolean;
  status: ParticipantStatus;
  sequence: Array<SequenceItem & { case: PublicCase }>;
  snapshot: unknown | null;
};

export type Contribution = {
  agentId: AgentKey;
  answer: string;
  keyPoints: string[];
  source: FloorSource;
};

export type PatientReply = { reply: string };

export type Debrief = {
  negativeAgentName: string;
  negativePurpose: string;
  referenceAssessment: string;
  referencePlan: string[];
  caveat: string;
  draft: boolean;
};
