import { ProviderError, type SourceLink, type StructuredCall, type StructuredResult } from "./types.ts";

export const openaiDefaultModel = () => process.env.OPENAI_MODEL || "gpt-5.5";

export const openaiConfigured = () => Boolean(process.env.OPENAI_API_KEY);

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

const extractSources = (payload: any): SourceLink[] => {
  const sources = new Map<string, SourceLink>();

  const visit = (value: any) => {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (value.type === "url_citation" && value.url) {
      sources.set(value.url, { title: value.title || value.url, url: value.url });
    }

    if (value.url && value.title && typeof value.url === "string") {
      sources.set(value.url, { title: value.title, url: value.url });
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
      if (content?.parsed && typeof content.parsed === "object") return content.parsed;
    }
  }

  return null;
};

export const parseJsonText = (text: string) => {
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

export const callOpenAIStructured = async (call: StructuredCall): Promise<StructuredResult> => {
  if (!openaiConfigured()) {
    throw new ProviderError("openai", 503, "OPENAI_API_KEY is not configured");
  }

  const model = call.model && call.model !== "server-default" ? call.model : openaiDefaultModel();
  const tools = call.webSearch
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
          filters: { allowed_domains: call.webSearch.allowedDomains },
        },
      ]
    : undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), call.timeoutMs ?? 60_000);
  const started = Date.now();

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        // Do not retain the response object on OpenAI's side for later retrieval.
        store: false,
        reasoning: { effort: call.effort || "medium" },
        tools,
        tool_choice: "auto",
        include: tools ? ["web_search_call.action.sources"] : undefined,
        text: {
          format: { type: "json_schema", name: call.schemaName, strict: true, schema: call.schema },
        },
        input: call.prompt,
      }),
    });

    const payload: any = await response.json();

    if (!response.ok) {
      throw new ProviderError("openai", response.status, payload.error?.message || "OpenAI API request failed");
    }

    const text = extractOutputText(payload);

    return {
      provider: "openai",
      model,
      parsed: extractParsedOutput(payload) ?? parseJsonText(text),
      text,
      sources: extractSources(payload),
      latencyMs: Date.now() - started,
      usage: {
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
      },
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (controller.signal.aborted) {
      throw new ProviderError("openai", 504, `OpenAI request timed out after ${call.timeoutMs ?? 60_000} ms`);
    }
    throw new ProviderError("openai", 502, error instanceof Error ? error.message : "OpenAI request failed");
  } finally {
    clearTimeout(timeout);
  }
};
