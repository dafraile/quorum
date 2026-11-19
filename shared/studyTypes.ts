// Wire types for the study API, shared by client and server. No imports on purpose.

export type StudyProviderId = "openai" | "anthropic";
export type StudyMode = "dyadic" | "triadic";
export type FloorSource = "static" | "live";
export type PlanStart = "prefilled" | "blank";
/** How a card opens: a full paragraph, or a one-sentence hook that invites a conversation. */
export type OpeningStyle = "paragraph" | "hook";
export type Round = 1 | 2 | 3;
export type Verdict = "accept" | "amend" | "reject";
export type AgentKey = "intern" | "oldNurse" | "biblioRat" | "contrarian" | "patientAdvocate" | "oldGeezer";

export type SequenceItem = {
  caseId: string;
  mode: StudyMode;
  floorSource: FloorSource;
  planStart: PlanStart;
  openingStyle: OpeningStyle;
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
  trigger: { afterInteractions?: number; afterSeconds?: number };
};

/** One result series for the at-a-glance panel, in the record's units with an optional second unit system. */
export type GlanceLab = {
  label: string;
  unit: string;
  altUnit?: string;
  points: Array<{ when: string; value: number; alt?: number }>;
  note?: string;
};

/** The persistent summary beside the table: key facts and result trends, all taken from the record. */
export type Glance = { facts: string[]; labs: GlanceLab[] };

/** What the participant's browser may see of a case (no hidden script, no reference plan). */
export type PublicCase = {
  id: string;
  title: string;
  patientLabel: string;
  record: RecordSection[];
  glance?: Glance;
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
  /** One sentence in the agent's voice that invites the Chair to ask more. */
  hook: string;
  source: FloorSource;
};

/** One line of the proceedings, as the client sends it for debate and synthesis. */
export type ProceedingLine = {
  id: string;
  round: Round;
  speaker: AgentKey | "chair" | "patient";
  /** Who a Chair line was addressed to. */
  to?: AgentKey | "floor" | "patient";
  text: string;
};

export type DebateStance = { agentId: AgentKey; stance: "challenges" | "backs"; point: string };

export type DebateContribution = { agentId: AgentKey; statement: string; stances: DebateStance[] };

export type Candidate = {
  id: string;
  origin: "pin" | "clerk";
  agentIds: AgentKey[];
  /** Verbatim words from the proceedings. */
  quote: string;
  /** The Clerk's one-line label, or empty for a pin. */
  summary: string;
  sourceLineId?: string;
};

export type ClerkProposal = { candidateId: string; verdict: Verdict; amendedText: string };

/** One sealed Minute as sent to the Clerk for its summary. */
export type MinuteInput = { id: string; agentIds: AgentKey[]; text: string; verdict: Verdict };

/** The Clerk's plan-ready restatement of the sealed Minutes: nothing added, every point traced to its Minutes. */
export type MinutesSummary = {
  overview: string;
  points: Array<{ id: string; text: string; minuteIds: string[]; agentIds: AgentKey[] }>;
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
