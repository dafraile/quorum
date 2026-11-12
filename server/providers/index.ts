import { anthropicConfigured, anthropicDefaultModel, callAnthropicStructured, streamAnthropicText } from "./anthropic.ts";
import { callOpenAIStructured, openaiConfigured, openaiDefaultModel, streamOpenAIText } from "./openai.ts";
import {
  providerIds,
  type OnTextDelta,
  type ProviderId,
  type StructuredCall,
  type StructuredResult,
  type TextStreamCall,
  type TextStreamResult,
} from "./types.ts";

export * from "./types.ts";

export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === "string" && (providerIds as string[]).includes(value);

export const providerStatus = () => ({
  openai: { live: openaiConfigured(), model: openaiDefaultModel() },
  anthropic: { live: anthropicConfigured(), model: anthropicDefaultModel() },
});

export const callStructured = (call: StructuredCall): Promise<StructuredResult> =>
  call.provider === "anthropic" ? callAnthropicStructured(call) : callOpenAIStructured(call);

export const streamText = (call: TextStreamCall, onDelta: OnTextDelta): Promise<TextStreamResult> =>
  call.provider === "anthropic" ? streamAnthropicText(call, onDelta) : streamOpenAIText(call, onDelta);
