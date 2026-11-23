// Settings for the Quorum demo tables. Each page sets the table up (who sits, how it talks,
// where requests go) before it renders the shared table from src/study.
import { studyAgents, negativeAgentId, negativePanelLabel, cardBackArt } from "../../shared/studyRoster";
import { thinkingAgents, thinkingCardBack } from "../../shared/thinkingRoster";
import type { AgentKey, PublicCase, StudyMode } from "../../shared/studyTypes";
import { configureApi } from "../study/api";
import { newCaseState, type CaseSlot, type CaseState } from "../study/state";
import { clinicalWords, setTableConfig, type TableWords } from "../study/tableConfig";

export type TableSpec =
  | { domain: "clinical"; caseId: string; mode: StudyMode }
  | { domain: "clinical"; matter: { title: string; text: string; question: string } }
  | { domain: "thinking"; matter: { title: string; text: string; question: string; leaning: string }; seats: AgentKey[] };

export type Budget = Record<1 | 2, number | null>;

export const budgets: Record<string, { label: string; budget: Budget }> = {
  open: { label: "No limit", budget: { 1: null, 2: null } },
  exam: { label: "Five questions, then three in the debate", budget: { 1: 5, 2: 3 } },
  tight: { label: "Three questions, then two", budget: { 1: 3, 2: 2 } },
};

const thinkingWords: TableWords = {
  recordTitle: "Your question",
  recordNote: "What you brought to the table.",
  diagnosis: "Where you stand",
  plan: "What you'll do",
  workingTitle: "Where you stand now",
  finalTitle: "Where you've landed",
  finalShort: "Where you landed",
  finalNoun: "where you land",
  beforeTitle: "What you brought to the table",
  confidenceBefore: "How sure are you, before the table speaks?",
  confidenceAfter: "After the deliberation, how sure are you?",
  changeQuestion: "Did the deliberation change your view?",
  caseLine: "Thinking",
  roundNames: { 1: "Conversations", 2: "Debate", 3: "Synthesis" },
  pairLabel: "You and your table",
  recordButton: "Question",
};

/** Points every request at the demo API with this table, and sets who sits and how the table talks. */
export const setUpTable = (spec: TableSpec, finishLabel: string) => {
  configureApi({ base: "/api/quorum", body: () => ({ table: spec }), events: false });
  if (spec.domain === "thinking") {
    setTableConfig({
      domain: "thinking",
      agents: thinkingAgents,
      cardBack: thinkingCardBack,
      negativeLabel: "",
      words: thinkingWords,
      debrief: false,
      finishLabel,
    });
    return;
  }
  const library = "caseId" in spec;
  setTableConfig({
    domain: "clinical",
    agents: studyAgents,
    cardBack: cardBackArt,
    negativeId: negativeAgentId,
    negativeLabel: negativePanelLabel,
    words: library
      ? { ...clinicalWords, caseLine: "Training" }
      : { ...clinicalWords, recordTitle: "Case notes", recordNote: "Anonymised by you before anything was sent.", caseLine: "Consultation" },
    debrief: library,
    finishLabel,
  });
};

const linesOf = (text: string) =>
  text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

/** The case as the table shows it; mirrors what the server builds from the same matter. */
export const customCase = (spec: Exclude<TableSpec, { caseId: string }>): PublicCase => {
  if (spec.domain === "thinking") {
    const { matter } = spec;
    return {
      id: "custom",
      title: matter.title || "A question",
      patientLabel: "the Chair",
      record: [
        { heading: "The question", lines: [matter.question] },
        ...(matter.text.trim() ? [{ heading: "Context", lines: linesOf(matter.text) }] : []),
        ...(matter.leaning.trim() ? [{ heading: "Where you lean now", lines: [matter.leaning.trim()] }] : []),
      ],
      motion: matter.question,
      patientMotions: [],
    };
  }
  return {
    id: "custom",
    title: spec.matter.title || "Your case",
    patientLabel: "the patient",
    record: [{ heading: "Case notes (anonymised by the clinician)", lines: linesOf(spec.matter.text) }],
    motion: spec.matter.question || "What is going on with this patient, and what should be done?",
    patientMotions: [],
  };
};

export const slotFor = (publicCase: PublicCase, mode: StudyMode, library: boolean): CaseSlot => ({
  caseId: publicCase.id,
  mode,
  floorSource: library ? "static" : "live",
  planStart: "prefilled",
  openingStyle: "hook",
  case: publicCase,
});

export const freshTable = (budget: Budget, seats?: AgentKey[]): CaseState => ({
  ...newCaseState(),
  budget,
  seats,
  focus: seats?.[0] ?? "intern",
});

export { thinkingAgents, studyAgents };
