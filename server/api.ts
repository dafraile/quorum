import type { IncomingMessage, ServerResponse } from "node:http";
import {
  agentResultSchema,
  buildAgentPrompt,
  buildClerkPrompt,
  clerkResultSchema,
  evidenceDomains,
  type AgentRequest,
  type ClerkRequest,
} from "./prompts.ts";
import { ProviderError, callStructured, isProviderId, providerStatus } from "./providers/index.ts";
import { studyRoutes } from "./study/api.ts";

export type ApiHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

const maxBodyBytes = 1_000_000;

class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const readJsonBody = async <T>(req: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new RequestError(413, "Request body too large");
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    throw new RequestError(400, "Request body is not valid JSON");
  }
};

export const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
};

const sendError = (res: ServerResponse, error: unknown) => {
  if (error instanceof ProviderError) {
    sendJson(res, error.status, { error: error.message, provider: error.provider });
    return;
  }
  if (error instanceof RequestError) {
    sendJson(res, error.status, { error: error.message });
    return;
  }
  sendJson(res, 500, { error: error instanceof Error ? error.message : "Unknown server error" });
};

const postOnly = (handler: ApiHandler): ApiHandler => async (req, res) => {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    await handler(req, res);
  } catch (error) {
    sendError(res, error);
  }
};

const handleRuntime: ApiHandler = (_req, res) => {
  const providers = providerStatus();
  sendJson(res, 200, {
    // `live` and `model` keep the shape the workbench already reads.
    live: providers.openai.live || providers.anthropic.live,
    model: providers.openai.model,
    providers,
  });
};

const handleAgent = postOnly(async (req, res) => {
  const body = await readJsonBody<AgentRequest>(req);
  const provider = isProviderId(body.provider) ? body.provider : "openai";
  const webSearch =
    body.agentId === "biblioRat" && body.evidenceMode && provider === "openai"
      ? { allowedDomains: evidenceDomains }
      : undefined;

  const result = await callStructured({
    provider,
    model: body.model,
    prompt: buildAgentPrompt(body),
    schemaName: "quorum_agent_result",
    schema: agentResultSchema,
    effort: body.reasoning || "medium",
    webSearch,
  });

  const parsed = result.parsed as { answer?: string } | null;
  sendJson(res, 200, {
    text: parsed?.answer || result.text,
    result: parsed,
    sources: result.sources,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
  });
});

const handleClerk = postOnly(async (req, res) => {
  const body = await readJsonBody<ClerkRequest>(req);
  const provider = isProviderId(body.provider) ? body.provider : "openai";

  const result = await callStructured({
    provider,
    prompt: buildClerkPrompt(body),
    schemaName: "quorum_clerk_result",
    schema: clerkResultSchema,
    effort: "medium",
  });

  const draft = (result.parsed ?? {}) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  sendJson(res, 200, {
    minutes: typeof draft.minutes === "string" ? draft.minutes : "",
    takeaways: list(draft.takeaways),
    actions: list(draft.actions),
    unresolvedQuestions: list(draft.unresolvedQuestions),
    reviewSummary: list(draft.reviewSummary),
    draft: result.parsed,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
  });
});

/** Exact-path API routes, shared by the Vite dev middleware and the production server. */
export const apiRoutes: Record<string, ApiHandler> = {
  "/api/runtime": handleRuntime,
  "/api/agent": handleAgent,
  "/api/clerk": handleClerk,
  ...studyRoutes,
};
