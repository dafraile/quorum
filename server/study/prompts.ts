import { allStudyAgentIds, negativeAgentId, studyAgentById, type StudyAgentId } from "../../shared/studyRoster.ts";
import type { ProceedingLine, Round, StudyMode, Verdict } from "../../shared/studyTypes.ts";
import { agentResultSchema, buildAgentPrompt } from "../prompts.ts";
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

const hookInstruction = `
- hook: one sentence of at most 20 words, in your own voice, that would make the Chair want to ask you more: a pointed question or observation drawn from your contribution. Do not give away your whole point.`;

/** Opening contribution schema: the agent result plus a one-sentence hook. */
export const studyOpeningSchema = {
  ...agentResultSchema,
  properties: { ...agentResultSchema.properties, hook: { type: "string" } },
  required: [...agentResultSchema.required, "hook"],
};

export const buildStudyOpeningPrompt = (input: StudyAgentPromptInput) => `${buildStudyAgentPrompt(input)}${hookInstruction}`;

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


// ---------------------------------------------------------------- the table: chat, debate, Clerk

const speakerName = (speaker: ProceedingLine["speaker"], patientLabel: string) =>
  speaker === "chair" ? "The Chair (GP)" : speaker === "patient" ? `${patientLabel} (the patient)` : studyAgentById(speaker).name;

const addresseeName = (to: ProceedingLine["to"], patientLabel: string) =>
  to === "floor" ? "the whole Floor" : to === "patient" ? patientLabel : to ? studyAgentById(to).name : "";

export const formatProceedings = (lines: ProceedingLine[], patientLabel: string, withIds = false) =>
  lines
    .map((line) => {
      const who =
        line.speaker === "chair" && line.to
          ? `The Chair to ${addresseeName(line.to, patientLabel)}`
          : speakerName(line.speaker, patientLabel);
      return `${withIds ? `[${line.id}] ` : ""}(round ${line.round}) ${who}: ${line.text}`;
    })
    .join("\n");

const quorumFrame = `Quorum is a chaired deliberation for clinical reasoning. The human clinician, a general practitioner, is the Chair. The Chair decides; you contribute deliberation. The point of Quorum is structural variety: each panel member reveals different risks, assumptions and blind spots. Do not imitate a generic medical assistant and do not drift toward consensus because others sound plausible.

Rules of exchange:
- Do not diagnose or prescribe as a final authority.
- Stay inside your archetype unless the safety override applies.
- Be specific to facts visible in the case record and the proceedings. Never invent results, history or events.
- Prefer one or two high-signal points over textbook coverage.

Safety override: if the case shows an urgent red flag needing immediate care, break persona and start with "SAFETY FLAG:", briefly saying why deliberation should pause. Do not invent emergencies from absent facts.`;

const archetypeBlock = (agentId: StudyAgentId, mode: StudyMode) => {
  const agent = studyAgentById(agentId);
  const rules = [...agent.rules, ...modeRules(agentId, mode)].map((rule) => `- ${rule}`).join("\n");
  return `Your archetype: ${agent.name}
Stance: ${agent.stance}
Voice: ${agent.tone}
Role-specific rules:
${rules}`;
};

export type ChatKind = "question" | "motion" | "hook" | "patient-motion";

export type ChatPromptInput = {
  agentId: StudyAgentId;
  studyCase: StudyCase;
  mode: StudyMode;
  round: Round;
  kind: ChatKind;
  /** The Chair's words, or the patient's Motion. Empty for "hook". */
  message: string;
  /** This panel member's own conversation with the Chair so far. */
  thread: Array<{ speaker: "chair" | "agent"; text: string; toFloor?: boolean }>;
  opening?: { answer: string; hook: string };
  /** Round 2 and later: everything said so far, so the agent can refer to the others. */
  proceedings?: ProceedingLine[];
  debateStatement?: string;
  patientUtterances?: string[];
};

export const buildChatPrompt = (input: ChatPromptInput) => {
  const agent = studyAgentById(input.agentId);
  const patientLabel = input.studyCase.patientLabel;
  const thread = input.thread.length
    ? input.thread
        .map((turn) =>
          turn.speaker === "chair" ? `Chair${turn.toFloor ? " (to the whole Floor)" : ""}: ${turn.text}` : `You: ${turn.text}`,
        )
        .join("\n")
    : "(no conversation yet)";

  const situation =
    input.round === 1
      ? "Round 1, consultations. The Chair is speaking with panel members one at a time, or putting a Motion to the whole Floor. You have not heard the others' private conversations."
      : `Round ${input.round}, the debate. You have read everything said so far, including the Chair's conversations with the others${input.mode === "triadic" ? " and with the patient" : ""}. You may agree with or contest what others said, naming them.`;

  const ask =
    input.kind === "hook"
      ? `Your opening line to the Chair was: "${input.opening?.hook ?? ""}". The Chair has turned to you to hear you out. Make your point now, conversationally, drawing on what you prepared:\n${input.opening?.answer ?? ""}`
      : input.kind === "patient-motion"
        ? `The patient has raised this on the Floor: "${input.message}". The Chair has put it to the panel. Respond from your stance, addressing the Chair and acknowledging the patient.`
        : input.kind === "motion"
          ? `The Chair puts this Motion to the whole Floor: "${input.message}". Answer it from your stance.`
          : `The Chair says to you: "${input.message}". Answer the Chair directly; do not restart the whole case.`;

  return `You are ${agent.name}, a panel member at the table in Quorum.

${quorumFrame}

${archetypeBlock(input.agentId, input.mode)}

${situation}

Case record:
${renderRecord(input.studyCase)}
${input.patientUtterances?.length ? `\nWhat the patient has said so far:\n${input.patientUtterances.map((line) => `- "${line}"`).join("\n")}\n` : ""}${
    input.opening ? `\nYour opening contribution this case:\n${input.opening.answer}\n` : ""
  }${input.proceedings?.length ? `\nThe proceedings so far:\n${formatProceedings(input.proceedings, patientLabel)}\n` : ""}${
    input.debateStatement ? `\nYour statement in the debate:\n${input.debateStatement}\n` : ""
  }
Your conversation with the Chair so far:
${thread}

${ask}

Reply in plain text, in your own voice, in under 70 words unless the Chair asks for more. Speak to the Chair directly. No headings, lists or markdown.`;
};

export const debateSchema = (selfId: StudyAgentId, others: StudyAgentId[]) => ({
  type: "object",
  additionalProperties: false,
  properties: {
    statement: { type: "string" },
    stances: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          agentId: { type: "string", enum: others.filter((id) => id !== selfId) },
          stance: { type: "string", enum: ["challenges", "backs"] },
          point: { type: "string" },
        },
        required: ["agentId", "stance", "point"],
      },
    },
  },
  required: ["statement", "stances"],
});

export type DebatePromptInput = {
  agentId: StudyAgentId;
  studyCase: StudyCase;
  mode: StudyMode;
  others: StudyAgentId[];
  proceedings: ProceedingLine[];
  pinned: string[];
  patientUtterances?: string[];
};

export const buildDebatePrompt = (input: DebatePromptInput) => {
  const agent = studyAgentById(input.agentId);
  const roster = input.others
    .filter((id) => id !== input.agentId)
    .map((id) => `- ${id}: ${studyAgentById(id).name}`)
    .join("\n");
  return `You are ${agent.name}, a panel member at the table in Quorum.

${quorumFrame}

${archetypeBlock(input.agentId, input.mode)}

Round 2, the debate. The Chair has called a new Session. You have now read everything said in round 1, including the Chair's private conversations with each panel member${input.mode === "triadic" ? " and with the patient" : ""}. Pass it through your own stance: what did the others get right or wrong, what has been missed, and where should the Chair push back?

Rules for the debate:
- Respond to specific things other panel members said, naming them.
- Give one to three stances. Challenge at least one point unless you genuinely agree with everything, in which case say what everyone has missed.
- Do not repeat your opening; move the argument forward.
- statement: under 70 words, addressed to the Chair, plain text.
- Each stance point: under 25 words.

Panel members you may respond to (use these ids):
${roster}

Case record:
${renderRecord(input.studyCase)}
${input.patientUtterances?.length ? `\nWhat the patient has said:\n${input.patientUtterances.map((line) => `- "${line}"`).join("\n")}\n` : ""}
The round 1 proceedings:
${formatProceedings(input.proceedings, input.studyCase.patientLabel)}
${input.pinned.length ? `\nWhat the Chair has marked to carry forward so far:\n${input.pinned.map((line) => `- "${line}"`).join("\n")}\n` : ""}
Return JSON with:
- statement: your debate contribution.
- stances: one to three objects with agentId (from the list), stance ("challenges" or "backs") and point.`;
};

export const clerkCandidatesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          lineId: { type: "string" },
          agentIds: { type: "array", items: { type: "string", enum: allStudyAgentIds } },
          quote: { type: "string" },
          summary: { type: "string" },
        },
        required: ["lineId", "agentIds", "quote", "summary"],
      },
    },
  },
  required: ["candidates"],
};

export const buildClerkCandidatesPrompt = (input: {
  studyCase: StudyCase;
  proceedings: ProceedingLine[];
  pinned: Array<{ agentId: StudyAgentId; quote: string }>;
}) => `You are the Clerk in Quorum. You keep the record. You have no clinical opinion and never argue.

The Chair, a general practitioner, is about to rule on what the panel said: what to carry forward into the Minutes, what to carry forward in part, and what to leave out. Prepare the candidates for those rulings: the distinct recommendations, concerns or questions the panel put to the Chair.

Rules:
- Four to eight candidates. Each is one recommendation, concern or question, attributed to the panel member or members who made it.
- Include at least one candidate from every panel member who spoke, including ${studyAgentById(negativeAgentId).name}, whose contributions are listed like everyone else's and without comment.
- lineId: the id of the line the quote comes from.
- quote: copy verbatim from that line the shortest continuous span (a clause or one or two sentences) that carries this candidate. Do not paraphrase, cut words out of the middle, or join separate sentences. Two candidates should not share the same quote.
- summary: under 15 words, neutral, phrased as the recommendation itself (for example "Repeat the kidney function tests before changing diuretics").
- Leave out anything the Chair has already pinned (listed below), and never use the Chair's or the patient's own words as a candidate.

Case: ${input.studyCase.title}

Proceedings (each line has an id):
${formatProceedings(input.proceedings, input.studyCase.patientLabel, true)}

Already pinned by the Chair:
${input.pinned.length ? input.pinned.map((pin) => `- ${studyAgentById(pin.agentId).name}: "${pin.quote}"`).join("\n") : "(nothing)"}

Return JSON with candidates: objects with lineId, agentIds, quote and summary.`;

export const clerkChatSchema = (candidateIds: string[]) => ({
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string" },
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          candidateId: { type: "string", enum: candidateIds.length ? candidateIds : ["none"] },
          verdict: { type: "string", enum: ["accept", "amend", "reject"] },
          amendedText: { type: "string" },
        },
        required: ["candidateId", "verdict", "amendedText"],
      },
    },
  },
  required: ["reply", "proposals"],
});

export const clerkSummarySchema = (minuteIds: string[]) => ({
  type: "object",
  additionalProperties: false,
  properties: {
    overview: { type: "string" },
    points: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          minuteIds: { type: "array", items: { type: "string", enum: minuteIds.length ? minuteIds : ["none"] } },
        },
        required: ["text", "minuteIds"],
      },
    },
  },
  required: ["overview", "points"],
});

export const buildClerkSummaryPrompt = (input: {
  studyCase: StudyCase;
  minutes: Array<{ id: string; agentIds: StudyAgentId[]; text: string; verdict: Verdict }>;
}) => `You are the Clerk in Quorum. You keep the record. You have no clinical opinion, never argue and never advise.

The Chair, a general practitioner, has sealed the Minutes: the points from the panel they chose to carry forward, some in part or in their own words. Write the summary the Chair will take into their final plan.

Rules:
- Restate only what the Minutes say. Add nothing: no new tests, drugs, doses, timings, reasons or warnings, and no judgement of your own.
- Each point is one plan-ready line under 25 words, in the imperative where the Minute is an action ("Check standing blood pressure before changing diuretics"), or as a question or concern where the Minute is one ("Ask whether he is limiting his fluids").
- Keep each Minute's hedges and conditions. Where the Chair carried a point in part, use only the part they kept.
- Merge Minutes only when they say the same thing; list every Minute a point draws on in minuteIds. Every Minute appears in at least one point.
- Keep the order of the Minutes. Do not name the panel members in the text.
- overview: one or two neutral sentences saying what the Minutes cover.

Case: ${input.studyCase.title}

The sealed Minutes:
${input.minutes
  .map(
    (item) =>
      `[${item.id}] (${item.agentIds.map((id) => studyAgentById(id).name).join(" and ")}${item.verdict === "amend" ? ", carried in part" : ""}) "${item.text}"`,
  )
  .join("\n")}

Return JSON with overview and points (text, minuteIds).`;

export type ClerkChatInput = {
  studyCase: StudyCase;
  candidates: Array<{ id: string; agentIds: StudyAgentId[]; quote: string; summary: string; ruling?: string }>;
  history: Array<{ speaker: "chair" | "clerk"; text: string }>;
  message: string;
};

export const buildClerkChatPrompt = (input: ClerkChatInput) => {
  const list = input.candidates
    .map(
      (item, index) =>
        `[${item.id}] (#${index + 1}, ${item.agentIds.map((id) => studyAgentById(id).name).join(" and ")}) "${item.quote}"${
          item.summary ? ` (${item.summary})` : ""
        }. Current ruling: ${item.ruling ?? "none"}`,
    )
    .join("\n");
  const history = input.history.length
    ? input.history.map((turn) => `${turn.speaker === "chair" ? "Chair" : "Clerk"}: ${turn.text}`).join("\n")
    : "(none yet)";
  return `You are the Clerk in Quorum. You keep the record. You have no clinical opinion, never argue and never advise.

The Chair, a general practitioner, is ruling by conversation on which candidates to carry into the Minutes. Translate what the Chair says into proposed rulings. The Chair confirms them before anything enters the Minutes.

Verdicts:
- accept: carry forward as said.
- amend: carry forward in part or changed. amendedText must hold the Chair's version: an excerpt of the quote, or the wording the Chair gave. Never your own words.
- reject: leave out.

Rules:
- Propose rulings only for candidates the Chair's message clearly refers to, by speaker, topic or number. Several at once is fine ("drop everything from the Contrarian", "keep the rest").
- If the Chair's intent is unclear, propose nothing and ask one short question.
- A candidate already ruled can be ruled again if the Chair changes their mind.
- reply: one or two plain sentences confirming what you propose, or your question.
- amendedText is an empty string unless the verdict is amend.

Case: ${input.studyCase.title}

Candidates:
${list}

Conversation so far:
${history}

The Chair says: "${input.message}"

Return JSON with reply and proposals (candidateId, verdict, amendedText).`;
};
