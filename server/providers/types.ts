export type ProviderId = "openai" | "anthropic";

export const providerIds: ProviderId[] = ["openai", "anthropic"];

export type Effort = "low" | "medium" | "high";

export type SourceLink = { title: string; url: string };

export type StructuredCall = {
  provider: ProviderId;
  /** Omitted or "server-default" resolves to the provider's configured default. */
  model?: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  effort?: Effort;
  /** Restricts web search to these domains. Only the OpenAI adapter supports it for now. */
  webSearch?: { allowedDomains: string[] };
  timeoutMs?: number;
};

export type StructuredResult = {
  provider: ProviderId;
  model: string;
  parsed: Record<string, unknown> | null;
  text: string;
  sources: SourceLink[];
  latencyMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
};

/** An upstream failure the API layer can report to the client with a status code. */
export class ProviderError extends Error {
  readonly provider: ProviderId;
  readonly status: number;

  constructor(provider: ProviderId, status: number, message: string) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
  }
}
