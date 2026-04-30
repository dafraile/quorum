import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

type AgentRequest = {
  agentId: string;
  agentName: string;
  stance: string;
  tone: string;
  rules?: string[];
  motion: string;
  visit: string;
  caseContext: string;
  previousOutput?: string;
  chairQuestion?: string;
  model?: string;
  reasoning?: "low" | "medium" | "high";
  evidenceMode?: boolean;
};

type ClerkRequest = {
  mode: "clinical" | "thinking";
  motion: string;
  context: string;
  contributions: Array<{
    agentName: string;
    stance: string;
    review: string;
    result?: {
      answer?: string;
      keyPoints?: string[];
      questions?: string[];
      suggestedActions?: string[];
    };
    output?: string;
  }>;
};

const agentResultFormat = {
  type: "json_schema",
  name: "quorum_agent_result",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      answer: { type: "string" },
      keyPoints: {
        type: "array",
        items: { type: "string" },
      },
      questions: {
        type: "array",
        items: { type: "string" },
      },
      suggestedActions: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["answer", "keyPoints", "questions", "suggestedActions"],
  },
};

const clerkResultFormat = {
  type: "json_schema",
  name: "quorum_clerk_result",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      minutes: { type: "string" },
      takeaways: {
        type: "array",
        items: { type: "string" },
      },
      actions: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["minutes", "takeaways", "actions"],
  },
};

const readRequestBody = async (req: import("node:http").IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
};

const sendJson = (
  res: import("node:http").ServerResponse,
  status: number,
  payload: unknown,
) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
};

const extractOutputText = (payload: any): string => {
  if (typeof payload.output_text === "string") return payload.output_text;

  const chunks: string[] = [];
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }

  return chunks.join("\n").trim();
};

const extractSources = (payload: any) => {
  const sources = new Map<string, { title: string; url: string }>();

  const visit = (value: any) => {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (value.type === "url_citation" && value.url) {
      sources.set(value.url, {
        title: value.title || value.url,
        url: value.url,
      });
    }

    if (value.url && value.title && typeof value.url === "string") {
      sources.set(value.url, {
        title: value.title,
        url: value.url,
      });
    }

    Object.values(value).forEach(visit);
  };

  visit(payload.output);
  visit(payload.sources);

  return Array.from(sources.values()).slice(0, 6);
};

const extractParsedOutput = (payload: any) => {
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content?.parsed && typeof content.parsed === "object") {
        return content.parsed;
      }
    }
  }

  return null;
};

const parseJsonText = (text: string) => {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;

    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

const structuredResultFromPayload = (payload: any) => {
  const parsed = extractParsedOutput(payload);
  if (parsed) return parsed;
  return parseJsonText(extractOutputText(payload));
};

const buildAgentPrompt = (body: AgentRequest) => {
  const followUp = body.chairQuestion
    ? `\nChair follow-up:
"${body.chairQuestion}"

Your previous contribution:
${body.previousOutput || "None"}

Respond directly to the Chair. Refine, correct, or deepen your prior contribution; do not simply repeat it.`
    : "";
  const roleRules = (body.rules ?? []).map((rule) => `- ${rule}`).join("\n") || "- Stay within your named stance and voice.";

  return `You are ${body.agentName} in Quorum.

Quorum is a chaired deliberation system for high-stakes reasoning. The human clinician is the Chair. The Chair governs the Session, asks follow-up questions, accepts or rejects contributions, and makes the final decision. You are not the Chair.

The point of Quorum is structural epistemic variety: different forms of intelligence should reveal different risks, assumptions, burdens, and blind spots. Do not imitate a generic medical assistant. Do not converge toward consensus just because other voices may sound plausible. Your value is the useful difference created by your assigned stance.

Rules of exchange:
- The Chair decides; you contribute deliberation.
- Do not diagnose or prescribe as a final authority.
- Stay inside your archetype unless the safety override applies.
- Be specific to facts visible in the case record.
- Prefer one or two high-signal points over broad textbook coverage.
- If you disagree, make the disagreement constructive and clinically usable.
- If evidence is uncertain, say what would shift the differential.
- If the Chair asks a follow-up, answer the follow-up rather than restarting the whole case.

Safety override:
If the case contains an urgent red flag needing immediate care, break persona and start with "SAFETY FLAG:". Examples include stroke-like focal neurologic deficit, chest pain concerning for ACS, anaphylaxis, sepsis, severe asthma, syncope with instability, or evidence of acute organ injury. In safety mode, briefly tell the Chair why deliberation should pause. Do not invent emergencies from absent facts.

Your archetype:
- Name: ${body.agentName}
- Stance: ${body.stance}
- Voice: ${body.tone}

Role-specific rules:
${roleRules}

Keep answer under 120 words unless evidence citations are essential.
Make one or two concrete points visible on the case record.

Current visit: ${body.visit}
Motion: ${body.motion}

Case context:
${body.caseContext}
${followUp}

Return JSON with:
- answer: your contribution, no heading.
- keyPoints: 2 to 4 short bullets that can be shown on the card.
- questions: 0 to 3 useful follow-up questions for the Chair.
- suggestedActions: 0 to 4 concrete next actions, only if your stance supports them.`;
};

const buildClerkPrompt = (body: ClerkRequest) => {
  const contributions = body.contributions
    .map(
      (item) => `## ${item.agentName}
Stance: ${item.stance}
Chair review: ${item.review}
Key points: ${(item.result?.keyPoints ?? []).join("; ") || "None recorded"}
Suggested actions: ${(item.result?.suggestedActions ?? []).join("; ") || "None recorded"}
Full contribution: ${item.result?.answer || item.output || "No contribution recorded."}`,
    )
    .join("\n\n");

  return `You are the Planner Clerk in Quorum.

The Chair has heard multiple archetype contributions. Your job is not to make the clinical or strategic decision. Your job is to produce a clear draft record for the Chair to accept, amend, or reject.

Mode: ${body.mode}
Motion: ${body.motion}

Context:
${body.context}

Contributions:
${contributions}

Rules:
- Respect the Chair review status; accepted voices can shape the action list more than rejected voices.
- Preserve unresolved questions instead of smoothing them into false certainty.
- For clinical mode, use cautious, non-prescriptive language and avoid claiming diagnosis or treatment authority.
- Keep actions concrete enough to become an action log.

Return JSON with:
- minutes: a concise paragraph record of the deliberation.
- takeaways: 3 to 5 short summary bullets.
- actions: 3 to 6 concrete proposed action-log items.`;
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: "quorum-openai-dev-api",
      configureServer(server) {
        server.middlewares.use("/api/runtime", (_req, res) => {
          sendJson(res, 200, {
            live: Boolean(process.env.OPENAI_API_KEY),
            model: process.env.OPENAI_MODEL || "gpt-5.5",
          });
        });

        server.middlewares.use("/api/agent", async (req, res) => {
          if (req.method !== "POST") {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
          }

          if (!process.env.OPENAI_API_KEY) {
            sendJson(res, 503, { error: "OPENAI_API_KEY is not configured" });
            return;
          }

          try {
            const raw = await readRequestBody(req);
            const body = JSON.parse(raw) as AgentRequest;
            const model =
              body.model && body.model !== "server-default"
                ? body.model
                : process.env.OPENAI_MODEL || "gpt-5.5";

            const tools =
              body.agentId === "biblioRat" && body.evidenceMode
                ? [
                    {
                      type: "web_search",
                      user_location: {
                        type: "approximate",
                        country: "AU",
                        city: "Sydney",
                        region: "New South Wales",
                        timezone: "Australia/Sydney",
                      },
                      filters: {
                        allowed_domains: [
                          "rcpa.edu.au",
                          "racgp.org.au",
                          "cdc.gov",
                          "ncbi.nlm.nih.gov",
                          "pubmed.ncbi.nlm.nih.gov",
                          "nice.org.uk",
                        ],
                      },
                    },
                  ]
                : undefined;

            const response = await fetch("https://api.openai.com/v1/responses", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model,
                reasoning: { effort: body.reasoning || "medium" },
                tools,
                tool_choice: "auto",
                include: tools ? ["web_search_call.action.sources"] : undefined,
                text: { format: agentResultFormat },
                input: buildAgentPrompt(body),
              }),
            });

            const payload = await response.json();

            if (!response.ok) {
              sendJson(res, response.status, {
                error: payload.error?.message || "OpenAI API request failed",
                detail: payload,
              });
              return;
            }

            const result = structuredResultFromPayload(payload);
            const text = extractOutputText(payload);

            sendJson(res, 200, {
              text: result?.answer || text,
              result,
              sources: extractSources(payload),
              model,
            });
          } catch (error) {
            sendJson(res, 500, {
              error: error instanceof Error ? error.message : "Unknown server error",
            });
          }
        });

        server.middlewares.use("/api/clerk", async (req, res) => {
          if (req.method !== "POST") {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
          }

          if (!process.env.OPENAI_API_KEY) {
            sendJson(res, 503, { error: "OPENAI_API_KEY is not configured" });
            return;
          }

          try {
            const raw = await readRequestBody(req);
            const body = JSON.parse(raw) as ClerkRequest;
            const model = process.env.OPENAI_MODEL || "gpt-5.5";

            const response = await fetch("https://api.openai.com/v1/responses", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model,
                reasoning: { effort: "medium" },
                text: { format: clerkResultFormat },
                input: buildClerkPrompt(body),
              }),
            });

            const payload = await response.json();

            if (!response.ok) {
              sendJson(res, response.status, {
                error: payload.error?.message || "OpenAI API request failed",
                detail: payload,
              });
              return;
            }

            const result = structuredResultFromPayload(payload);

            sendJson(res, 200, {
              minutes: result?.minutes || "",
              takeaways: Array.isArray(result?.takeaways) ? result.takeaways : [],
              actions: Array.isArray(result?.actions) ? result.actions : [],
              model,
            });
          } catch (error) {
            sendJson(res, 500, {
              error: error instanceof Error ? error.message : "Unknown server error",
            });
          }
        });
      },
    },
  ],
});
