import { studyAgentById, type StudyAgentId } from "../../shared/studyRoster.ts";
import type { StudyMode } from "../../shared/studyTypes.ts";
import { buildAgentPrompt } from "../prompts.ts";
import { renderRecord, type StudyCase } from "./cases.ts";

export const studyWordLimit = 90;

export type StudyAgentPromptInput = {
  agentId: StudyAgentId;
  studyCase: StudyCase;
  mode: StudyMode;
  /** The Chair's (or the patient's) Motion, when responding to one. */
  motion?: { text: string; filedBy: "chair" | "patient" };
  /** The agent's own earlier contribution, for continuity. */
  previous?: string;
  /** What the patient has said on the Floor so far (triadic mode). */
  patientUtterances?: string[];
};

const modeRules = (agentId: StudyAgentId, mode: StudyMode): string[] => {
  if (mode === "dyadic") {
    return agentId === "patientAdvocate" ? ["The patient is not present in this deliberation."] : [];
  }

  const shared = [
    "Triadic mode: the patient is an acknowledged participant who can see this Floor. Write so that a patient reading over the Chair's shoulder would be informed, not frightened or patronised.",
  ];
  if (agentId === "patientAdvocate") {
    shared.push(
      "The patient has not spoken yet. Until they do, speak for the patient's stated values as recorded in the notes; do not invent preferences the record does not show. You withdraw as soon as the patient speaks.",
    );
  }
  return shared;
};

export const buildStudyAgentPrompt = (input: StudyAgentPromptInput) => {
  const agent = studyAgentById(input.agentId);
  const caseContext = [
    renderRecord(input.studyCase),
    input.patientUtterances?.length
      ? `What the patient has said on the Floor so far:\n${input.patientUtterances.map((line) => `- "${line}"`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const chairQuestion = input.motion
    ? input.motion.filedBy === "patient"
      ? `The patient has filed this Motion on the Floor: "${input.motion.text}". Respond to it from your stance, addressing the Chair.`
      : input.motion.text
    : undefined;

  return buildAgentPrompt({
    agentId: agent.id,
    agentName: agent.name,
    stance: agent.stance,
    tone: agent.tone,
    rules: [...agent.rules, ...modeRules(agent.id, input.mode)],
    motion: input.studyCase.motion,
    caseContext,
    chairQuestion,
    previousOutput: input.previous,
    wordLimit: studyWordLimit,
  });
};

export const patientReplySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string" },
    disclosed: { type: "array", items: { type: "string" } },
  },
  required: ["reply", "disclosed"],
};

export type PatientPromptInput = {
  studyCase: StudyCase;
  question: string;
  history: Array<{ role: "chair" | "patient"; text: string }>;
  floorSummary: string[];
};

export const buildPatientPrompt = ({ studyCase, question, history, floorSummary }: PatientPromptInput) => {
  const { patient } = studyCase;
  const concealed = patient.concealed
    .map((item) => `- [${item.id}] ${item.topic}. Reveal only when ${item.revealWhen}. If revealed, say: ${item.text}`)
    .join("\n");
  const transcript = history.length
    ? history.map((turn) => `${turn.role === "chair" ? "Doctor" : "You"}: ${turn.text}`).join("\n")
    : "(nothing yet)";

  return `You are playing a simulated patient in a medical-education study. A general practitioner (the Doctor) is consulting with you while an AI panel discusses your case on a shared screen you can see.

Who you are: ${patient.persona}

Rules:
- Stay in character. Answer the Doctor's question in one to three short sentences of plain, everyday language.
- Use ONLY the facts below. If asked about something they do not cover, say you are not sure, you don't know, or you haven't noticed. Never invent symptoms, results, history, medicines or events.
- Concealed items: reveal an item only when the Doctor's question genuinely asks about its topic. Do not volunteer, hint at, or foreshadow concealed items otherwise. A general "anything else?" does not unlock them.
- No medical jargon, no diagnoses, no advice. Never say you are an AI, a simulation, or following a script.
- You may refer to what the panel said if the Doctor asks you about it.

Facts you know and will share when asked:
${patient.facts.map((fact) => `- ${fact}`).join("\n")}

Concealed items:
${concealed}

What the panel has said so far (you can see the screen):
${floorSummary.length ? floorSummary.map((line) => `- ${line}`).join("\n") : "(the panel has not spoken yet)"}

Conversation so far:
${transcript}

The Doctor now asks: "${question}"

Return JSON with:
- reply: what you say, in character.
- disclosed: the ids of any concealed items your reply reveals (empty if none).`;
};
