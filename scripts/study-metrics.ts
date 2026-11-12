// Turns a researcher-console export (JSON) into analysis tables:
//   cases.csv         one row per participant x case (the protocol's Part 2 measures)
//   participants.csv  one row per participant (demographics + Appendix D questionnaire)
//
//   node --experimental-strip-types scripts/study-metrics.ts export.json [outDir] [--include-incomplete]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Event = { seq: number; at: string; source: string; type: string; caseIndex?: number; data?: any };
type ExportFile = {
  participants: Array<{
    participant: { participantId: string; pilot: boolean; status: string; allocation: number; sequence: any[]; label?: string };
    events: Event[];
  }>;
};

const [inputPath, outArg, ...flags] = process.argv.slice(2);
if (!inputPath) {
  console.error("usage: study-metrics.ts export.json [outDir] [--include-incomplete]");
  process.exit(1);
}
const outDir = outArg && !outArg.startsWith("--") ? outArg : path.dirname(inputPath);
const includeIncomplete = [outArg, ...flags].includes("--include-incomplete");

const csvCell = (value: unknown) => {
  if (value === undefined || value === null) return "";
  const text = Array.isArray(value) ? value.join("; ") : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const toCsv = (rows: Array<Record<string, unknown>>) => {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n") + "\n";
};

const data = JSON.parse(await readFile(inputPath, "utf8")) as ExportFile;
const caseRows: Array<Record<string, unknown>> = [];
const participantRows: Array<Record<string, unknown>> = [];

for (const { participant, events } of data.participants) {
  if (participant.status !== "completed" && !includeIncomplete) continue;
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const of = (type: string, caseIndex?: number) =>
    ordered.filter((event) => event.type === type && (caseIndex === undefined || event.caseIndex === caseIndex));

  participant.sequence.forEach((slot, caseIndex) => {
    const precommit = of("precommit_submitted", caseIndex).at(-1)?.data;
    const final = of("final_submitted", caseIndex).at(-1)?.data;
    const sealed = of("minutes_sealed", caseIndex).at(-1)?.data;
    const opened = of("floor_opened", caseIndex).at(-1)?.data;

    // Final ruling per candidate (the Chair can change a ruling).
    const finalRulings = new Map<string, any>();
    for (const event of of("ruling", caseIndex)) finalRulings.set(event.data.candidateId, event.data);
    const rulings = [...finalRulings.values()];
    const count = (verdict: string) => rulings.filter((ruling) => ruling.verdict === verdict).length;
    const negative = rulings.filter((ruling) => (ruling.agentIds ?? []).includes("oldGeezer"));
    const overrules = rulings.filter((ruling) => ruling.verdict !== "accept").length;

    const motions = of("motion_filed", caseIndex);
    const chairMotions = motions.filter((event) => event.data.filedBy !== "patient");
    const inRound = (round: number) => chairMotions.filter((event) => event.data.round === round);
    const pinsAdded = of("pin_added", caseIndex).length;
    const pinsRemoved = of("pin_removed", caseIndex).length;

    const patientReplies = of("patient_reply", caseIndex);
    const disclosed = [...new Set(patientReplies.flatMap((event) => event.data.disclosed ?? []))];
    const stances = of("debate_contribution", caseIndex).flatMap((event) => event.data.stances ?? []);

    caseRows.push({
      participantId: participant.participantId,
      pilot: participant.pilot,
      allocation: participant.allocation,
      position: caseIndex + 1,
      caseId: slot.caseId,
      mode: slot.mode,
      floorSource: slot.floorSource,
      planStart: slot.planStart,
      openingStyle: slot.openingStyle ?? opened?.openingStyle,
      confidenceBefore: precommit?.confidence,
      confidenceAfter: final?.confidenceAfter,
      confidenceDelta: precommit && final ? final.confidenceAfter - precommit.confidence : undefined,
      changeSelfReport: final?.change,
      diagnosisTextChanged: final?.diagnosisChanged,
      planTextChanged: final?.planChanged,
      secondsOnRecord: precommit?.secondsOnRecord,
      secondsOnFloor: sealed?.secondsOnFloor,
      secondsInSynthesis: sealed?.secondsInSynthesis,
      questionsToPanelRound1: inRound(1).length,
      questionsToPanelRound2: inRound(2).length,
      motionsToWholeFloor: chairMotions.filter((event) => event.data.target === "floor").length,
      questionsToOneMember: chairMotions.filter((event) => event.data.target !== "floor").length,
      hooksOpened: of("hook_opened", caseIndex).length,
      pinsKept: pinsAdded - pinsRemoved,
      candidates: of("candidates_shown", caseIndex).at(-1)?.data?.candidates?.length,
      itemsRuled: rulings.length,
      accepted: count("accept"),
      amended: count("amend"),
      rejected: count("reject"),
      unruledAtSeal: sealed?.unruled,
      overrules,
      overruleRate: rulings.length ? (overrules / rulings.length).toFixed(2) : undefined,
      rulingsViaClerk: rulings.filter((ruling) => ruling.via === "chat").length,
      rulingsDirect: rulings.filter((ruling) => ruling.via === "direct").length,
      rulingChanges: of("ruling", caseIndex).filter((event) => event.data.previousVerdict).length,
      negativeVerdicts: negative.map((ruling) => ruling.verdict),
      negativeCarried: negative.filter((ruling) => ruling.verdict !== "reject").length,
      debateChallenges: stances.filter((stance: any) => stance.stance === "challenges").length,
      debateBacks: stances.filter((stance: any) => stance.stance === "backs").length,
      patientMotionsFired: of("patient_motion_filed", caseIndex).length,
      patientMotionsPutToPanel: motions.filter((event) => event.data.filedBy === "patient").length,
      questionsToPatient: of("patient_question", caseIndex).length,
      concealedDisclosed: disclosed,
      advocateWithdrawnBy: of("advocate_withdrawn", caseIndex)[0]?.data?.trigger,
      llmErrors: of("llm_error", caseIndex).length,
      precommitDiagnosis: precommit?.diagnosis,
      precommitPlan: precommit?.plan,
      minutes: (sealed?.minutes ?? []).map((item: any) => item.text),
      finalDiagnosis: final?.diagnosis,
      finalPlan: final?.plan,
      changeReason: final?.changeReason,
    });
  });

  participantRows.push({
    participantId: participant.participantId,
    pilot: participant.pilot,
    status: participant.status,
    allocation: participant.allocation,
    ...(of("demographics_submitted").at(-1)?.data ?? {}),
    ...(of("questionnaire_submitted").at(-1)?.data ?? {}),
  });
}

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "cases.csv"), toCsv(caseRows));
await writeFile(path.join(outDir, "participants.csv"), toCsv(participantRows));
console.log(`wrote ${caseRows.length} case rows and ${participantRows.length} participant rows to ${outDir}`);
