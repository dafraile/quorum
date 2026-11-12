import Anthropic from "@anthropic-ai/sdk";
import {
  ProviderError,
  type OnTextDelta,
  type StructuredCall,
  type StructuredResult,
  type TextStreamCall,
  type TextStreamResult,
} from "./types.ts";

export const anthropicDefaultModel = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export const anthropicConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | undefined;

// One retry keeps a live panel responsive; the UI shows a visible error instead of waiting longer.
const getClient = () => (client ??= new Anthropic({ maxRetries: 1 }));

const resolveModel = (requested?: string) =>
  requested && requested.startsWith("claude-") ? requested : anthropicDefaultModel();

export const callAnthropicStructured = async (call: StructuredCall): Promise<StructuredResult> => {
  if (!anthropicConfigured()) {
    throw new ProviderError("anthropic", 503, "ANTHROPIC_API_KEY is not configured");
  }

  if (call.webSearch) {
    // Web search on this adapter is not wired yet; evidence agents run on OpenAI.
    throw new ProviderError("anthropic", 400, "Web search is only available on the OpenAI adapter");
  }

  const model = resolveModel(call.model);
  const timeoutMs = call.timeoutMs ?? 60_000;
  const started = Date.now();

  try {
    const response = await getClient().beta.messages.create(
      {
        model,
        max_tokens: 16000,
        // Server-side fallback re-runs a safety-classifier decline on Anthropic's recommended model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: call.effort ?? "medium",
          format: { type: "json_schema", schema: call.schema },
        },
        messages: [{ role: "user", content: call.prompt }],
      },
      { timeout: timeoutMs },
    );

    if (response.stop_reason === "refusal") {
      const category = response.stop_details?.category ?? "unspecified";
      throw new ProviderError("anthropic", 502, `Anthropic declined the request (category: ${category})`);
    }

    if (response.stop_reason === "max_tokens") {
      throw new ProviderError("anthropic", 502, "Anthropic response hit max_tokens before completing");
    }

    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    return {
      provider: "anthropic",
      model: response.model,
      parsed,
      text,
      sources: [],
      latencyMs: Date.now() - started,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  } catch (error) {
    throw toProviderError(error, timeoutMs);
  }
};

const toProviderError = (error: unknown, timeoutMs: number) => {
  if (error instanceof ProviderError) return error;
  if (error instanceof Anthropic.APIUserAbortError) return new ProviderError("anthropic", 499, "Request cancelled");
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ProviderError("anthropic", 504, `Anthropic request timed out after ${timeoutMs} ms`);
  }
  if (error instanceof Anthropic.RateLimitError) return new ProviderError("anthropic", 429, "Anthropic rate limit reached");
  if (error instanceof Anthropic.APIError) return new ProviderError("anthropic", error.status ?? 502, error.message);
  return new ProviderError("anthropic", 502, error instanceof Error ? error.message : "Anthropic request failed");
};

/** Streams plain text, calling onDelta per text chunk. A server-side fallback continues on the same stream. */
export const streamAnthropicText = async (call: TextStreamCall, onDelta: OnTextDelta): Promise<TextStreamResult> => {
  if (!anthropicConfigured()) {
    throw new ProviderError("anthropic", 503, "ANTHROPIC_API_KEY is not configured");
  }

  const model = resolveModel(call.model);
  const timeoutMs = call.timeoutMs ?? 60_000;
  const started = Date.now();
  let text = "";

  try {
    const stream = getClient().beta.messages.stream(
      {
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: call.effort ?? "low" },
        messages: [{ role: "user", content: call.prompt }],
      },
      { timeout: timeoutMs, signal: call.signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        onDelta(event.delta.text);
      }
    }

    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      const category = message.stop_details?.category ?? "unspecified";
      throw new ProviderError("anthropic", 502, `Anthropic declined the request (category: ${category})`);
    }

    return {
      provider: "anthropic",
      model: message.model,
      text: text.trim(),
      latencyMs: Date.now() - started,
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    };
  } catch (error) {
    throw toProviderError(error, timeoutMs);
  }
};
