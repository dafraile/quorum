// Static (pre-generated, CI-vetted) opening Floors. Stored as JSON on disk so the CI
// can edit and vet them without a rebuild. Generate with scripts/generate-static-floors.ts.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentKey, StudyMode } from "../../shared/studyTypes.ts";

export type StaticContribution = { answer: string; keyPoints: string[] };

export type StaticFloorFile = {
  caseId: string;
  generatedAt: string;
  provider: string;
  model: string;
  effort: string;
  /** Set to true by hand once the CI has read and, where needed, edited every contribution. */
  vetted: boolean;
  contributions: Record<StudyMode, Partial<Record<AgentKey, StaticContribution>>>;
};

export const floorsDir = () => path.resolve(process.env.STUDY_FLOORS_DIR || "server/study/floors");

export const floorFile = (caseId: string) => path.join(floorsDir(), `${caseId}.json`);

export const loadStaticFloor = async (caseId: string): Promise<StaticFloorFile | undefined> => {
  try {
    return JSON.parse(await readFile(floorFile(caseId), "utf8")) as StaticFloorFile;
  } catch {
    return undefined;
  }
};
