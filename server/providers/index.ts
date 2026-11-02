import { anthropicConfigured, anthropicDefaultModel, callAnthropicStructured } from "./anthropic.ts";
import { callOpenAIStructured, openaiConfigured, openaiDefaultModel } from "./openai.ts";
import { providerIds, type ProviderId, type StructuredCall, type StructuredResult } from "./types.ts";

export * from "./types.ts";

export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === "string" && (providerIds as string[]).includes(value);

export const providerStatus = () => ({
  openai: { live: openaiConfigured(), model: openaiDefaultModel() },
  anthropic: { live: anthropicConfigured(), model: anthropicDefaultModel() },
});

export const callStructured = (call: StructuredCall): Promise<StructuredResult> =>
  call.provider === "anthropic" ? callAnthropicStructured(call) : callOpenAIStructured(call);
