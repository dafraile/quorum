import {
  ProviderError,
  type OnTextDelta,
  type SourceLink,
  type StructuredCall,
  type StructuredResult,
  type TextStreamCall,
  type TextStreamResult,
} from "./types.ts";

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

/** Streams plain text from the Responses API (server-sent events), calling onDelta per text chunk. */
export const streamOpenAIText = async (call: TextStreamCall, onDelta: OnTextDelta): Promise<TextStreamResult> => {
  if (!openaiConfigured()) {
    throw new ProviderError("openai", 503, "OPENAI_API_KEY is not configured");
  }

  const model = call.model && call.model !== "server-default" ? call.model : openaiDefaultModel();
  const timeoutMs = call.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  call.signal?.addEventListener("abort", onAbort);
  const started = Date.now();
  let text = "";
  let usage: TextStreamResult["usage"];

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model,
        store: false,
        stream: true,
        reasoning: { effort: call.effort || "low" },
        input: call.prompt,
      }),
    });

    if (!response.ok || !response.body) {
      const payload: any = await response.json().catch(() => ({}));
      throw new ProviderError("openai", response.status || 502, payload.error?.message || "OpenAI API request failed");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    const handle = (block: string) => {
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (!data || data === "[DONE]") return;
      const event = JSON.parse(data);
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        text += event.delta;
        onDelta(event.delta);
      } else if (event.type === "response.completed") {
        usage = { inputTokens: event.response?.usage?.input_tokens, outputTokens: event.response?.usage?.output_tokens };
      } else if (event.type === "response.failed" || event.type === "error") {
        const message = event.response?.error?.message || event.error?.message || event.message || "OpenAI stream failed";
        throw new ProviderError("openai", 502, message);
      }
    };

    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        handle(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) handle(buffer);

    return { provider: "openai", model, text: text.trim(), latencyMs: Date.now() - started, usage };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (controller.signal.aborted) {
      throw new ProviderError("openai", 504, call.signal?.aborted ? "Request cancelled" : `OpenAI stream timed out after ${timeoutMs} ms`);
    }
    throw new ProviderError("openai", 502, error instanceof Error ? error.message : "OpenAI stream failed");
  } finally {
    clearTimeout(timeout);
    call.signal?.removeEventListener("abort", onAbort);
  }
};
