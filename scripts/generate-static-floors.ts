// Pre-generates the opening Floor for every study case and mode with Claude Opus,
// for the CI to read, edit and mark `"vetted": true`.
//
//   node --experimental-strip-types scripts/generate-static-floors.ts [caseId ...] [--force]
//
// Existing files are kept unless --force is given (they may already be vetted).
import { access, mkdir, writeFile } from "node:fs/promises";
import { allStudyAgentIds } from "../shared/studyRoster.ts";
import type { AgentKey, StudyMode } from "../shared/studyTypes.ts";
import { agentResultSchema } from "../server/prompts.ts";
import { callStructured } from "../server/providers/index.ts";
import { studyCases } from "../server/study/cases.ts";
import { floorFile, floorsDir, type StaticContribution, type StaticFloorFile } from "../server/study/floors.ts";
import { buildStudyAgentPrompt } from "../server/study/prompts.ts";

const model = process.env.STATIC_FLOOR_MODEL || "claude-opus-5-5";
const effort = "high" as const;
const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyCases = args.filter((arg) => !arg.startsWith("--"));
const modes: StudyMode[] = ["dyadic", "triadic"];

const exists = async (file: string) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

await mkdir(floorsDir(), { recursive: true });

for (const studyCase of studyCases) {
  if (onlyCases.length && !onlyCases.includes(studyCase.id)) continue;
  const file = floorFile(studyCase.id);
  if (!force && (await exists(file))) {
    console.log(`skip ${studyCase.id}: ${file} exists (use --force to regenerate)`);
    continue;
  }

  const contributions = { dyadic: {}, triadic: {} } as StaticFloorFile["contributions"];
  for (const mode of modes) {
    const results = await Promise.all(
      allStudyAgentIds.map(async (agentId) => {
        const result = await callStructured({
          provider: "anthropic",
          model,
          prompt: buildStudyAgentPrompt({ agentId, studyCase, mode }),
          schemaName: "quorum_agent_result",
          schema: agentResultSchema,
          effort,
          timeoutMs: 180_000,
        });
        const parsed = (result.parsed ?? {}) as { answer?: string; keyPoints?: string[] };
        const item: StaticContribution = {
          answer: (parsed.answer || result.text).trim(),
          keyPoints: (parsed.keyPoints ?? []).slice(0, 4),
        };
        console.log(`  ${studyCase.id} ${mode} ${agentId}: ${result.latencyMs} ms`);
        return [agentId, item] as [AgentKey, StaticContribution];
      }),
    );
    contributions[mode] = Object.fromEntries(results);
  }

  const floor: StaticFloorFile = {
    caseId: studyCase.id,
    generatedAt: new Date().toISOString(),
    provider: "anthropic",
    model,
    effort,
    vetted: false,
    contributions,
  };
  await writeFile(file, `${JSON.stringify(floor, null, 2)}\n`);
  console.log(`wrote ${file}`);
}
