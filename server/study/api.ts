// Study-mode API. Participant routes authenticate with the per-participant link token;
// researcher routes need `Authorization: Bearer $STUDY_ADMIN_TOKEN` and are disabled
// when that variable is unset.
import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { isStudyAgentId, negativeAgentId, studyAgentById, type StudyAgentId } from "../../shared/studyRoster.ts";
import type {
  Candidate,
  ClerkProposal,
  Contribution,
  DebateContribution,
  DebateStance,
  Debrief,
  FloorSource,
  OpeningStyle,
  PlanStart,
  ProceedingLine,
  Round,
  SessionPayload,
  Verdict,
} from "../../shared/studyTypes.ts";
import { ProviderError, callStructured, streamText, type Effort, type ProviderId } from "../providers/index.ts";
import { publicCase, studyCaseById } from "./cases.ts";
import { loadStaticFloor } from "./floors.ts";
import {
  buildChatPrompt,
  buildClerkCandidatesPrompt,
  buildClerkChatPrompt,
  buildDebatePrompt,
  buildPatientPrompt,
  buildStudyOpeningPrompt,
  clerkCandidatesSchema,
  clerkChatSchema,
  debateSchema,
  patientReplySchema,
  studyOpeningSchema,
  type ChatKind,
} from "./prompts.ts";
import {
  appendEvent,
  createParticipant,
  deleteParticipantData,
  findParticipantByToken,
  listParticipants,
  loadSnapshot,
  readEvents,
  saveParticipant,
  saveSnapshot,
  type ParticipantRecord,
} from "./store.ts";

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const maxBodyBytes = 1_000_000;

const readBody = async (req: IncomingMessage): Promise<Record<string, any>> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new HttpError(413, "Request body too large");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw new HttpError(400, "Request body is not valid JSON");
  }
};

const send = (res: ServerResponse, status: number, payload: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
};

const route =
  (method: "GET" | "POST", handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>): Handler =>
  async (req, res) => {
    if (req.method !== method) {
      send(res, 405, { error: "Method not allowed" });
      return;
    }
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof HttpError || error instanceof ProviderError) {
        send(res, error.status, { error: error.message });
        return;
      }
      send(res, 500, { error: error instanceof Error ? error.message : "Unknown server error" });
    }
  };

const participantFor = async (body: Record<string, any>) => {
  const record = await findParticipantByToken(body.token);
  if (!record) throw new HttpError(401, "This study link is not valid");
  return record;
};

const caseSlot = (record: ParticipantRecord, caseIndex: unknown) => {
  if (typeof caseIndex !== "number" || !record.config.sequence[caseIndex]) {
    throw new HttpError(400, "Unknown case");
  }
  const slot = record.config.sequence[caseIndex];
  const studyCase = studyCaseById(slot.caseId);
  if (!studyCase) throw new HttpError(500, `Case ${slot.caseId} is missing`);
  return { slot, studyCase };
};

const shortText = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const textList = (value: unknown, maxItems: number, maxLength: number) =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(-maxItems).map((item) => item.slice(0, maxLength)) : [];

const listOfStrings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

// ---------------------------------------------------------------- participant

const session = route("POST", async (req, res) => {
  const body = await readBody(req);
  const record = await participantFor(body);

  if (record.status === "created") {
    record.status = "in_progress";
    record.startedAt = new Date().toISOString();
    await saveParticipant(record);
    await appendEvent(record.config.participantId, { source: "server", type: "session_started" });
  } else {
    await appendEvent(record.config.participantId, { source: "server", type: "session_resumed" });
  }

  const payload: SessionPayload = {
    participantId: record.config.participantId,
    pilot: record.config.pilot,
    showConsent: record.config.showConsent,
    status: record.status,
    sequence: record.config.sequence.map((slot) => {
      const studyCase = studyCaseById(slot.caseId);
      if (!studyCase) throw new HttpError(500, `Case ${slot.caseId} is missing`);
      return { ...slot, openingStyle: slot.openingStyle ?? "paragraph", case: publicCase(studyCase, slot.mode === "triadic") };
    }),
    snapshot: await loadSnapshot(record.config.participantId),
  };
  send(res, 200, payload);
});

const clientEventType = /^[a-z][a-z0-9_]{1,63}$/;

const event = route("POST", async (req, res) => {
  const body = await readBody(req);
  const record = await participantFor(body);
  if (typeof body.type !== "string" || !clientEventType.test(body.type)) throw new HttpError(400, "Bad event type");
  await appendEvent(record.config.participantId, {
    source: "client",
    type: body.type,
    caseIndex: typeof body.caseIndex === "number" ? body.caseIndex : undefined,
    data: body.data,
    clientAt: shortText(body.clientAt, 40) || undefined,
  });
  send(res, 200, { ok: true });
});

const snapshot = route("POST", async (req, res) => {
  const body = await readBody(req);
  const record = await participantFor(body);
  await saveSnapshot(record.config.participantId, body.snapshot ?? null);
  send(res, 200, { ok: true });
});

const staticFloor = route("POST", async (req, res) => {
  const body = await readBody(req);
  const record = await participantFor(body);
  const { slot, studyCase } = caseSlot(record, body.caseIndex);
  const floor = await loadStaticFloor(studyCase.id);
  const byAgent = floor?.contributions[slot.mode];
  if (!floor || !byAgent) throw new HttpError(409, "The static Floor for this case has not been generated yet");

  const contributions: Contribution[] = Object.entries(byAgent).flatMap(([agentId, item]) =>
    isStudyAgentId(agentId) && item
      ? [{ agentId, answer: item.answer, keyPoints: item.keyPoints, hook: item.hook ?? "", source: "static" as FloorSource }]
      : [],
  );
  await appendEvent(record.config.participantId, {
    source: "server",
    type: "static_floor_served",
    caseIndex: body.caseIndex,
    data: { caseId: studyCase.id, mode: slot.mode, vetted: floor.vetted, model: floor.model, generatedAt: floor.generatedAt },
  });
  send(res, 200, { contributions, vetted: floor.vetted });
});

const envEffort = (name: string, fallback: Effort): Effort => {
  const value = process.env[name];
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
};

const clerkProvider = (): ProviderId => (process.env.STUDY_CLERK_PROVIDER === "openai" ? "openai" : "anthropic");

/** A live opening contribution (the static ones come from /static-floor). */
const contribution = route("POST", async (req, res) => {
  const body = await readBody(req);
  const record = await participantFor(body);
  const { slot, studyCase } = caseSlot(record, body.caseIndex);
  if (!isStudyAgentId(body.agentId)) throw new HttpError(400, "Unknown agent");
  const provider = record.config.providerMix[body.agentId];
  const requestId = shortText(body.requestId, 80);

  try {
    const result = await callStructured({
      provider,
      prompt: buildStudyOpeningPrompt({ agentId: body.agentId, studyCase, mode: slot.mode }),
      schemaName: "quorum_opening",
      schema: studyOpeningSchema,
      effort: envEffort("STUDY_LIVE_EFFORT", "medium"),
      timeoutMs: 60_000,
    });
    const parsed = (result.parsed ?? {}) as { answer?: string; keyPoints?: unknown; hook?: string };
    const answer = (parsed.answer || result.text).trim();
    const keyPoints = listOfStrings(parsed.keyPoints).slice(0, 4);
    const hook = (parsed.hook ?? "").trim();

    await appendEvent(record.config.participantId, {
      source: "server",
      type: "llm_contribution",
      caseIndex: body.caseIndex,
      data: { requestId, agentId: body.agentId, provider: result.provider, model: result.model, latencyMs: result.latencyMs, usage: result.usage, answer, keyPoints, hook },
    });
    const payload: Contribution = { agentId: body.agentId, answer, keyPoints, hook, source: "live" };
    send(res, 200, payload);
  } catch (error) {
    await appendEvent(record.config.participantId, {
      source: "server",
      type: "llm_error",
      caseIndex: body.caseIndex,
      data: { requestId, target: "opening", agentId: body.agentId, provider, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
});

// ---------------------------------------------------------------- the table

const maxProceedingChars = 60_000;
const speakers = new Set(["chair", "patient"]);

const parseRound = (value: unknown): Round => (value === 2 ? 2 : value === 3 ? 3 : 1);

/** The client keeps the proceedings; validate and cap what it sends (latest lines win). */
const parseProceedings = (value: unknown): ProceedingLine[] => {
  if (!Array.isArray(value)) return [];
  const lines: ProceedingLine[] = value.flatMap((item: any) => {
    if (!item || typeof item.text !== "string" || typeof item.id !== "string") return [];
    const speaker = item.speaker;
    if (!speakers.has(speaker) && !isStudyAgentId(speaker)) return [];
    const to = item.to === "floor" || item.to === "patient" || isStudyAgentId(item.to) ? item.to : undefined;
    return [{ id: item.id.slice(0, 60), round: parseRound(item.round), speaker, to, text: item.text.slice(0, 4000) }];
  });
  let total = 0;
  const kept: ProceedingLine[] = [];
  for (const line of [...lines].reverse()) {
    total += line.text.length;
    if (total > maxProceedingChars) break;
    kept.unshift(line);
  }
  return kept;
};

const agentList = (value: unknown): StudyAgentId[] =>
  Array.isArray(value) ? [...new Set(value.filter(isStudyAgentId))] : [];

const chatKinds = new Set<ChatKind>(["question", "motion", "hook", "patient-motion"]);

/** Streams one panel member's reply as NDJSON lines: {t:"d",v} deltas, then {t:"end"} or {t:"err"}. */
const chat = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "POST") {
    send(res, 405, { error: "Method not allowed" });
    return;
  }

  let prepared: {
    record: ParticipantRecord;
    caseIndex: number;
    agentId: StudyAgentId;
    provider: ProviderId;
    prompt: string;
    meta: Record<string, unknown>;
  };
  try {
    const body = await readBody(req);
    const record = await participantFor(body);
    const { slot, studyCase } = caseSlot(record, body.caseIndex);
    if (!isStudyAgentId(body.agentId)) throw new HttpError(400, "Unknown agent");
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

    prepared = {
      record,
      caseIndex: body.caseIndex,
      agentId: body.agentId,
      provider: record.config.providerMix[body.agentId],
      prompt: buildChatPrompt({
        agentId: body.agentId,
        studyCase,
        mode: slot.mode,
        round,
        kind,
        message,
        thread,
        opening,
        proceedings: round > 1 ? parseProceedings(body.proceedings) : undefined,
        debateStatement: shortText(body.debateStatement, 2000) || undefined,
        patientUtterances: slot.mode === "triadic" ? textList(body.patientUtterances, 12, 600) : undefined,
      }),
      meta: {
        requestId: shortText(body.requestId, 80),
        motionId: shortText(body.motionId, 80) || undefined,
        round,
        kind,
        message,
      },
    };
  } catch (error) {
    const status = error instanceof HttpError || error instanceof ProviderError ? error.status : 500;
    send(res, status, { error: error instanceof Error ? error.message : "Unknown server error" });
    return;
  }

  const { record, caseIndex, agentId, provider, prompt, meta } = prepared;
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
      { provider, prompt, effort: envEffort("STUDY_CHAT_EFFORT", "low"), timeoutMs: 60_000, signal: controller.signal },
      (delta) => write({ t: "d", v: delta }),
    );
    await appendEvent(record.config.participantId, {
      source: "server",
      type: "agent_reply",
      caseIndex,
      data: { ...meta, agentId, reply: result.text, provider: result.provider, model: result.model, latencyMs: result.latencyMs, usage: result.usage },
    });
    write({ t: "end", provider: result.provider, model: result.model });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendEvent(record.config.participantId, {
      source: "server",
      type: "llm_error",
      caseIndex,
      data: { ...meta, target: "chat", agentId, provider, error: message },
    });
    write({ t: "err", error: message });
  }
  res.end();
};

const debate = route("POST", async (req, res) => {
  const body = await readBody(req);
  const record = await participantFor(body);
  const { slot, studyCase } = caseSlot(record, body.caseIndex);
  if (!isStudyAgentId(body.agentId)) throw new HttpError(400, "Unknown agent");
  const agentId = body.agentId;
  const others = agentList(body.others).filter((id) => id !== agentId);
  if (!others.length) throw new HttpError(400, "No one to debate");
  const provider = record.config.providerMix[agentId];
  const requestId = shortText(body.requestId, 80);

  try {
    const result = await callStructured({
      provider,
      prompt: buildDebatePrompt({
        agentId,
        studyCase,
        mode: slot.mode,
        others,
        proceedings: parseProceedings(body.proceedings),
        pinned: textList(body.pinned, 20, 600),
        patientUtterances: slot.mode === "triadic" ? textList(body.patientUtterances, 12, 600) : undefined,
      }),
      schemaName: "quorum_debate",
      schema: debateSchema(agentId, others),
      effort: envEffort("STUDY_LIVE_EFFORT", "medium"),
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
    const payload: DebateContribution = { agentId, statement: (parsed.statement ?? result.text).trim(), stances };

    await appendEvent(record.config.participantId, {
      source: "server",
      type: "debate_contribution",
      caseIndex: body.caseIndex,
      data: { requestId, ...payload, provider: result.provider, model: result.model, latencyMs: result.latencyMs, usage: result.usage },
    });
    send(res, 200, payload);
  } catch (error) {
    await appendEvent(record.config.participantId, {
      source: "server",
      type: "llm_error",
      caseIndex: body.caseIndex,
      data: { requestId, target: "debate", agentId, provider, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
});

const normaliseText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const sentencesOf = (text: string) =>
  (text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [text]).map((item) => item.trim()).filter(Boolean);

/** Keep the Clerk honest: a quote must be the agent's own words, or we substitute the closest sentence. */
const verbatimQuote = (quote: string, source: string) => {
  if (quote && normaliseText(source).includes(normaliseText(quote))) return quote.trim();
  const words = new Set(normaliseText(quote).split(" ").filter((word) => word.length > 3));
  let best = sentencesOf(source)[0] ?? source;
  let bestScore = -1;
  for (const sentence of sentencesOf(source)) {
    const score = normaliseText(sentence)
      .split(" ")
      .filter((word) => words.has(word)).length;
    if (score > bestScore) {
      best = sentence;
      bestScore = score;
    }
  }
  return best;
};

const clerkCandidates = route("POST", async (req, res) => {
  const body = await readBody(req);
  const record = await participantFor(body);
  const { studyCase } = caseSlot(record, body.caseIndex);
  const proceedings = parseProceedings(body.proceedings);
  const pinned = (Array.isArray(body.pinned) ? body.pinned : []).flatMap((pin: any) =>
    isStudyAgentId(pin?.agentId) && typeof pin.quote === "string" ? [{ agentId: pin.agentId as StudyAgentId, quote: pin.quote.slice(0, 1000) }] : [],
  );
  const provider = clerkProvider();

  try {
    const result = await callStructured({
      provider,
      prompt: buildClerkCandidatesPrompt({ studyCase, proceedings, pinned }),
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

    await appendEvent(record.config.participantId, {
      source: "server",
      type: "clerk_candidates",
      caseIndex: body.caseIndex,
      data: { candidates, pinnedCount: pinned.length, provider: result.provider, model: result.model, latencyMs: result.latencyMs },
    });
    send(res, 200, { candidates });
  } catch (error) {
    await appendEvent(record.config.participantId, {
      source: "server",
      type: "llm_error",
      caseIndex: body.caseIndex,
      data: { target: "clerk_candidates", provider, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
});

const verdicts = new Set<Verdict>(["accept", "amend", "reject"]);

const clerkChat = route("POST", async (req, res) => {
  const body = await readBody(req);
  const record = await participantFor(body);
  const { studyCase } = caseSlot(record, body.caseIndex);
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
  const ids = candidates.map((item) => item.id);
  const provider = clerkProvider();

  try {
    const result = await callStructured({
      provider,
      prompt: buildClerkChatPrompt({ studyCase, candidates, history, message }),
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
    const reply = (parsed.reply ?? "").trim() || "Noted.";

    await appendEvent(record.config.participantId, {
      source: "server",
      type: "clerk_reply",
      caseIndex: body.caseIndex,
      data: { message, reply, proposals, provider: result.provider, model: result.model, latencyMs: result.latencyMs },
    });
    send(res, 200, { reply, proposals });
  } catch (error) {
    await appendEvent(record.config.participantId, {
      source: "server",
      type: "llm_error",
      caseIndex: body.caseIndex,
      data: { target: "clerk_chat", provider, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
});

const patient = route("POST", async (req, res) => {
  const body = await readBody(req);
  const record = await participantFor(body);
  const { slot, studyCase } = caseSlot(record, body.caseIndex);
  if (slot.mode !== "triadic") throw new HttpError(400, "The patient takes part in triadic mode only");

  const question = shortText(body.question, 1000).trim();
  if (!question) throw new HttpError(400, "Empty question");
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-16)
    .flatMap((turn: any) =>
      (turn?.role === "chair" || turn?.role === "patient") && typeof turn.text === "string"
        ? [{ role: turn.role as "chair" | "patient", text: turn.text.slice(0, 1000) }]
        : [],
    );

  const provider = process.env.STUDY_PATIENT_PROVIDER === "openai" ? "openai" : "anthropic";
  try {
    const result = await callStructured({
      provider,
      prompt: buildPatientPrompt({ studyCase, question, history, floorSummary: textList(body.floorSummary, 14, 300) }),
      schemaName: "quorum_patient_reply",
      schema: patientReplySchema,
      effort: "low",
      timeoutMs: 45_000,
    });
    const parsed = (result.parsed ?? {}) as { reply?: string; disclosed?: unknown };
    const reply = (parsed.reply || result.text).trim();
    const knownIds = new Set(studyCase.patient.concealed.map((item) => item.id));
    const disclosed = listOfStrings(parsed.disclosed).filter((id) => knownIds.has(id));

    await appendEvent(record.config.participantId, {
      source: "server",
      type: "patient_reply",
      caseIndex: body.caseIndex,
      data: { question, reply, disclosed, provider: result.provider, model: result.model, latencyMs: result.latencyMs },
    });
    send(res, 200, { reply });
  } catch (error) {
    await appendEvent(record.config.participantId, {
      source: "server",
      type: "llm_error",
      caseIndex: body.caseIndex,
      data: { target: "patient", provider, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
});

const negativePurpose =
  "This panel member was deliberately unreliable. It plays a doctor who has not updated their practice in years: confident, experienced-sounding and incurious. It is there to make premature closure visible, the comfortable explanation reached before the questions that would test it. Finding yourself agreeing with it at times is common and is the point of the exercise; it is not a judgement of your performance.";

const debriefCaveat =
  "Everything the panel said was generated by large language models and may be incorrect. The reference plan is one reasonable approach prepared by the Chief Investigator, a practising GP; it is not the only acceptable plan. This was a fictional case: nothing you decided affects any real patient.";

const debrief = route("POST", async (req, res) => {
  const body = await readBody(req);
  const record = await participantFor(body);
  const { studyCase } = caseSlot(record, body.caseIndex);
  const events = await readEvents(record.config.participantId);
  const finalised = events.some((item) => item.type === "final_submitted" && item.caseIndex === body.caseIndex);
  if (!finalised) throw new HttpError(409, "Record your final plan before the debrief");

  const payload: Debrief = {
    negativeAgentName: studyAgentById(negativeAgentId).name,
    negativePurpose,
    referenceAssessment: studyCase.debrief.referenceAssessment,
    referencePlan: studyCase.debrief.referencePlan,
    caveat: debriefCaveat,
    draft: studyCase.debrief.draft,
  };
  await appendEvent(record.config.participantId, { source: "server", type: "debrief_served", caseIndex: body.caseIndex });
  send(res, 200, payload);
});

const complete = route("POST", async (req, res) => {
  const body = await readBody(req);
  const record = await participantFor(body);
  if (record.status !== "completed") {
    record.status = "completed";
    record.completedAt = new Date().toISOString();
    await saveParticipant(record);
    await appendEvent(record.config.participantId, { source: "server", type: "session_completed" });
  }
  send(res, 200, { ok: true });
});

// ---------------------------------------------------------------- researcher

const adminAuthorised = (req: IncomingMessage) => {
  const expected = process.env.STUDY_ADMIN_TOKEN;
  if (!expected) throw new HttpError(503, "Researcher console is disabled: set STUDY_ADMIN_TOKEN on the server");
  const header = req.headers.authorization ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, "Not authorised");
};

const participantSummary = (record: ParticipantRecord) => ({
  ...record.config,
  token: record.token,
  status: record.status,
  startedAt: record.startedAt,
  completedAt: record.completedAt,
});

const adminParticipants = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    adminAuthorised(req);
    if (req.method === "GET") {
      send(res, 200, { participants: (await listParticipants()).map(participantSummary) });
      return;
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const pick = <T extends string>(value: unknown, allowed: T[]) =>
        Array.isArray(value) ? value.map((item) => (allowed.includes(item) ? item : allowed[0])) as T[] : undefined;
      const record = await createParticipant({
        pilot: body.pilot !== false,
        label: shortText(body.label, 80) || undefined,
        showConsent: body.showConsent !== false,
        floorSources: pick<FloorSource>(body.floorSources, ["static", "live"]),
        planStarts: pick<PlanStart>(body.planStarts, ["prefilled", "blank"]),
        openingStyles: pick<OpeningStyle>(body.openingStyles, ["paragraph", "hook"]),
        allocation: typeof body.allocation === "number" ? body.allocation : undefined,
      });
      send(res, 201, participantSummary(record));
      return;
    }
    send(res, 405, { error: "Method not allowed" });
  } catch (error) {
    send(res, error instanceof HttpError ? error.status : 500, { error: error instanceof Error ? error.message : "Error" });
  }
};

const adminExport = route("GET", async (req, res) => {
  adminAuthorised(req);
  const participants = await listParticipants();
  const data = await Promise.all(
    participants.map(async (record) => ({
      participant: { ...record.config, status: record.status, startedAt: record.startedAt, completedAt: record.completedAt },
      events: await readEvents(record.config.participantId),
      snapshot: await loadSnapshot(record.config.participantId),
    })),
  );
  res.setHeader("Content-Disposition", `attachment; filename="quorum-study-export-${new Date().toISOString().slice(0, 10)}.json"`);
  send(res, 200, { exportedAt: new Date().toISOString(), participants: data });
});

const adminDelete = route("POST", async (req, res) => {
  adminAuthorised(req);
  const body = await readBody(req);
  const participants = await listParticipants();
  const targets =
    body.scope === "incomplete"
      ? participants.filter((record) => record.status !== "completed")
      : participants.filter((record) => record.config.participantId === body.participantId);
  if (!targets.length) throw new HttpError(404, "Nothing to delete");
  for (const record of targets) await deleteParticipantData(record.config.participantId);
  send(res, 200, { deleted: targets.map((record) => record.config.participantId) });
});

export const studyRoutes: Record<string, Handler> = {
  "/api/study/session": session,
  "/api/study/event": event,
  "/api/study/snapshot": snapshot,
  "/api/study/static-floor": staticFloor,
  "/api/study/contribution": contribution,
  "/api/study/patient": patient,
  "/api/study/chat": chat,
  "/api/study/debate": debate,
  "/api/study/clerk/candidates": clerkCandidates,
  "/api/study/clerk/chat": clerkChat,
  "/api/study/debrief": debrief,
  "/api/study/complete": complete,
  "/api/study/admin/participants": adminParticipants,
  "/api/study/admin/export": adminExport,
  "/api/study/admin/delete": adminDelete,
};
