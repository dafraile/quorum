// Who sits at the table and how the table talks about the work. The GP study uses the
// defaults below; the Quorum demo (Clinical training and consultation, Thinking) sets its
// own before it renders a table. One table per page, so a module-level setting is enough.
import { cardBackArt, negativeAgentId, negativePanelLabel, studyAgents, type StudyAgent } from "../../shared/studyRoster";
import type { AgentKey } from "../../shared/studyTypes";

export type TableWords = {
  /** Heading for the material on the table (the record, the case notes, the question). */
  recordTitle: string;
  diagnosis: string;
  plan: string;
  workingTitle: string;
  finalTitle: string;
  finalShort: string;
  /** "your final plan", in running text. */
  finalNoun: string;
  beforeTitle: string;
  /** Under the record heading. */
  recordNote: string;
  confidenceBefore: string;
  confidenceAfter: string;
  changeQuestion: string;
  /** Shown above the case title; the study works it out from the case count when unset. */
  caseLine?: string;
  /** Round names, when they differ from Consultations, Debate, Synthesis. */
  roundNames?: Record<1 | 2 | 3, string>;
  /** The chip for a table without the patient ("You and the panel"). */
  pairLabel?: string;
  /** The rail button that opens the material on the table ("Record"). */
  recordButton?: string;
};

export type TableConfig = {
  domain: "clinical" | "thinking";
  agents: StudyAgent[];
  cardBack: string;
  negativeId?: AgentKey;
  negativeLabel: string;
  words: TableWords;
  /** After the final plan: the reference debrief (library cases) or, when false, a record of the session. */
  debrief: boolean;
  /** Label of the button that leaves the debrief or the record; the study's own labels when unset. */
  finishLabel?: string;
};

export const clinicalWords: TableWords = {
  recordTitle: "Patient record",
  recordNote: "A synthetic record. No real patient.",
  diagnosis: "Working diagnosis",
  plan: "Plan",
  workingTitle: "Your working plan",
  finalTitle: "Your final diagnosis and plan",
  finalShort: "Your final plan",
  finalNoun: "your final plan",
  beforeTitle: "Your plan before the panel spoke",
  confidenceBefore: "Before the panel's discussion is shown, how confident are you in your working diagnosis and plan?",
  confidenceAfter: "After ruling on the panel's contributions, how confident are you in your final diagnosis and plan?",
  changeQuestion: "Did the deliberation change your working diagnosis or plan?",
};

export const studyTableConfig: TableConfig = {
  domain: "clinical",
  agents: studyAgents,
  cardBack: cardBackArt,
  negativeId: negativeAgentId,
  negativeLabel: negativePanelLabel,
  words: clinicalWords,
  debrief: true,
};

let current: TableConfig = studyTableConfig;

export const tableConfig = () => current;
export const setTableConfig = (next: TableConfig) => {
  current = next;
};
export const words = () => current.words;
export const agentById = (id: AgentKey): StudyAgent => current.agents.find((agent) => agent.id === id) ?? studyAgents.find((agent) => agent.id === id)!;
