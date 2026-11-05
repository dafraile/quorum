// Study-mode API. Participant routes authenticate with the per-participant link token;
// researcher routes need `Authorization: Bearer $STUDY_ADMIN_TOKEN` and are disabled
// when that variable is unset.
import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { isStudyAgentId, negativeAgentId, studyAgentById } from "../../shared/studyRoster.ts";
import type { Contribution, Debrief, PlanStart, FloorSource, SessionPayload } from "../../shared/studyTypes.ts";
import { agentResultSchema } from "../prompts.ts";
import { ProviderError, callStructured } from "../providers/index.ts";
import { publicCase, studyCaseById } from "./cases.ts";
import { loadStaticFloor } from "./floors.ts";
import { buildPatientPrompt, buildStudyAgentPrompt, patientReplySchema } from "./prompts.ts";
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
      return { ...slot, case: publicCase(studyCase, slot.mode === "triadic") };
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
    isStudyAgentId(agentId) && item ? [{ agentId, answer: item.answer, keyPoints: item.keyPoints, source: "static" as FloorSource }] : [],
  );
  await appendEvent(record.config.participantId, {
    source: "server",
    type: "static_floor_served",
    caseIndex: body.caseIndex,
    data: { caseId: studyCase.id, mode: slot.mode, vetted: floor.vetted, model: floor.model, generatedAt: floor.generatedAt },
  });
  send(res, 200, { contributions, vetted: floor.vetted });
});

const contribution = route("POST", async (req, res) => {
  const body = await readBody(req);
  const record = await participantFor(body);
  const { slot, studyCase } = caseSlot(record, body.caseIndex);
  if (!isStudyAgentId(body.agentId)) throw new HttpError(400, "Unknown agent");

  const motionText = shortText(body.motion?.text, 2000);
  const motion = motionText
    ? { text: motionText, filedBy: body.motion?.filedBy === "patient" ? ("patient" as const) : ("chair" as const) }
    : undefined;
  const provider = record.config.providerMix[body.agentId];
  const requestId = shortText(body.requestId, 80);

  try {
    const result = await callStructured({
      provider,
      prompt: buildStudyAgentPrompt({
        agentId: body.agentId,
        studyCase,
        mode: slot.mode,
        motion,
        previous: shortText(body.previous, 4000) || undefined,
        patientUtterances: slot.mode === "triadic" ? textList(body.patientUtterances, 12, 600) : undefined,
      }),
      schemaName: "quorum_agent_result",
      schema: agentResultSchema,
      effort: (process.env.STUDY_LIVE_EFFORT as "low" | "medium" | "high" | undefined) || "medium",
      timeoutMs: 60_000,
    });
    const parsed = (result.parsed ?? {}) as { answer?: string; keyPoints?: unknown };
    const answer = (parsed.answer || result.text).trim();
    const keyPoints = listOfStrings(parsed.keyPoints).slice(0, 4);

    await appendEvent(record.config.participantId, {
      source: "server",
      type: "llm_contribution",
      caseIndex: body.caseIndex,
      data: {
        requestId,
        agentId: body.agentId,
        motion,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        usage: result.usage,
        answer,
        keyPoints,
      },
    });
    const payload: Contribution = { agentId: body.agentId, answer, keyPoints, source: "live" };
    send(res, 200, payload);
  } catch (error) {
    await appendEvent(record.config.participantId, {
      source: "server",
      type: "llm_error",
      caseIndex: body.caseIndex,
      data: { requestId, agentId: body.agentId, provider, error: error instanceof Error ? error.message : String(error) },
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
  "/api/study/debrief": debrief,
  "/api/study/complete": complete,
  "/api/study/admin/participants": adminParticipants,
  "/api/study/admin/export": adminExport,
  "/api/study/admin/delete": adminDelete,
};
