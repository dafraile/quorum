// File-backed study store. One JSON record, one append-only JSONL event log and one
// resume snapshot per participant, under STUDY_DATA_DIR (default ./study-data).
// No participant identifiers are stored here: participants are known by ID only.
import { randomBytes, randomInt } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { allStudyAgentIds } from "../../shared/studyRoster.ts";
import type {
  AgentKey,
  FloorSource,
  ParticipantConfig,
  ParticipantStatus,
  PlanStart,
  SequenceItem,
  StudyMode,
  StudyProviderId,
} from "../../shared/studyTypes.ts";
import { studyCases } from "./cases.ts";

export type ParticipantRecord = {
  config: ParticipantConfig;
  token: string;
  status: ParticipantStatus;
  startedAt?: string;
  completedAt?: string;
};

export type StudyEvent = {
  seq: number;
  at: string;
  source: "client" | "server";
  type: string;
  caseIndex?: number;
  data?: unknown;
  clientAt?: string;
};

const dataDir = () => path.resolve(process.env.STUDY_DATA_DIR || "study-data");
const dirs = () => ({
  participants: path.join(dataDir(), "participants"),
  events: path.join(dataDir(), "events"),
  snapshots: path.join(dataDir(), "snapshots"),
});

const ensureDirs = async () => {
  for (const dir of Object.values(dirs())) await mkdir(dir, { recursive: true });
};

const readJson = async <T>(file: string): Promise<T | undefined> => {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return undefined;
  }
};

const participantFile = (id: string) => path.join(dirs().participants, `${id}.json`);
const eventFile = (id: string) => path.join(dirs().events, `${id}.jsonl`);
const snapshotFile = (id: string) => path.join(dirs().snapshots, `${id}.json`);
const allocationFile = () => path.join(dataDir(), "allocation.json");
const countersFile = () => path.join(dataDir(), "counters.json");

/** Monotonic per-process event sequence (ms clock, never repeats). */
let lastSeq = 0;
const nextSeq = () => (lastSeq = Math.max(Date.now(), lastSeq + 1));

/** Never reuses an ID or an allocation slot, even after a purge. */
const nextCounters = async (prefix: string) => {
  const counters = (await readJson<Record<string, number>>(countersFile())) ?? {};
  counters[prefix] = (counters[prefix] ?? 0) + 1;
  counters.all = (counters.all ?? 0) + 1;
  await writeFile(countersFile(), JSON.stringify(counters));
  return { number: counters[prefix], index: counters.all - 1 };
};

export const listParticipants = async (): Promise<ParticipantRecord[]> => {
  await ensureDirs();
  const files = (await readdir(dirs().participants)).filter((name) => name.endsWith(".json")).sort();
  const records = await Promise.all(files.map((name) => readJson<ParticipantRecord>(path.join(dirs().participants, name))));
  return records.filter((record): record is ParticipantRecord => Boolean(record));
};

export const findParticipantByToken = async (token: unknown) => {
  if (typeof token !== "string" || token.length < 16) return undefined;
  return (await listParticipants()).find((record) => record.token === token);
};

export const saveParticipant = async (record: ParticipantRecord) => {
  await ensureDirs();
  await writeFile(participantFile(record.config.participantId), JSON.stringify(record, null, 2));
};

// Counterbalancing: 2 cases x 2 mode orders = 4 sequences, assigned in randomly
// permuted blocks of 4 (the blocked random allocation used in Part 1).
const sequenceTemplates: Array<Array<{ caseIndex: number; mode: StudyMode }>> = [
  [
    { caseIndex: 0, mode: "dyadic" },
    { caseIndex: 1, mode: "triadic" },
  ],
  [
    { caseIndex: 0, mode: "triadic" },
    { caseIndex: 1, mode: "dyadic" },
  ],
  [
    { caseIndex: 1, mode: "dyadic" },
    { caseIndex: 0, mode: "triadic" },
  ],
  [
    { caseIndex: 1, mode: "triadic" },
    { caseIndex: 0, mode: "dyadic" },
  ],
];

const shuffle = <T>(items: T[]) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const nextAllocation = async (participantIndex: number) => {
  const allocation = (await readJson<number[]>(allocationFile())) ?? [];
  while (allocation.length <= participantIndex) allocation.push(...shuffle([0, 1, 2, 3]));
  await writeFile(allocationFile(), JSON.stringify(allocation));
  return allocation[participantIndex];
};

/** Live calls: half the agents on each provider, randomised per participant. */
const randomProviderMix = (): Record<AgentKey, StudyProviderId> => {
  const ids = shuffle(allStudyAgentIds);
  const half = Math.ceil(ids.length / 2);
  return Object.fromEntries(ids.map((id, index) => [id, index < half ? "openai" : "anthropic"])) as Record<
    AgentKey,
    StudyProviderId
  >;
};

export type CreateParticipantInput = {
  pilot?: boolean;
  label?: string;
  showConsent?: boolean;
  /** Per case position (1st, 2nd). Defaults: static, static. */
  floorSources?: FloorSource[];
  /** Per case position. Defaults: pilot -> one prefilled and one blank in random order; otherwise prefilled. */
  planStarts?: PlanStart[];
  /** Force one of the four counterbalanced sequences (0-3) instead of the next allocation. */
  allocation?: number;
};

export const createParticipant = async (input: CreateParticipantInput): Promise<ParticipantRecord> => {
  await ensureDirs();
  const pilot = input.pilot ?? true;
  const prefix = pilot ? "T" : "P";
  const counters = await nextCounters(prefix);
  const participantId = `${prefix}${String(counters.number).padStart(2, "0")}`;

  const allocation =
    typeof input.allocation === "number" && input.allocation >= 0 && input.allocation <= 3
      ? input.allocation
      : await nextAllocation(counters.index);
  const floorSources = input.floorSources ?? ["static", "static"];
  const planStarts =
    input.planStarts ?? (pilot ? shuffle<PlanStart>(["prefilled", "blank"]) : ["prefilled", "prefilled"]);

  const sequence: SequenceItem[] = sequenceTemplates[allocation].map((slot, position) => ({
    caseId: studyCases[slot.caseIndex].id,
    mode: slot.mode,
    floorSource: floorSources[position] ?? "static",
    planStart: planStarts[position] ?? "prefilled",
  }));

  const record: ParticipantRecord = {
    config: {
      participantId,
      pilot,
      showConsent: input.showConsent ?? true,
      label: input.label?.slice(0, 80),
      allocation,
      sequence,
      providerMix: randomProviderMix(),
      createdAt: new Date().toISOString(),
    },
    token: randomBytes(18).toString("base64url"),
    status: "created",
  };

  await saveParticipant(record);
  await appendEvent(participantId, {
    source: "server",
    type: "participant_created",
    data: { allocation, sequence, providerMix: record.config.providerMix, pilot },
  });
  return record;
};

export const appendEvent = async (participantId: string, event: Omit<StudyEvent, "seq" | "at">) => {
  await ensureDirs();
  const line: StudyEvent = { seq: nextSeq(), at: new Date().toISOString(), ...event };
  await appendFile(eventFile(participantId), `${JSON.stringify(line)}\n`);
  return line;
};

export const readEvents = async (participantId: string): Promise<StudyEvent[]> => {
  try {
    return (await readFile(eventFile(participantId), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StudyEvent);
  } catch {
    return [];
  }
};

export const saveSnapshot = async (participantId: string, snapshot: unknown) => {
  await ensureDirs();
  await writeFile(snapshotFile(participantId), JSON.stringify({ savedAt: new Date().toISOString(), snapshot }));
};

export const loadSnapshot = async (participantId: string) =>
  (await readJson<{ savedAt: string; snapshot: unknown }>(snapshotFile(participantId)))?.snapshot ?? null;

/** Deletes everything stored for a participant (withdrawal or incomplete session). */
export const deleteParticipantData = async (participantId: string) => {
  await Promise.all(
    [participantFile(participantId), eventFile(participantId), snapshotFile(participantId)].map((file) =>
      rm(file, { force: true }),
    ),
  );
};
