// Adds a one-sentence opening hook to every static contribution that lacks one,
// derived from the contribution itself so the two stay consistent. Answers are not touched.
//
//   node --experimental-strip-types scripts/add-floor-hooks.ts [caseId ...] [--force]
import { readFile, writeFile } from "node:fs/promises";
import { studyAgentById, type StudyAgentId } from "../shared/studyRoster.ts";
import type { StudyMode } from "../shared/studyTypes.ts";
import { callStructured } from "../server/providers/index.ts";
import { studyCaseById, studyCases } from "../server/study/cases.ts";
import { floorFile, type StaticFloorFile } from "../server/study/floors.ts";

const model = process.env.STATIC_FLOOR_MODEL || "claude-opus-5-5";
const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyCases = args.filter((arg) => !arg.startsWith("--"));

const hookSchema = {
  type: "object",
  additionalProperties: false,
  properties: { hook: { type: "string" } },
  required: ["hook"],
};

const hookPrompt = (agentId: StudyAgentId, caseTitle: string, answer: string) => {
  const agent = studyAgentById(agentId);
  return `You are ${agent.name} in Quorum, a chaired clinical deliberation. Stance: ${agent.stance}. Voice: ${agent.tone}

Case: ${caseTitle}

This is your prepared contribution, which the Chair (a GP) has not read yet:
${answer}

Write your opening line to the Chair: one sentence of at most 20 words, in your own voice, that would make the Chair want to hear you out. A pointed question or observation drawn from the contribution above. Do not give away your whole point and do not add anything the contribution does not say.${
    agent.negative ? " Sound comfortable and experienced; never hint that you might be wrong." : ""
  }

Return JSON with hook.`;
};

for (const studyCase of studyCases) {
  if (onlyCases.length && !onlyCases.includes(studyCase.id)) continue;
  const file = floorFile(studyCase.id);
  const floor = JSON.parse(await readFile(file, "utf8")) as StaticFloorFile;
  const jobs: Array<Promise<void>> = [];
  for (const mode of Object.keys(floor.contributions) as StudyMode[]) {
    for (const [agentId, item] of Object.entries(floor.contributions[mode])) {
      if (!item || (item.hook && !force)) continue;
      jobs.push(
        callStructured({
          provider: "anthropic",
          model,
          prompt: hookPrompt(agentId as StudyAgentId, studyCaseById(studyCase.id)!.title, item.answer),
          schemaName: "quorum_hook",
          schema: hookSchema,
          effort: "high",
          timeoutMs: 120_000,
        }).then((result) => {
          item.hook = String((result.parsed as { hook?: string } | null)?.hook ?? "").trim();
          console.log(`  ${studyCase.id} ${mode} ${agentId}: ${item.hook}`);
        }),
      );
    }
  }
  await Promise.all(jobs);
  await writeFile(file, `${JSON.stringify(floor, null, 2)}\n`);
  console.log(`updated ${file} (${jobs.length} hooks)`);
}
