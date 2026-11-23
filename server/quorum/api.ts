// Product API for the Quorum demo: Clinical (training on library cases, consultation on a
// pasted, anonymised case) and Thinking. Stateless: the client sends the table with every
// request. Nothing is stored. The GP study keeps its own routes (/api/study/*) and prompts.
//
// These routes call the model providers for anyone who can reach the server, so they are
// off unless QUORUM_DEMO is "on" (or unset outside production). Gate them before exposing.
import type { IncomingMessage, ServerResponse } from "node:http";
import { isStudyAgentId, negativeAgentId, studyAgentById, type StudyAgentId } from "../../shared/studyRoster.ts";
import type {
  Candidate,
  ClerkProposal,
  Contribution,
  DebateContribution,
  DebateStance,
  Debrief,
  FloorSource,
  MinutesSummary,
  StudyMode,
  Verdict,
} from "../../shared/studyTypes.ts";
import { callStructured, streamText, ProviderError, type ProviderId } from "../providers/index.ts";
import {
  HttpError,
  agentList,
  chatKinds,
  clerkProvider,
  debriefCaveat,
  envEffort,
  listOfStrings,
  negativePurpose,
  parseProceedings,
  parseRound,
  readBody,
  route,
  send,
  shortText,
  textList,
  verbatimQuote,
  verdicts,
} from "../study/api.ts";
import { publicCase, studyCaseById, studyCases, type StudyCase } from "../study/cases.ts";
import { loadStaticFloor } from "../study/floors.ts";
import {
  buildChatPrompt,
  buildClerkCandidatesPrompt,
  buildClerkChatPrompt,
  buildClerkSummaryPrompt,
  buildDebatePrompt,
  buildPatientPrompt,
  buildStudyOpeningPrompt,
  clerkCandidatesSchema,
  clerkChatSchema,
  clerkSummarySchema,
  debateSchema,
  patientReplySchema,
  studyOpeningSchema,
  type ChatKind,
} from "../study/prompts.ts";
import {
  buildThinkingChatPrompt,
  buildThinkingClerkCandidatesPrompt,
  buildThinkingClerkChatPrompt,
  buildThinkingClerkSummaryPrompt,
  buildThinkingDebatePrompt,
  buildThinkingOpeningPrompt,
  thinkingOpeningSchema,
} from "./thinkingPrompts.ts";

type Domain = "clinical" | "thinking";

type Table = {
  domain: Domain;
  /** A library case (clinical training) or a matter built from what the user typed. */
  studyCase: StudyCase;
  library: boolean;
  mode: StudyMode;
};

const maxMatterChars = 12_000;

/** One provider per seat, mixed as in the study so the panel does not speak with one model's voice. */
const providerMix: Record<StudyAgentId, ProviderId> = {
  intern: "openai",
  oldNurse: "anthropic",
  biblioRat: "anthropic",
  contrarian: "openai",
  patientAdvocate: "anthropic",
  oldGeezer: "openai",
};

const providerFor = (agentId: StudyAgentId): ProviderId => {
  const forced = process.env.QUORUM_PROVIDER;
  return forced === "openai" || forced === "anthropic" ? forced : providerMix[agentId];
};

const linesOf = (text: string) =>
  text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 200);

const customMatter = (domain: Domain, matter: any): StudyCase => {
  const title = shortText(matter?.title, 120).trim() || (domain === "thinking" ? "A question" : "A case");
  const text = shortText(matter?.text, maxMatterChars).trim();
  const question = shortText(matter?.question, 600).trim();
  if (domain === "thinking" && !question) throw new HttpError(400, "Put a question to the table");
  if (domain === "clinical" && !text) throw new HttpError(400, "The case is empty");
  const record =
    domain === "thinking"
      ? [
          { heading: "The question", lines: [question] },
          ...(text ? [{ heading: "Context", lines: linesOf(text) }] : []),
          ...(matter?.leaning ? [{ heading: "Where the Chair leans now", lines: [shortText(matter.leaning, 1200)] }] : []),
        ]
      : [{ heading: "Case notes (anonymised by the clinician)", lines: linesOf(text) }];
  return {
    id: "custom",
    scenario: "S2-known-complex-recent-change",
    title,
    patientLabel: domain === "thinking" ? "the Chair" : "the patient",
    record,
    motion: question || "What is going on with this patient, and what should be done?",
    patient: { persona: "", facts: [], concealed: [], motions: [] },
    debrief: { referenceAssessment: "", referencePlan: [], draft: true },
  };
};

const tableFor = (body: Record<string, any>): Table => {
  const spec = body.table ?? {};
  const domain: Domain = spec.domain === "thinking" ? "thinking" : "clinical";
  if (domain === "clinical" && typeof spec.caseId === "string") {
    const studyCase = studyCaseById(spec.caseId);
    if (!studyCase) throw new HttpError(404, "Unknown case");
    return { domain, studyCase, library: true, mode: spec.mode === "triadic" ? "triadic" : "dyadic" };
  }
  return { domain, studyCase: customMatter(domain, spec.matter), library: false, mode: "dyadic" };
};

const agentOf = (value: unknown): StudyAgentId => {
  if (!isStudyAgentId(value)) throw new HttpError(400, "Unknown agent");
  return value;
};

// ---------------------------------------------------------------- the case library

const library = route("GET", async (_req, res) => {
  send(res, 200, {
    cases: studyCases.map((item) => ({ ...publicCase(item, true), hasPatient: item.patient.facts.length > 0 })),
  });
});

// ---------------------------------------------------------------- openings

const staticFloor = route("POST", async (req, res) => {
  const table = tableFor(await readBody(req));
  if (!table.library) throw new HttpError(409, "Only library cases have a prepared Floor");
  const floor = await loadStaticFloor(table.studyCase.id);
  const byAgent = floor?.contributions[table.mode];
  if (!floor || !byAgent) throw new HttpError(409, "No prepared Floor for this case");
  const contributions: Contribution[] = Object.entries(byAgent).flatMap(([agentId, item]) =>
    isStudyAgentId(agentId) && item
      ? [{ agentId, answer: item.answer, keyPoints: item.keyPoints, hook: item.hook ?? "", source: "static" as FloorSource }]
      : [],
  );
  send(res, 200, { contributions, vetted: floor.vetted });
});

const contribution = route("POST", async (req, res) => {
  const body = await readBody(req);
  const table = tableFor(body);
  const agentId = agentOf(body.agentId);
  const thinking = table.domain === "thinking";
  const result = await callStructured({
    provider: providerFor(agentId),
    prompt: thinking
      ? buildThinkingOpeningPrompt({ agentId, studyCase: table.studyCase })
      : buildStudyOpeningPrompt({ agentId, studyCase: table.studyCase, mode: table.mode }),
    schemaName: "quorum_opening",
    schema: thinking ? thinkingOpeningSchema : studyOpeningSchema,
    effort: envEffort("QUORUM_LIVE_EFFORT", "medium"),
    timeoutMs: 60_000,
  });
  const parsed = (result.parsed ?? {}) as { answer?: string; keyPoints?: unknown; hook?: string };
  const payload: Contribution = {
    agentId,
    answer: (parsed.answer || result.text).trim(),
    keyPoints: listOfStrings(parsed.keyPoints).slice(0, 4),
    hook: (parsed.hook ?? "").trim(),
    source: "live",
  };
  send(res, 200, payload);
});

// ---------------------------------------------------------------- talking at the table

const chat = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "POST") {
    send(res, 405, { error: "Method not allowed" });
    return;
  }
  let provider: ProviderId;
  let prompt: string;
  try {
    const body = await readBody(req);
    const table = tableFor(body);
    const agentId = agentOf(body.agentId);
    const kind: ChatKind = chatKinds.has(body.kind) ? body.kind : "question";
    const message = shortText(body.message, 2000).trim();
    if (kind !== "hook" && !message) throw new HttpError(400, "Empty message");
    const round = parseRound(body.round);
    const thread = (Array.isArray(body.thread) ? body.thread : []).slice(-20).flatMap((turn: any) =>
      (turn?.speaker === "chair" || turn?.speaker === "agent") && typeof turn.text === "string"
        ? [{ speaker: turn.speaker as "chair" | "agent", text: turn.text.slice(0, 3000), toFloor: Boolean(turn.toFloor) }]
        : [],
    );
    const opening =
      body.opening && typeof body.opening.answer === "string"
        ? { answer: body.opening.answer.slice(0, 4000), hook: shortText(body.opening.hook, 400) }
        : undefined;
    const shared = {
      agentId,
      studyCase: table.studyCase,
      round,
      kind,
      message,
      thread,
      opening,
      proceedings: round > 1 ? parseProceedings(body.proceedings) : undefined,
      debateStatement: shortText(body.debateStatement, 2000) || undefined,
    };
    provider = providerFor(agentId);
    prompt =
      table.domain === "thinking"
        ? buildThinkingChatPrompt(shared)
        : buildChatPrompt({
            ...shared,
            mode: table.mode,
            patientUtterances: table.mode === "triadic" ? textList(body.patientUtterances, 12, 600) : undefined,
          });
  } catch (error) {
    const status = error instanceof HttpError || error instanceof ProviderError ? error.status : 500;
    send(res, status, { error: error instanceof Error ? error.message : "Unknown server error" });
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  const write = (line: Record<string, unknown>) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(line)}\n`);
  };
  try {
    const result = await streamText(
      { provider, prompt, effort: envEffort("QUORUM_CHAT_EFFORT", "low"), timeoutMs: 60_000, signal: controller.signal },
      (delta) => write({ t: "d", v: delta }),
    );
    write({ t: "end", provider: result.provider, model: result.model });
  } catch (error) {
    write({ t: "err", error: error instanceof Error ? error.message : String(error) });
  }
  res.end();
};

const debate = route("POST", async (req, res) => {
  const body = await readBody(req);
  const table = tableFor(body);
  const agentId = agentOf(body.agentId);
  const others = agentList(body.others).filter((id) => id !== agentId);
  if (!others.length) throw new HttpError(400, "No one to debate");
  const proceedings = parseProceedings(body.proceedings);
  const pinned = textList(body.pinned, 20, 600);
  const result = await callStructured({
    provider: providerFor(agentId),
    prompt:
      table.domain === "thinking"
        ? buildThinkingDebatePrompt({ agentId, studyCase: table.studyCase, others, proceedings, pinned })
        : buildDebatePrompt({
            agentId,
            studyCase: table.studyCase,
            mode: table.mode,
            others,
            proceedings,
            pinned,
            patientUtterances: table.mode === "triadic" ? textList(body.patientUtterances, 12, 600) : undefined,
          }),
    schemaName: "quorum_debate",
    schema: debateSchema(agentId, others),
    effort: envEffort("QUORUM_LIVE_EFFORT", "medium"),
    timeoutMs: 75_000,
  });
  const parsed = (result.parsed ?? {}) as { statement?: string; stances?: unknown };
  const stances: DebateStance[] = (Array.isArray(parsed.stances) ? parsed.stances : [])
    .flatMap((item: any) =>
      isStudyAgentId(item?.agentId) && others.includes(item.agentId) && typeof item.point === "string"
        ? [{ agentId: item.agentId, stance: item.stance === "backs" ? ("backs" as const) : ("challenges" as const), point: item.point.trim() }]
        : [],
    )
    .slice(0, 3);
  send(res, 200, { agentId, statement: (parsed.statement ?? result.text).trim(), stances } satisfies DebateContribution);
});

// ---------------------------------------------------------------- the Clerk

const clerkCandidates = route("POST", async (req, res) => {
  const body = await readBody(req);
  const table = tableFor(body);
  const proceedings = parseProceedings(body.proceedings);
  const pinned = (Array.isArray(body.pinned) ? body.pinned : []).flatMap((pin: any) =>
    isStudyAgentId(pin?.agentId) && typeof pin.quote === "string" ? [{ agentId: pin.agentId as StudyAgentId, quote: pin.quote.slice(0, 1000) }] : [],
  );
  const input = { studyCase: table.studyCase, proceedings, pinned };
  const result = await callStructured({
    provider: clerkProvider(),
    prompt: table.domain === "thinking" ? buildThinkingClerkCandidatesPrompt(input) : buildClerkCandidatesPrompt(input),
    schemaName: "quorum_clerk_candidates",
    schema: clerkCandidatesSchema,
    effort: "medium",
    timeoutMs: 90_000,
  });
  const lines = new Map(proceedings.map((line) => [line.id, line]));
  const parsed = (result.parsed ?? {}) as { candidates?: unknown };
  const candidates: Candidate[] = (Array.isArray(parsed.candidates) ? parsed.candidates : [])
    .flatMap((item: any, index: number) => {
      const line = lines.get(item?.lineId);
      if (!line || !isStudyAgentId(line.speaker)) return [];
      const agentIds = agentList(item.agentIds);
      return [
        {
          id: `clerk-${index + 1}`,
          origin: "clerk" as const,
          agentIds: agentIds.length ? agentIds : [line.speaker],
          quote: verbatimQuote(typeof item.quote === "string" ? item.quote : "", line.text),
          summary: typeof item.summary === "string" ? item.summary.trim().slice(0, 200) : "",
          sourceLineId: line.id,
        },
      ];
    })
    .slice(0, 10);
  send(res, 200, { candidates });
});

const clerkChat = route("POST", async (req, res) => {
  const body = await readBody(req);
  const table = tableFor(body);
  const message = shortText(body.message, 2000).trim();
  if (!message) throw new HttpError(400, "Empty message");
  const candidates = (Array.isArray(body.candidates) ? body.candidates : []).slice(0, 30).flatMap((item: any) =>
    typeof item?.id === "string" && typeof item.quote === "string"
      ? [
          {
            id: item.id.slice(0, 60),
            agentIds: agentList(item.agentIds),
            quote: item.quote.slice(0, 1500),
            summary: shortText(item.summary, 300),
            ruling: shortText(item.ruling, 400) || undefined,
          },
        ]
      : [],
  );
  const history = (Array.isArray(body.history) ? body.history : []).slice(-12).flatMap((turn: any) =>
    (turn?.speaker === "chair" || turn?.speaker === "clerk") && typeof turn.text === "string"
      ? [{ speaker: turn.speaker as "chair" | "clerk", text: turn.text.slice(0, 1500) }]
      : [],
  );
  const ids = candidates.map((item: { id: string }) => item.id);
  const input = { studyCase: table.studyCase, candidates, history, message };
  const result = await callStructured({
    provider: clerkProvider(),
    prompt: table.domain === "thinking" ? buildThinkingClerkChatPrompt(input) : buildClerkChatPrompt(input),
    schemaName: "quorum_clerk_chat",
    schema: clerkChatSchema(ids),
    effort: "low",
    timeoutMs: 60_000,
  });
  const parsed = (result.parsed ?? {}) as { reply?: string; proposals?: unknown };
  const proposals: ClerkProposal[] = (Array.isArray(parsed.proposals) ? parsed.proposals : []).flatMap((item: any) =>
    ids.includes(item?.candidateId) && verdicts.has(item.verdict)
      ? [{ candidateId: item.candidateId, verdict: item.verdict, amendedText: item.verdict === "amend" ? shortText(item.amendedText, 1500).trim() : "" }]
      : [],
  );
  send(res, 200, { reply: (parsed.reply ?? "").trim() || "Noted.", proposals });
});

const clerkSummary = route("POST", async (req, res) => {
  const body = await readBody(req);
  const table = tableFor(body);
  const minutes = (Array.isArray(body.minutes) ? body.minutes : []).slice(0, 30).flatMap((item: any) =>
    typeof item?.id === "string" && typeof item.text === "string" && item.text.trim() && verdicts.has(item.verdict)
      ? [{ id: item.id.slice(0, 60), agentIds: agentList(item.agentIds), text: item.text.slice(0, 1500), verdict: item.verdict as Verdict }]
      : [],
  );
  if (!minutes.length) {
    send(res, 200, { overview: "Nothing was carried forward into the Minutes.", points: [] } satisfies MinutesSummary);
    return;
  }
  const ids = minutes.map((item: { id: string }) => item.id);
  const input = { studyCase: table.studyCase, minutes };
  const result = await callStructured({
    provider: clerkProvider(),
    prompt: table.domain === "thinking" ? buildThinkingClerkSummaryPrompt(input) : buildClerkSummaryPrompt(input),
    schemaName: "quorum_minutes_summary",
    schema: clerkSummarySchema(ids),
    effort: "low",
    timeoutMs: 60_000,
  });
  const parsed = (result.parsed ?? {}) as { overview?: string; points?: unknown };
  const points: MinutesSummary["points"] = (Array.isArray(parsed.points) ? parsed.points : []).flatMap((item: any, index: number) => {
    const text = shortText(item?.text, 600).trim();
    const minuteIds: string[] = Array.isArray(item?.minuteIds) ? [...new Set<string>(item.minuteIds.filter((id: unknown) => ids.includes(id as string)))] : [];
    if (!text || !minuteIds.length) return [];
    const agentIds = [...new Set(minuteIds.flatMap((id) => minutes.find((minute: { id: string }) => minute.id === id)?.agentIds ?? []))];
    return [{ id: `sum-${index + 1}`, text, minuteIds, agentIds }];
  });
  const covered = new Set(points.flatMap((point) => point.minuteIds));
  for (const minute of minutes) {
    if (!covered.has(minute.id)) points.push({ id: `sum-${points.length + 1}`, text: minute.text, minuteIds: [minute.id], agentIds: minute.agentIds });
  }
  send(res, 200, { overview: shortText(parsed.overview, 600).trim(), points } satisfies MinutesSummary);
});

// ---------------------------------------------------------------- the patient and the debrief (library cases)

const patient = route("POST", async (req, res) => {
  const body = await readBody(req);
  const table = tableFor(body);
  if (!table.library || table.mode !== "triadic") throw new HttpError(400, "The patient takes part only in training cases with the patient in the room");
  const question = shortText(body.question, 1000).trim();
  if (!question) throw new HttpError(400, "Empty question");
  const history = (Array.isArray(body.history) ? body.history : []).slice(-16).flatMap((turn: any) =>
    (turn?.role === "chair" || turn?.role === "patient") && typeof turn.text === "string"
      ? [{ role: turn.role as "chair" | "patient", text: turn.text.slice(0, 1000) }]
      : [],
  );
  const result = await callStructured({
    provider: process.env.STUDY_PATIENT_PROVIDER === "openai" ? "openai" : "anthropic",
    prompt: buildPatientPrompt({ studyCase: table.studyCase, question, history, floorSummary: textList(body.floorSummary, 14, 300) }),
    schemaName: "quorum_patient_reply",
    schema: patientReplySchema,
    effort: "low",
    timeoutMs: 45_000,
  });
  const parsed = (result.parsed ?? {}) as { reply?: string };
  send(res, 200, { reply: (parsed.reply || result.text).trim() });
});

const debrief = route("POST", async (req, res) => {
  const table = tableFor(await readBody(req));
  if (!table.library) throw new HttpError(404, "No debrief for this table");
  const payload: Debrief = {
    negativeAgentName: studyAgentById(negativeAgentId).name,
    negativePurpose,
    referenceAssessment: table.studyCase.debrief.referenceAssessment,
    referencePlan: table.studyCase.debrief.referencePlan,
    caveat: debriefCaveat,
    draft: table.studyCase.debrief.draft,
  };
  send(res, 200, payload);
});

/** The table logs nothing in the demo; the client's event queue still posts here. */
const ignore = route("POST", async (req, res) => {
  await readBody(req);
  send(res, 200, { ok: true });
});

export const quorumEnabled = () => {
  const flag = process.env.QUORUM_DEMO;
  if (flag === "on") return true;
  if (flag === "off") return false;
  return process.env.NODE_ENV !== "production";
};

export const quorumRoutes = {
  "/api/quorum/library": library,
  "/api/quorum/static-floor": staticFloor,
  "/api/quorum/contribution": contribution,
  "/api/quorum/chat": chat,
  "/api/quorum/debate": debate,
  "/api/quorum/clerk/candidates": clerkCandidates,
  "/api/quorum/clerk/chat": clerkChat,
  "/api/quorum/clerk/summary": clerkSummary,
  "/api/quorum/patient": patient,
  "/api/quorum/debrief": debrief,
  "/api/quorum/event": ignore,
  "/api/quorum/snapshot": ignore,
};
