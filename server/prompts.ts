import type { ProviderId } from "./providers/types.ts";

export type AgentRequest = {
  agentId: string;
  agentName: string;
  stance: string;
  tone: string;
  rules?: string[];
  motion: string;
  caseContext: string;
  previousOutput?: string;
  chairQuestion?: string;
  provider?: ProviderId;
  model?: string;
  reasoning?: "low" | "medium" | "high";
  evidenceMode?: boolean;
  wordLimit?: number;
};

export type ClerkRequest = {
  mode: "clinical" | "thinking";
  motion: string;
  context: string;
  provider?: ProviderId;
  contributions: Array<{
    agentName: string;
    stance: string;
    review: string;
    result?: {
      answer?: string;
      keyPoints?: string[];
      questions?: string[];
      missingQuestions?: string[];
      suggestedActions?: string[];
      uncertainty?: string[];
      citations?: Array<{ title: string; url: string }>;
    };
    output?: string;
  }>;
};

// Plain JSON Schemas. Both providers accept them as-is: every object sets
// additionalProperties: false and lists all properties as required.
export const agentResultSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    missingQuestions: { type: "array", items: { type: "string" } },
    suggestedActions: { type: "array", items: { type: "string" } },
    uncertainty: { type: "array", items: { type: "string" } },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          url: { type: "string" },
        },
        required: ["title", "url"],
      },
    },
  },
  required: ["answer", "keyPoints", "questions", "missingQuestions", "suggestedActions", "uncertainty", "citations"],
};

export const clerkResultSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    minutes: { type: "string" },
    takeaways: { type: "array", items: { type: "string" } },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          detail: { type: "string" },
          owner: { type: "string" },
          priority: { type: "string" },
        },
        required: ["label", "detail", "owner", "priority"],
      },
    },
    unresolvedQuestions: { type: "array", items: { type: "string" } },
    reviewSummary: { type: "array", items: { type: "string" } },
  },
  required: ["minutes", "takeaways", "actions", "unresolvedQuestions", "reviewSummary"],
};

export const evidenceDomains = [
  "rcpa.edu.au",
  "racgp.org.au",
  "cdc.gov",
  "ncbi.nlm.nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "nice.org.uk",
];

export const buildAgentPrompt = (body: AgentRequest) => {
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

Keep answer under ${body.wordLimit ?? 120} words unless evidence citations are essential.
Make one or two concrete points visible on the case record.

Motion: ${body.motion}

Case context:
${body.caseContext}
${followUp}

Return JSON with:
- answer: your contribution, no heading.
- keyPoints: 2 to 4 short bullets that can be shown on the card.
- questions: 0 to 3 useful follow-up questions for the Chair.
- missingQuestions: 0 to 4 case-specific questions that remain unanswered.
- uncertainty: 0 to 4 limits, caveats, or conditions that would change the view.
- suggestedActions: 0 to 4 concrete next actions, only if your stance supports them.
- citations: 0 to 4 source objects with title and url. Use citations only for sources actually used or retrieved.`;
};

export const buildClerkPrompt = (body: ClerkRequest) => {
  const contributions = body.contributions
    .map(
      (item) => `## ${item.agentName}
Stance: ${item.stance}
Chair review: ${item.review}
Key points: ${(item.result?.keyPoints ?? []).join("; ") || "None recorded"}
Uncertainty: ${(item.result?.uncertainty ?? []).join("; ") || "None recorded"}
Missing questions: ${(item.result?.missingQuestions ?? item.result?.questions ?? []).join("; ") || "None recorded"}
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
- actions: 3 to 6 concrete proposed action-log objects, each with label, detail, owner, and priority.
- unresolvedQuestions: 0 to 6 unresolved questions the Chair should not lose.
- reviewSummary: one short line per reviewed archetype noting how its status affected the record.`;
};
