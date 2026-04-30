import {
  Activity,
  Archive,
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileText,
  Gavel,
  Layers3,
  MessageSquareText,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  UserRoundCheck,
  WandSparkles,
  X,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  type AgentSettings,
  type Archetype,
  type ArchetypeId,
  type ReviewStatus,
  archetypes,
  defaultAgentSettings,
  defaultSession,
  fallbackSources,
} from "./data";

type View = "docket" | "floor";
type CallState = "idle" | "calling" | "complete";
type SourceLink = { title: string; url: string };
type RuntimeInfo = { live: boolean; model: string };
type SessionMode = "clinical" | "thinking";

type AgentResult = {
  answer: string;
  keyPoints: string[];
  questions: string[];
  missingQuestions: string[];
  suggestedActions: string[];
  uncertainty: string[];
  citations: SourceLink[];
};

type ActionLogEntry = {
  id: string;
  at: string;
  label: string;
  detail: string;
};

type AnonymizationState = {
  anonymizedText: string;
  redactionCount: number;
  findings: string[];
  createdAt: string;
  approvedForLive: boolean;
};

type ClerkActionDraft = {
  label: string;
  detail: string;
  owner: string;
  priority: string;
};

type ClerkDraft = {
  minutes: string;
  takeaways: string[];
  actions: ClerkActionDraft[];
  unresolvedQuestions: string[];
  reviewSummary: string[];
};

type LoungeMessage = {
  id: string;
  at: string;
  speakerId: ArchetypeId;
  targetId?: ArchetypeId;
  text: string;
  keyPoints: string[];
};

type QuorumSession = {
  id: string;
  title: string;
  mode: SessionMode;
  sourceText: string;
  parentSessionId?: string;
  followUpNote?: string;
  selectedArchetypes: ArchetypeId[];
  settings: Record<ArchetypeId, AgentSettings>;
  results: Partial<Record<ArchetypeId, AgentResult>>;
  outputs: Partial<Record<ArchetypeId, string>>;
  reviews: Partial<Record<ArchetypeId, ReviewStatus>>;
  lounge: LoungeMessage[];
  minutes: string[];
  actionLog: ActionLogEntry[];
  anonymization?: AnonymizationState;
  createdAt: string;
  updatedAt: string;
};

type PersistedState = {
  selectedArchetypes: ArchetypeId[];
  settings: Record<ArchetypeId, AgentSettings>;
  sessions: QuorumSession[];
  activeSessionId?: string;
  customArchetypes: Archetype[];
};

const storageKey = "quorum-state-v1";
const legacyStorageKey = "quorum-demo-state-v033";

const defaultPlannerDrafts: Record<SessionMode, string[]> = {
  clinical: [
    "Name the clinical question and the decision that needs to be made now.",
    "Separate known facts from assumptions, deferred questions, and patient-context gaps.",
    "List the proportionate next clinical actions and who owns each one.",
    "Record what would change the plan or require escalation.",
  ],
  thinking: [
    "Name the core decision, unresolved tension, or question.",
    "Separate assumptions, options, risks, and evidence gaps.",
    "Choose the next concrete move and the smallest useful test.",
    "Record what would change the recommendation.",
  ],
};

const archetypeArtImages: Record<ArchetypeId, string> = {
  intern: "/generated/archetype-intern.png",
  oldNurse: "/generated/archetype-nurse.png",
  biblioRat: "/generated/archetype-biblio-rat.png",
  contrarian: "/generated/archetype-contrarian.png",
  patientAdvocate: "/generated/archetype-advocate.png",
  shrink: "/generated/archetype-shrink.png",
  oldGeezer: "/generated/archetype-old-geezer.png",
};

const customCardImage = "/generated/archetype-card-back.png";

const mrsMTemplateText = [
  "Mrs M, 68, female.",
  "Asymptomatic eosinophilia found on routine cardiovascular bloods.",
  "Background: ischaemic heart disease with NSTEMI in 2019 and two stents; asthma, hypertension, high cholesterol, GORD.",
  "Medication: aspirin, atorvastatin, bisoprolol, ramipril, omeprazole, salbutamol PRN and beclometasone inhaler.",
  "Initial history recorded no recent foreign travel. Medication review and detailed travel history are unresolved.",
].join("\n");

const thinkingStarterText =
  "Paste a strategic problem, research question, product decision, conflict, draft, or messy thought here. Quorum will turn it into a chaired Session instead of one undifferentiated answer.";

const initialPersisted: PersistedState = {
  selectedArchetypes: defaultSession,
  settings: defaultAgentSettings,
  sessions: [],
  customArchetypes: [],
};

const normalizePersistedAgentResult = (value: any): AgentResult => ({
  answer: String(value?.answer ?? ""),
  keyPoints: Array.isArray(value?.keyPoints) ? value.keyPoints.map(String) : [],
  questions: Array.isArray(value?.questions) ? value.questions.map(String) : [],
  missingQuestions: Array.isArray(value?.missingQuestions)
    ? value.missingQuestions.map(String)
    : Array.isArray(value?.questions)
      ? value.questions.map(String)
      : [],
  suggestedActions: Array.isArray(value?.suggestedActions) ? value.suggestedActions.map(String) : [],
  uncertainty: Array.isArray(value?.uncertainty) ? value.uncertainty.map(String) : [],
  citations: Array.isArray(value?.citations)
    ? value.citations
        .map((item: any) => ({ title: String(item.title || item.url || "Source"), url: String(item.url || "") }))
        .filter((item: SourceLink) => item.url)
    : [],
});

const loadPersisted = (): PersistedState => {
  const raw = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(legacyStorageKey);
  if (!raw) return initialPersisted;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const sessions = (parsed.sessions ?? []).map((session) => ({
      ...session,
      settings: {
        ...defaultAgentSettings,
        ...(session.settings ?? {}),
      },
      selectedArchetypes: session.selectedArchetypes ?? defaultSession,
      results: Object.fromEntries(
        Object.entries(session.results ?? {}).map(([id, result]) => [id, normalizePersistedAgentResult(result)]),
      ),
      outputs: session.outputs ?? {},
      reviews: session.reviews ?? {},
      lounge: session.lounge ?? [],
      minutes: session.minutes ?? [],
      actionLog: session.actionLog ?? [],
    }));

    return {
      selectedArchetypes: parsed.selectedArchetypes ?? initialPersisted.selectedArchetypes,
      settings: {
        ...defaultAgentSettings,
        ...(parsed.settings ?? {}),
      },
      sessions,
      activeSessionId: sessions.some((session) => session.id === parsed.activeSessionId) ? parsed.activeSessionId : undefined,
      customArchetypes: parsed.customArchetypes ?? [],
    };
  } catch {
    return initialPersisted;
  }
};

const iconForArchetype = (id: ArchetypeId) => {
  switch (id) {
    case "intern":
      return <Sparkles size={18} />;
    case "oldNurse":
      return <Stethoscope size={18} />;
    case "biblioRat":
      return <BookOpenText size={18} />;
    case "contrarian":
      return <ShieldAlert size={18} />;
    case "patientAdvocate":
      return <UserRoundCheck size={18} />;
    case "shrink":
      return <Search size={18} />;
    case "oldGeezer":
      return <Gavel size={18} />;
    default:
      return <WandSparkles size={18} />;
  }
};

const createId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const toAgentResult = (text: string, id: ArchetypeId): AgentResult => {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  const keyPoints = sentences.slice(0, 3).map((item) => item.replace(/^[*-]\s*/, ""));
  const questions = sentences.filter((item) => item.includes("?")).slice(0, 3);

  return {
    answer: text,
    keyPoints: keyPoints.length ? keyPoints : [`${id} has a contribution ready for review.`],
    questions,
    missingQuestions: questions,
    suggestedActions: [],
    uncertainty: sentences.length > 3 ? [sentences[3]] : ["Uncertainty depends on the Chair clarifying the next decision."],
    citations: [],
  };
};

const parseAgentResult = (payload: any, id: ArchetypeId): AgentResult => {
  if (payload?.result?.answer) {
    const result = payload.result;
    return {
      answer: String(result.answer),
      keyPoints: Array.isArray(result.keyPoints) ? result.keyPoints.slice(0, 4).map(String) : [],
      questions: Array.isArray(result.questions) ? result.questions.slice(0, 3).map(String) : [],
      missingQuestions: Array.isArray(result.missingQuestions)
        ? result.missingQuestions.slice(0, 4).map(String)
        : Array.isArray(result.questions)
          ? result.questions.slice(0, 3).map(String)
          : [],
      suggestedActions: Array.isArray(result.suggestedActions) ? result.suggestedActions.slice(0, 4).map(String) : [],
      uncertainty: Array.isArray(result.uncertainty) ? result.uncertainty.slice(0, 4).map(String) : [],
      citations: Array.isArray(result.citations)
        ? result.citations
            .slice(0, 4)
            .map((item: any) => ({ title: String(item.title || item.url || "Source"), url: String(item.url || "") }))
            .filter((item: SourceLink) => item.url)
        : [],
    };
  }

  return toAgentResult(String(payload?.text || ""), id);
};

const normalizeClerkAction = (item: unknown): ClerkActionDraft => {
  if (typeof item === "string") {
    return {
      label: item.slice(0, 64),
      detail: item,
      owner: "Chair",
      priority: "Next",
    };
  }

  const action = item && typeof item === "object" ? (item as Partial<ClerkActionDraft>) : {};
  const detail = String(action.detail || action.label || "Review and assign this action.");

  return {
    label: String(action.label || detail.slice(0, 64)),
    detail,
    owner: String(action.owner || "Chair"),
    priority: String(action.priority || "Next"),
  };
};

const parseClerkDraft = (payload: any): ClerkDraft | null => {
  const raw = payload?.draft ?? payload;
  if (!raw || typeof raw !== "object") return null;

  const actions = Array.isArray(raw.actions) ? raw.actions.map(normalizeClerkAction).slice(0, 8) : [];

  return {
    minutes: String(raw.minutes || ""),
    takeaways: Array.isArray(raw.takeaways) ? raw.takeaways.slice(0, 6).map(String) : [],
    actions,
    unresolvedQuestions: Array.isArray(raw.unresolvedQuestions) ? raw.unresolvedQuestions.slice(0, 6).map(String) : [],
    reviewSummary: Array.isArray(raw.reviewSummary) ? raw.reviewSummary.slice(0, 6).map(String) : [],
  };
};

const mergeSourceLinks = (...lists: Array<SourceLink[] | undefined>) => {
  const seen = new Map<string, SourceLink>();
  lists.flat().forEach((source) => {
    if (source?.url) seen.set(source.url, source);
  });
  return Array.from(seen.values()).slice(0, 6);
};

const fallbackClerkDraft = (
  mode: SessionMode,
  roster: Archetype[],
  results: Partial<Record<ArchetypeId, AgentResult>>,
  reviews: Partial<Record<ArchetypeId, ReviewStatus>>,
): ClerkDraft => {
  const accepted = roster.filter((agent) => reviews[agent.id] === "accepted");
  const considered = accepted.length ? accepted : roster;
  const takeaways = considered
    .flatMap((agent) => results[agent.id]?.keyPoints ?? [])
    .filter(Boolean)
    .slice(0, 5);
  const actions = considered
    .flatMap((agent) => results[agent.id]?.suggestedActions ?? [])
    .filter(Boolean)
    .slice(0, 6)
    .map((detail) => normalizeClerkAction({ label: detail, detail, owner: "Chair", priority: "Next" }));
  const unresolvedQuestions = considered
    .flatMap((agent) => results[agent.id]?.missingQuestions ?? results[agent.id]?.questions ?? [])
    .filter(Boolean)
    .slice(0, 5);

  return {
    minutes:
      takeaways.length > 0
        ? `The Chair reviewed ${considered.length} archetype contribution${considered.length === 1 ? "" : "s"} and preserved the main points for action.`
        : "The Clerk has prepared a starter record from the available Session state.",
    takeaways: takeaways.length ? takeaways : defaultPlannerDrafts[mode].slice(0, 3),
    actions: actions.length ? actions : defaultPlannerDrafts[mode].map((detail) => normalizeClerkAction({ label: detail, detail })),
    unresolvedQuestions,
    reviewSummary: roster.map((agent) => `${agent.shortName}: ${statusLabel[reviews[agent.id] ?? "pending"]}`),
  };
};

const anonymizationPatterns: Array<{ label: string; pattern: RegExp; replacement: string }> = [
  {
    label: "Email address",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[EMAIL]",
  },
  {
    label: "Phone or long numeric identifier",
    pattern: /\b(?:\+?\d[\d\s().-]{7,}\d)\b/g,
    replacement: "[PHONE_OR_ID]",
  },
  {
    label: "Health identifier",
    pattern: /\b(?:MRN|UR|URN|NHI|Medicare|Patient ID)\s*[:#]?\s*[A-Z0-9-]{4,}\b/gi,
    replacement: "[HEALTH_ID]",
  },
  {
    label: "Date of birth",
    pattern: /\b(?:DOB|Date of birth)\s*[:#]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
    replacement: "[DOB]",
  },
  {
    label: "Calendar date",
    pattern: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
    replacement: "[DATE]",
  },
  {
    label: "Street address",
    pattern:
      /\b\d{1,5}\s+[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,4}\s+(?:St|Street|Rd|Road|Ave|Avenue|Dr|Drive|Lane|Ln|Court|Ct|Place|Pl|Way)\b/g,
    replacement: "[ADDRESS]",
  },
  {
    label: "Explicit patient name",
    pattern: /\b(?:Patient name|Name)\s*:\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g,
    replacement: "Patient name: [NAME]",
  },
];

const anonymizeClinicalText = (text: string): AnonymizationState => {
  let anonymizedText = text;
  const findings: string[] = [];
  let redactionCount = 0;

  anonymizationPatterns.forEach(({ label, pattern, replacement }) => {
    const matches = anonymizedText.match(pattern);
    if (!matches?.length) return;

    redactionCount += matches.length;
    findings.push(`${label}: ${matches.length}`);
    anonymizedText = anonymizedText.replace(pattern, replacement);
  });

  return {
    anonymizedText,
    redactionCount,
    findings: findings.length ? findings : ["No obvious direct identifiers detected by local pattern scan."],
    createdAt: new Date().toISOString(),
    approvedForLive: false,
  };
};

const sessionWorkingText = (session: QuorumSession) =>
  session.mode === "clinical" && session.anonymization ? session.anonymization.anonymizedText : session.sourceText;

const statusLabel: Record<ReviewStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  revision: "Revision requested",
};

function App() {
  const [view, setView] = useState<View>("docket");
  const [persisted, setPersisted] = useState<PersistedState>(() => loadPersisted());
  const [callState, setCallState] = useState<CallState>("idle");
  const [quorumFlash, setQuorumFlash] = useState(false);
  const [turnReviewOpen, setTurnReviewOpen] = useState(false);
  const [turnReviewIndex, setTurnReviewIndex] = useState(0);
  const [outputs, setOutputs] = useState<Partial<Record<ArchetypeId, string>>>({});
  const [agentResults, setAgentResults] = useState<Partial<Record<ArchetypeId, AgentResult>>>({});
  const [sources, setSources] = useState<Partial<Record<ArchetypeId, SourceLink[]>>>({});
  const [reviews, setReviews] = useState<Partial<Record<ArchetypeId, ReviewStatus>>>({});
  const [plannerVisible, setPlannerVisible] = useState(false);
  const [clerkDraft, setClerkDraft] = useState<ClerkDraft | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo>({ live: false, model: "gpt-5.5" });
  const [useLiveApi, setUseLiveApi] = useState(true);
  const [tuningCard, setTuningCard] = useState<ArchetypeId | null>(null);
  const [followUps, setFollowUps] = useState<Partial<Record<ArchetypeId, string>>>({});
  const [intakeMode, setIntakeMode] = useState<SessionMode>("clinical");
  const [intakeTitle, setIntakeTitle] = useState("");
  const [intakeText, setIntakeText] = useState("");
  const [followUpText, setFollowUpText] = useState("");
  const [loungeSpeaker, setLoungeSpeaker] = useState<ArchetypeId>("intern");
  const [loungeTarget, setLoungeTarget] = useState<ArchetypeId | "floor">("floor");
  const [loungePrompt, setLoungePrompt] = useState("");
  const [loungeRunning, setLoungeRunning] = useState(false);
  const timers = useRef<number[]>([]);

  const allArchetypes = useMemo(() => [...archetypes, ...persisted.customArchetypes], [persisted.customArchetypes]);
  const activeSession = persisted.sessions.find((session) => session.id === persisted.activeSessionId);
  const activeSettings = activeSession?.settings ?? persisted.settings;
  const selectedArchetypes = activeSession?.selectedArchetypes ?? persisted.selectedArchetypes;
  const clinicalInputBlocked = Boolean(activeSession?.mode === "clinical" && !activeSession.anonymization?.approvedForLive);
  const runtimeBlocked = view === "floor" && clinicalInputBlocked;
  const liveRuntimeActive = runtime.live && useLiveApi && !runtimeBlocked;
  const currentMotion = activeSession
    ? activeSession.parentSessionId
      ? activeSession.mode === "clinical"
        ? "Review this follow-up clinical update in light of the prior signed record. Surface what changed, what remains unresolved, new safety concerns, and proportionate next actions."
        : "Deliberate on this follow-up update in light of the prior signed record. Surface what changed, what remains unresolved, and the next concrete move."
      : activeSession.mode === "clinical"
        ? "Review the submitted clinical context. Surface assumptions, missing questions, safety concerns, evidence needs, and proportionate next actions."
        : "Deliberate on the submitted problem. Surface assumptions, tensions, options, risks, and next moves."
    : "Create a Session to begin deliberation.";

  const selectedRoster = useMemo(
    () => allArchetypes.filter((agent) => selectedArchetypes.includes(agent.id)),
    [allArchetypes, selectedArchetypes],
  );

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(persisted));
  }, [persisted]);

  useEffect(() => {
    fetch("/api/runtime")
      .then((response) => response.json())
      .then((payload: RuntimeInfo) => setRuntime(payload))
      .catch(() => setRuntime({ live: false, model: "gpt-5.5" }));
  }, []);

  useEffect(() => {
    return () => {
      timers.current.forEach(window.clearTimeout);
    };
  }, []);

  const resetTransient = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setCallState("idle");
    setOutputs({});
    setAgentResults({});
    setSources({});
    setReviews({});
    setPlannerVisible(false);
    setClerkDraft(null);
    setQuorumFlash(false);
    setTurnReviewOpen(false);
    setTurnReviewIndex(0);
    setLoungePrompt("");
    setLoungeRunning(false);
    setFollowUpText("");
  };

  const resetDemo = () => {
    window.localStorage.removeItem(storageKey);
    window.localStorage.removeItem(legacyStorageKey);
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setPersisted(initialPersisted);
    setCallState("idle");
    setOutputs({});
    setAgentResults({});
    setSources({});
    setReviews({});
    setPlannerVisible(false);
    setClerkDraft(null);
    setTurnReviewOpen(false);
    setTurnReviewIndex(0);
    setLoungePrompt("");
    setLoungeRunning(false);
    setFollowUpText("");
    setView("docket");
  };

  const updateActiveSession = (updater: (session: QuorumSession) => QuorumSession) => {
    if (!activeSession) return;

    setPersisted((previous) => ({
      ...previous,
      sessions: previous.sessions.map((session) =>
        session.id === activeSession.id ? updater({ ...session, updatedAt: new Date().toISOString() }) : session,
      ),
    }));
  };

  const hydrateSessionState = (session: QuorumSession) => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setOutputs(session.outputs ?? {});
    setAgentResults(session.results ?? {});
    setReviews(session.reviews ?? {});
    setSources({});
    setPlannerVisible(false);
    setClerkDraft(null);
    setQuorumFlash(false);
    setTurnReviewOpen(false);
    setTurnReviewIndex(0);
    setCallState(Object.keys(session.results ?? {}).length ? "complete" : "idle");
    setLoungeSpeaker(session.selectedArchetypes[0] ?? "intern");
    setLoungeTarget("floor");
    setLoungePrompt("");
    setLoungeRunning(false);
    setFollowUpText("");
  };

  const appendAction = (label: string, detail: string) => {
    const entry: ActionLogEntry = {
      id: createId("act"),
      at: new Date().toISOString(),
      label,
      detail,
    };

    if (activeSession) {
      updateActiveSession((session) => ({
        ...session,
        actionLog: [entry, ...session.actionLog].slice(0, 30),
      }));
      return;
    }

    setPersisted((previous) => ({
      ...previous,
      sessions: previous.sessions,
    }));
  };

  const createSession = (mode: SessionMode, title: string, sourceText: string) => {
    const now = new Date().toISOString();
    const session: QuorumSession = {
      id: createId("session"),
      title: title.trim() || (mode === "clinical" ? "Untitled clinical review" : "Untitled thinking session"),
      mode,
      sourceText: sourceText.trim(),
      selectedArchetypes: defaultSession,
      settings: defaultAgentSettings,
      results: {},
      outputs: {},
      reviews: {},
      lounge: [],
      minutes: [],
      actionLog: [
        {
          id: createId("act"),
          at: now,
          label: "Session created",
          detail: mode === "clinical" ? "Clinical-facing Session opened." : "Thinking Session opened.",
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    setPersisted((previous) => ({
      ...previous,
      activeSessionId: session.id,
      sessions: [session, ...previous.sessions].slice(0, 20),
    }));
    resetTransient();
    setView("floor");
  };

  const createFollowUpSession = () => {
    if (!activeSession) return;

    const update = followUpText.trim();
    if (!update) return;

    const now = new Date().toISOString();
    const followUpCount = persisted.sessions.filter((session) => session.parentSessionId === activeSession.id).length + 1;
    const priorRecords = activeSession.minutes.length
      ? activeSession.minutes.join("\n\n")
      : "No signed Clerk records have been committed yet.";
    const carriedActions = activeSession.actionLog.length
      ? activeSession.actionLog
          .slice(0, 10)
          .map((entry) => `- ${entry.label}: ${entry.detail}`)
          .join("\n")
      : "No action-log entries yet.";

    const session: QuorumSession = {
      id: createId("session"),
      title: `${activeSession.title} follow-up ${followUpCount}`,
      mode: activeSession.mode,
      parentSessionId: activeSession.id,
      followUpNote: update,
      sourceText: [
        `Follow-up to: ${activeSession.title}`,
        "",
        "Previous Session context:",
        activeSession.sourceText,
        "",
        "Signed records carried forward:",
        priorRecords,
        "",
        "Action log carried forward:",
        carriedActions,
        "",
        "Update since last Session:",
        update,
      ].join("\n"),
      selectedArchetypes: [...activeSession.selectedArchetypes],
      settings: { ...activeSession.settings },
      results: {},
      outputs: {},
      reviews: {},
      lounge: [],
      minutes: [],
      actionLog: [
        {
          id: createId("act"),
          at: now,
          label: "Follow-up Session created",
          detail: `Inherited ${activeSession.selectedArchetypes.length} archetypes and prior record from ${activeSession.title}.`,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    setPersisted((previous) => ({
      ...previous,
      activeSessionId: session.id,
      sessions: [session, ...previous.sessions].slice(0, 30),
    }));
    resetTransient();
    setFollowUpText("");
    setView("floor");
  };

  const createIntakeSession = () => {
    const source = intakeText.trim();
    if (!source) return;

    createSession(intakeMode, intakeTitle, source);
    setIntakeTitle("");
    setIntakeText("");
  };

  const runLocalAnonymizer = () => {
    if (!activeSession) return;

    const report = anonymizeClinicalText(activeSession.sourceText);
    updateActiveSession((session) => ({
      ...session,
      anonymization: report,
      actionLog: [
        {
          id: createId("act"),
          at: new Date().toISOString(),
          label: "Local anonymizer run",
          detail: `${report.redactionCount} potential identifiers were replaced before live model use can be enabled.`,
        },
        ...session.actionLog,
      ].slice(0, 30),
    }));
  };

  const setClinicalLiveApproval = (approvedForLive: boolean) => {
    if (!activeSession?.anonymization) return;

    updateActiveSession((session) => ({
      ...session,
      anonymization: session.anonymization
        ? {
            ...session.anonymization,
            approvedForLive,
          }
        : session.anonymization,
      actionLog: [
        {
          id: createId("act"),
          at: new Date().toISOString(),
          label: approvedForLive ? "Anonymized live calls enabled" : "Anonymized live calls paused",
          detail: approvedForLive
            ? "Only the locally anonymized clinical text will be sent to live model calls."
            : "Clinical Session returned to local-only seeded mode.",
        },
        ...session.actionLog,
      ].slice(0, 30),
    }));
  };

  const toggleArchetype = (id: ArchetypeId) => {
    if (activeSession) {
      updateActiveSession((session) => {
        const exists = session.selectedArchetypes.includes(id);
        const next = exists
          ? session.selectedArchetypes.filter((item) => item !== id)
          : [...session.selectedArchetypes, id];

        return {
          ...session,
          selectedArchetypes: next.length ? next : session.selectedArchetypes,
        };
      });
      return;
    }

    setPersisted((previous) => {
      const exists = previous.selectedArchetypes.includes(id);
      const next = exists
        ? previous.selectedArchetypes.filter((item) => item !== id)
        : [...previous.selectedArchetypes, id];

      return {
        ...previous,
        selectedArchetypes: next.length ? next : previous.selectedArchetypes,
      };
    });
  };

  const updateAgentSettings = (id: ArchetypeId, patch: Partial<AgentSettings>) => {
    if (activeSession) {
      updateActiveSession((session) => ({
        ...session,
        settings: {
          ...session.settings,
          [id]: {
            ...(session.settings[id] ?? defaultAgentSettings[id] ?? defaultAgentSettings.intern),
            ...patch,
          },
        },
      }));
      return;
    }

    setPersisted((previous) => ({
      ...previous,
      settings: {
        ...previous.settings,
        [id]: {
          ...(previous.settings[id] ?? defaultAgentSettings[id] ?? defaultAgentSettings.intern),
          ...patch,
        },
      },
    }));
  };

  const updateCustomArchetype = (id: ArchetypeId, patch: Partial<Archetype>) => {
    setPersisted((previous) => ({
      ...previous,
      customArchetypes: previous.customArchetypes.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)),
    }));
  };

  const createCustomArchetype = () => {
    const id = createId("custom");
    const custom: Archetype = {
      id,
      name: "Custom Archetype",
      shortName: "Custom",
      stance: "User-defined stance",
      status: "opt-in",
      tone: "Specific, useful, and bounded by the user's instructions.",
      rules: ["State the custom perspective clearly.", "Expose what this stance uniquely sees.", "Keep output concise."],
      accent: "#5f6f9b",
      custom: true,
    };

    setPersisted((previous) => {
      const settings = {
        provider: "openai" as const,
        model: "server-default",
        reasoning: "medium" as const,
      };

      if (activeSession) {
        return {
          ...previous,
          customArchetypes: [...previous.customArchetypes, custom],
          sessions: previous.sessions.map((session) =>
            session.id === activeSession.id
              ? {
                  ...session,
                  selectedArchetypes: [...session.selectedArchetypes, id],
                  settings: { ...session.settings, [id]: settings },
                  updatedAt: new Date().toISOString(),
                }
              : session,
          ),
        };
      }

      return {
        ...previous,
        customArchetypes: [...previous.customArchetypes, custom],
        selectedArchetypes: [...previous.selectedArchetypes, id],
        settings: { ...previous.settings, [id]: settings },
      };
    });
    setTuningCard(id);
  };

  const caseContext = () => {
    if (!activeSession) return "No active Session.";

    const submittedText = sessionWorkingText(activeSession);
    const parentSession = activeSession.parentSessionId
      ? persisted.sessions.find((session) => session.id === activeSession.parentSessionId)
      : undefined;

    return [
      `Session title: ${activeSession.title}`,
      `Mode: ${activeSession.mode}`,
      parentSession ? `Linked previous Session: ${parentSession.title}` : "",
      activeSession.mode === "clinical" && activeSession.anonymization
        ? "Submitted context after local anonymization:"
        : "Submitted context:",
      submittedText,
      `Committed records: ${activeSession.minutes.join("\n\n") || "None yet."}`,
    ]
      .filter(Boolean)
      .join("\n");
  };

  const typeOutput = (id: ArchetypeId, text: string, startDelay = 0) => {
    const interval = 16;
    const chunk = 8;

    timers.current.push(
      window.setTimeout(() => {
        let position = 0;
        const tick = () => {
          position = Math.min(position + chunk, text.length);
          setOutputs((previous) => ({ ...previous, [id]: text.slice(0, position) }));

          if (position < text.length) {
            timers.current.push(window.setTimeout(tick, interval));
          }
        };
        tick();
      }, startDelay),
    );
  };

  const fallbackFor = (id: ArchetypeId) => {
    if (id === "biblioRat") {
      setSources((previous) => ({ ...previous, biblioRat: fallbackSources }));
    }

    const agent = allArchetypes.find((item) => item.id === id);
    const stance = agent?.stance ?? "a custom stance";
    const source = activeSession ? ` On this submission, I would focus on: ${sessionWorkingText(activeSession).slice(0, 180)}` : "";
    return `${agent?.shortName ?? "This card"} is speaking from ${stance}.${source} The key move is to separate assumptions, uncertainties, and the next concrete decision before the Chair commits anything.`;
  };

  const persistAgentResult = (id: ArchetypeId, result: AgentResult, outputText = result.answer) => {
    if (!activeSession) return;

    updateActiveSession((session) => ({
      ...session,
      results: {
        ...session.results,
        [id]: result,
      },
      outputs: {
        ...session.outputs,
        [id]: outputText,
      },
    }));
  };

  const openTurnReview = () => {
    setTurnReviewIndex(0);
    setTurnReviewOpen(true);
    appendAction("Turn ready for review", `${selectedArchetypes.length} archetype contributions are ready for card-by-card review.`);
  };

  const runAgentApi = async (id: ArchetypeId, chairQuestion?: string) => {
    const agent = allArchetypes.find((item) => item.id === id)!;
    const settings = activeSettings[id] ?? defaultAgentSettings[id] ?? defaultAgentSettings.intern;
    if (settings.provider !== "openai") {
      throw new Error(`${settings.provider} runtime is not wired yet`);
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), id === "biblioRat" ? 45000 : 30000);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          agentId: id,
          agentName: agent.name,
          stance: agent.stance,
          tone: agent.tone,
          rules: agent.rules,
          motion: currentMotion,
          caseContext: caseContext(),
          previousOutput: outputs[id],
          chairQuestion,
          model: settings.model,
          reasoning: settings.reasoning,
          evidenceMode: settings.evidenceMode,
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "OpenAI API call failed");

      const result = parseAgentResult(payload, id);
      if (payload.sources?.length) {
        const sourceList = payload.sources as SourceLink[];
        setSources((previous) => ({ ...previous, [id]: sourceList }));
        result.citations = [...result.citations, ...sourceList].slice(0, 6);
      }

      return result;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const callSession = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setOutputs({});
    setAgentResults({});
    setSources({});
    setReviews({});
    setPlannerVisible(false);
    setClerkDraft(null);
    setCallState("calling");
    setQuorumFlash(true);
    appendAction("Session called", `${selectedArchetypes.length} archetype cards were called to the Floor.`);

    timers.current.push(
      window.setTimeout(() => {
        setQuorumFlash(false);
      }, 2800),
    );

    if (liveRuntimeActive) {
      selectedArchetypes.forEach((id) => {
        setOutputs((previous) => ({ ...previous, [id]: "Calling OpenAI..." }));
      });

      Promise.allSettled(
        selectedArchetypes.map(async (id, index) => {
          let result: AgentResult;
          try {
            result = await runAgentApi(id);
          } catch {
            result = toAgentResult(fallbackFor(id), id);
          }
          setOutputs((previous) => ({ ...previous, [id]: "" }));
          setAgentResults((previous) => ({ ...previous, [id]: result }));
          persistAgentResult(id, result);
          typeOutput(id, result.answer || fallbackFor(id), index * 220);
        }),
      ).then(() => {
        setQuorumFlash(false);
        setCallState("complete");
        openTurnReview();
      });

      return;
    }

    let longest = 0;

    selectedArchetypes.forEach((id, index) => {
      const text = fallbackFor(id);
      const result = toAgentResult(text, id);
      const startDelay = 500 + index * 420;
      const estimated = startDelay + Math.ceil(text.length / 7) * 24;
      longest = Math.max(longest, estimated);
      setAgentResults((previous) => ({ ...previous, [id]: result }));
      persistAgentResult(id, result, text);
      typeOutput(id, text, startDelay);
    });

    timers.current.push(
      window.setTimeout(() => {
        setQuorumFlash(false);
        setCallState("complete");
        openTurnReview();
      }, longest + 450),
    );
  };

  const askAgentFollowUp = async (id: ArchetypeId) => {
    const question = followUps[id]?.trim();
    if (!question) return;

    setOutputs((previous) => ({
      ...previous,
      [id]: `${previous[id] || ""}\n\nChair: ${question}\n\n${allArchetypes.find((item) => item.id === id)?.shortName}: ${
        liveRuntimeActive ? "Calling OpenAI..." : "Reframing from this stance..."
      }`,
    }));

    setFollowUps((previous) => ({ ...previous, [id]: "" }));
    appendAction("Follow-up asked", `${allArchetypes.find((item) => item.id === id)?.shortName ?? id}: ${question}`);

    if (liveRuntimeActive) {
      try {
        const result = await runAgentApi(id, question);
        const nextOutput = `${outputs[id] || ""}\n\nChair: ${question}\n\n${result.answer}`;
        setAgentResults((previous) => ({ ...previous, [id]: result }));
        setOutputs((previous) => ({
          ...previous,
          [id]: `${previous[id]?.replace(/Calling OpenAI\.\.\.$/, "") || ""}${result.answer}`,
        }));
        persistAgentResult(id, result, nextOutput);
      } catch {
        const result = toAgentResult(fallbackFor(id), id);
        const nextOutput = `${outputs[id] || ""}\n\nChair: ${question}\n\n${result.answer}`;
        setAgentResults((previous) => ({ ...previous, [id]: result }));
        setOutputs((previous) => ({
          ...previous,
          [id]: `${previous[id]?.replace(/Calling OpenAI\.\.\.$/, "") || ""}${result.answer}`,
        }));
        persistAgentResult(id, result, nextOutput);
      }
      return;
    }

    const result = toAgentResult(fallbackFor(id), id);
    const nextOutput = `${outputs[id] || ""}\n\nChair: ${question}\n\n${result.answer}`;
    setAgentResults((previous) => ({ ...previous, [id]: result }));
    setOutputs((previous) => ({
      ...previous,
      [id]: `${previous[id]?.replace(/Reframing from this stance\.\.\.$/, "") || ""}${result.answer}`,
    }));
    persistAgentResult(id, result, nextOutput);
  };

  const setReview = (id: ArchetypeId, status: ReviewStatus) => {
    setReviews((previous) => ({ ...previous, [id]: status }));
    const agent = allArchetypes.find((item) => item.id === id);
    if (activeSession) {
      updateActiveSession((session) => ({
        ...session,
        reviews: {
          ...session.reviews,
          [id]: status,
        },
      }));
    }
    appendAction(statusLabel[status], `${agent?.name ?? id} marked as ${statusLabel[status].toLowerCase()}.`);
  };

  const rerollAgent = async (id: ArchetypeId) => {
    const agent = allArchetypes.find((item) => item.id === id);
    appendAction("Contribution rerolled", `${agent?.name ?? id} was asked for another pass.`);
    setOutputs((previous) => ({ ...previous, [id]: liveRuntimeActive ? "Calling OpenAI..." : "Reframing from this stance..." }));

    if (liveRuntimeActive) {
      try {
        const result = await runAgentApi(id, "Give a different pass. Preserve your stance, but do not repeat the same contribution.");
        setAgentResults((previous) => ({ ...previous, [id]: result }));
        setOutputs((previous) => ({ ...previous, [id]: result.answer }));
        persistAgentResult(id, result);
        return;
      } catch {
        // Fall through to local fallback.
      }
    }

    const result = toAgentResult(fallbackFor(id), id);
    setAgentResults((previous) => ({ ...previous, [id]: result }));
    setOutputs((previous) => ({ ...previous, [id]: result.answer }));
    persistAgentResult(id, result);
  };

  const routeLoungeTurn = async () => {
    if (!activeSession || loungeRunning) return;

    const speaker = allArchetypes.find((agent) => agent.id === loungeSpeaker) ?? selectedRoster[0];
    if (!speaker) return;

    const targetId = loungeTarget === "floor" ? undefined : loungeTarget;
    const target = targetId ? allArchetypes.find((agent) => agent.id === targetId) : undefined;
    const targetContribution = targetId
      ? agentResults[targetId]?.answer || outputs[targetId] || "No prior contribution recorded."
      : selectedRoster
          .map((agent) => `${agent.shortName}: ${agentResults[agent.id]?.keyPoints?.join("; ") || outputs[agent.id] || "No contribution yet."}`)
          .join("\n");
    const chairInstruction = [
      target
        ? `Respond to ${target.name}'s contribution below.`
        : "Respond to the whole lounge conversation and identify the live tension.",
      loungePrompt.trim() ? `Chair instruction: ${loungePrompt.trim()}` : "Chair instruction: keep it concise and advance the deliberation.",
      `Contribution to respond to:\n${targetContribution}`,
    ].join("\n\n");

    setLoungeRunning(true);
    appendAction("Lounge turn routed", `${speaker.name} was asked to respond to ${target?.name ?? "the whole Floor"}.`);

    try {
      let result: AgentResult;
      if (liveRuntimeActive) {
        try {
          result = await runAgentApi(speaker.id, chairInstruction);
        } catch {
          result = toAgentResult(
            `${speaker.shortName} responds to ${target?.shortName ?? "the Floor"}: the important move is to name the tension, decide what would change the plan, and keep the Chair from treating agreement as proof.`,
            speaker.id,
          );
        }
      } else {
        result = toAgentResult(
          `${speaker.shortName} responds to ${target?.shortName ?? "the Floor"}: the important move is to name the tension, decide what would change the plan, and keep the Chair from treating agreement as proof.`,
          speaker.id,
        );
      }

      const message: LoungeMessage = {
        id: createId("lounge"),
        at: new Date().toISOString(),
        speakerId: speaker.id,
        targetId,
        text: result.answer,
        keyPoints: result.keyPoints,
      };

      updateActiveSession((session) => ({
        ...session,
        lounge: [message, ...session.lounge].slice(0, 20),
      }));
      setLoungePrompt("");
    } finally {
      setLoungeRunning(false);
    }
  };

  const draftPlanner = async () => {
    setPlannerVisible(true);
    setClerkDraft(null);
    appendAction("Planner Clerk directed", "The Chair asked the Clerk to synthesize the Session.");

    if (liveRuntimeActive) {
      try {
        const response = await fetch("/api/clerk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: activeSession?.mode ?? "clinical",
            motion: currentMotion,
            context: caseContext(),
            contributions: selectedRoster.map((agent) => ({
              agentName: agent.name,
              stance: agent.stance,
              review: reviews[agent.id] ?? "pending",
              result: agentResults[agent.id],
              output: outputs[agent.id],
            })),
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Planner Clerk failed");
        const draft = parseClerkDraft(payload);
        if (draft) {
          setClerkDraft(draft);
          return;
        }
      } catch {
        // Use deterministic fallback below.
      }
    }

    setClerkDraft(fallbackClerkDraft(activeSession?.mode ?? "thinking", selectedRoster, agentResults, reviews));
  };

  const commitMinutes = () => {
    if (!activeSession) return;

    const draft = clerkDraft ?? fallbackClerkDraft(activeSession.mode, selectedRoster, agentResults, reviews);
    const signedRecord = [
      `${activeSession.title} signed record`,
      "",
      "Summary:",
      draft.minutes,
      "",
      "Takeaways:",
      ...draft.takeaways.map((item) => `- ${item}`),
      "",
      "Actions:",
      ...draft.actions.map((item) => `- [${item.priority}] ${item.label}: ${item.detail} (${item.owner})`),
      draft.unresolvedQuestions.length ? "\nUnresolved questions:" : "",
      ...draft.unresolvedQuestions.map((item) => `- ${item}`),
    ]
      .filter(Boolean)
      .join("\n");
    const actionEntries: ActionLogEntry[] = draft.actions.map((item) => ({
      id: createId("act"),
      at: new Date().toISOString(),
      label: item.label,
      detail: `[${item.priority}] ${item.detail} Owner: ${item.owner}.`,
    }));

    updateActiveSession((session) => ({
      ...session,
      minutes: [
        signedRecord,
        ...session.minutes.filter((entry) => !entry.startsWith(`${session.title} signed record`)),
      ],
      actionLog: [
        {
          id: createId("act"),
          at: new Date().toISOString(),
          label: "Record signed",
          detail: `${draft.actions.length} Clerk actions and ${draft.takeaways.length} takeaways were committed to the session record.`,
        },
        ...actionEntries,
        ...session.actionLog,
      ].slice(0, 30),
    }));
    setPersisted((previous) => ({ ...previous, activeSessionId: undefined }));
    setView("docket");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("docket")} type="button">
          <span className="brand-mark">Q</span>
          <span>
            <strong>Quorum</strong>
            <em>Clinical and thinking deliberation workbench</em>
          </span>
        </button>

        <div className="runtime-strip" aria-live="polite">
          <span className="status-dot" />
          <span>{view === "docket" ? "Workspace ready" : callState === "calling" ? "Session on the Floor" : "Chair ready"}</span>
          <span className="runtime-chip">
            {runtimeBlocked
              ? "Clinical input local-only"
              : activeSession?.mode === "clinical" && activeSession.anonymization?.approvedForLive
                ? "Anonymized clinical live-ready"
                : runtime.live
                  ? `OpenAI live: ${runtime.model}`
                  : "Fallback runtime"}
          </span>
          <button
            className={`runtime-toggle ${liveRuntimeActive ? "active" : ""}`}
            disabled={!runtime.live || runtimeBlocked}
            onClick={() => setUseLiveApi((value) => !value)}
            type="button"
          >
            {runtimeBlocked ? "Awaiting anonymizer" : liveRuntimeActive ? "Live calls on" : "Live calls off"}
          </button>
        </div>

        <div className="topbar-actions">
          {view === "floor" && (
            <button className="ghost-button" onClick={() => setView("docket")} type="button">
              <ChevronLeft size={16} />
              Workspace
            </button>
          )}
          <button className="ghost-button" onClick={resetDemo} type="button">
            <RotateCcw size={16} />
            Reset
          </button>
        </div>
      </header>

      {view === "docket" || !activeSession ? (
        <DocketView
          sessions={persisted.sessions}
          intakeMode={intakeMode}
          intakeTitle={intakeTitle}
          intakeText={intakeText}
          onSetIntakeMode={setIntakeMode}
          onSetIntakeTitle={setIntakeTitle}
          onSetIntakeText={setIntakeText}
          onCreateSession={createIntakeSession}
          onOpenSession={(id) => {
            const session = persisted.sessions.find((item) => item.id === id);
            if (session) hydrateSessionState(session);
            setPersisted((previous) => ({ ...previous, activeSessionId: id }));
            setView("floor");
          }}
        />
      ) : (
        <FloorView
          session={activeSession}
          motion={currentMotion}
          allArchetypes={allArchetypes}
          selectedRoster={selectedRoster}
          selectedArchetypes={selectedArchetypes}
          settings={activeSettings}
          tuningCard={tuningCard}
          outputs={outputs}
          agentResults={agentResults}
          sources={sources}
          reviews={reviews}
          turnReviewOpen={turnReviewOpen}
          turnReviewIndex={turnReviewIndex}
          callState={callState}
          quorumFlash={quorumFlash}
          plannerVisible={plannerVisible}
          onToggleArchetype={toggleArchetype}
          onTuneCard={setTuningCard}
          onUpdateSettings={updateAgentSettings}
          onUpdateCustomArchetype={updateCustomArchetype}
          onCreateCustomArchetype={createCustomArchetype}
          onRunAnonymizer={runLocalAnonymizer}
          onSetClinicalLiveApproval={setClinicalLiveApproval}
          onCallSession={callSession}
          onReview={setReview}
          onReroll={rerollAgent}
          loungeSpeaker={loungeSpeaker}
          loungeTarget={loungeTarget}
          loungePrompt={loungePrompt}
          loungeRunning={loungeRunning}
          onSetLoungeSpeaker={setLoungeSpeaker}
          onSetLoungeTarget={setLoungeTarget}
          onSetLoungePrompt={setLoungePrompt}
          onRouteLoungeTurn={routeLoungeTurn}
          followUps={followUps}
          onChangeFollowUp={(id, value) => setFollowUps((previous) => ({ ...previous, [id]: value }))}
          onAskFollowUp={askAgentFollowUp}
          onSetTurnReviewIndex={setTurnReviewIndex}
          onCloseTurnReview={() => setTurnReviewOpen(false)}
          onShowPlanner={draftPlanner}
          onCommit={commitMinutes}
          clerkDraft={clerkDraft}
          followUpText={followUpText}
          onSetFollowUpText={setFollowUpText}
          onCreateFollowUpSession={createFollowUpSession}
        />
      )}

    </main>
  );
}

type DocketProps = {
  sessions: QuorumSession[];
  intakeMode: SessionMode;
  intakeTitle: string;
  intakeText: string;
  onSetIntakeMode: (mode: SessionMode) => void;
  onSetIntakeTitle: (value: string) => void;
  onSetIntakeText: (value: string) => void;
  onCreateSession: () => void;
  onOpenSession: (id: string) => void;
};

function DocketView({
  sessions,
  intakeMode,
  intakeTitle,
  intakeText,
  onSetIntakeMode,
  onSetIntakeTitle,
  onSetIntakeText,
  onCreateSession,
  onOpenSession,
}: DocketProps) {
  const committedMinutes = sessions
    .flatMap((session) =>
      session.minutes.map((entry) => ({
        entry,
        sessionId: session.id,
        sessionTitle: session.title,
      })),
    )
    .slice(0, 4);

  return (
    <section className="docket-layout">
      <div className="workbench-panel">
        <div className="workbench-copy">
          <span className="section-label">Quorum workbench</span>
          <h1>Start a chaired model Session.</h1>
          <p>
            Paste a clinical case or general problem, choose archetype cards, call the Session,
            route follow-up in the Lounge, and commit the Clerk record.
          </p>
        </div>
        <div className="workflow-steps" aria-label="Quorum workflow">
          <div className="workflow-step">
            <span className="workflow-step-icon">
              <FileText size={18} />
            </span>
            <strong>Add context</strong>
            <small>Bring the case, decision, draft, or messy question.</small>
          </div>
          <div className="workflow-step">
            <span className="workflow-step-icon">
              <Layers3 size={18} />
            </span>
            <strong>Draw cards</strong>
            <small>Select and tune the archetypes for the Session.</small>
          </div>
          <div className="workflow-step">
            <span className="workflow-step-icon">
              <MessageSquareText size={18} />
            </span>
            <strong>Run the floor</strong>
            <small>Compare answers, ask follow-ups, and route Lounge turns.</small>
          </div>
          <div className="workflow-step">
            <span className="workflow-step-icon">
              <ClipboardList size={18} />
            </span>
            <strong>Commit record</strong>
            <small>Accept, reject, reroll, then sign the Clerk actions.</small>
          </div>
        </div>
      </div>

      <div className="workspace-grid">
        <section className="intake-panel">
          <div className="panel-heading">
            <span className="section-label">New Session</span>
            <strong>Bring your own problem</strong>
          </div>
          <div className="mode-toggle" role="group" aria-label="Session mode">
            <button className={intakeMode === "clinical" ? "active" : ""} onClick={() => onSetIntakeMode("clinical")} type="button">
              <Stethoscope size={16} />
              Clinical
            </button>
            <button className={intakeMode === "thinking" ? "active" : ""} onClick={() => onSetIntakeMode("thinking")} type="button">
              <BookOpenText size={16} />
              Thinking
            </button>
          </div>
          <div className="intake-grid">
            <label>
              Title
              <input
                onChange={(event) => onSetIntakeTitle(event.target.value)}
                placeholder={intakeMode === "clinical" ? "Complex case review" : "Strategic decision or research question"}
                value={intakeTitle}
              />
            </label>
            <label className="intake-textarea">
              Context
              <textarea
                onChange={(event) => onSetIntakeText(event.target.value)}
                placeholder={intakeMode === "clinical" ? "Paste clinical history, results, medications, and the question for the Chair..." : thinkingStarterText}
                value={intakeText}
              />
            </label>
          </div>
          {intakeMode === "clinical" && (
            <div className="privacy-note">
              <ShieldAlert size={16} />
              Clinical live calls stay blocked until the local anonymizer has approved the text.
            </div>
          )}
          <div className="thesis-actions">
            <button className="primary-button" disabled={!intakeText.trim()} onClick={onCreateSession} type="button">
              <Layers3 size={17} />
              Create Session
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                onSetIntakeMode("clinical");
                onSetIntakeTitle("Mrs M eosinophilia review");
                onSetIntakeText(mrsMTemplateText);
              }}
              type="button"
            >
              <Activity size={17} />
              Load eosinophilia seed
            </button>
          </div>
        </section>

        <section className="sessions-panel">
          <div className="panel-heading">
            <span className="section-label">Workspace</span>
            <strong>Sessions and signed records</strong>
          </div>

          <div className="session-list">
            <span className="mini-label">Recent Sessions</span>
            {sessions.length > 0 ? (
              sessions.slice(0, 5).map((session) => {
                const parentSession = session.parentSessionId
                  ? sessions.find((item) => item.id === session.parentSessionId)
                  : undefined;

                return (
                  <button key={session.id} onClick={() => onOpenSession(session.id)} type="button">
                    <strong>{session.title}</strong>
                    <span>
                      {session.mode === "clinical" ? "Clinical" : "Thinking"} - {session.selectedArchetypes.length} cards -{" "}
                      {session.minutes.length} records
                    </span>
                    {parentSession && <em>Follow-up to {parentSession.title}</em>}
                  </button>
                );
              })
            ) : (
              <div className="empty-minutes compact">
                <Archive size={22} />
                <span>No Sessions yet.</span>
              </div>
            )}
          </div>

          <div className="session-minutes">
            <span className="mini-label">Signed Clerk Records</span>
            {committedMinutes.length > 0 ? (
              committedMinutes.map(({ entry, sessionId, sessionTitle }) => (
                <pre key={`${sessionId}-${entry}`} className="minutes-entry">
                  {sessionTitle}
                  {"\n"}
                  {entry}
                </pre>
              ))
            ) : (
              <div className="empty-minutes compact">
                <ClipboardList size={22} />
                <span>No Clerk records committed yet.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

type FloorProps = {
  session: QuorumSession;
  motion: string;
  allArchetypes: Archetype[];
  selectedRoster: Archetype[];
  selectedArchetypes: ArchetypeId[];
  settings: Record<ArchetypeId, AgentSettings>;
  tuningCard: ArchetypeId | null;
  outputs: Partial<Record<ArchetypeId, string>>;
  agentResults: Partial<Record<ArchetypeId, AgentResult>>;
  sources: Partial<Record<ArchetypeId, SourceLink[]>>;
  reviews: Partial<Record<ArchetypeId, ReviewStatus>>;
  turnReviewOpen: boolean;
  turnReviewIndex: number;
  callState: CallState;
  quorumFlash: boolean;
  plannerVisible: boolean;
  onToggleArchetype: (id: ArchetypeId) => void;
  onTuneCard: (id: ArchetypeId | null) => void;
  onUpdateSettings: (id: ArchetypeId, patch: Partial<AgentSettings>) => void;
  onUpdateCustomArchetype: (id: ArchetypeId, patch: Partial<Archetype>) => void;
  onCreateCustomArchetype: () => void;
  onRunAnonymizer: () => void;
  onSetClinicalLiveApproval: (approvedForLive: boolean) => void;
  onCallSession: () => void;
  onReview: (id: ArchetypeId, status: ReviewStatus) => void;
  onReroll: (id: ArchetypeId) => void;
  loungeSpeaker: ArchetypeId;
  loungeTarget: ArchetypeId | "floor";
  loungePrompt: string;
  loungeRunning: boolean;
  onSetLoungeSpeaker: (id: ArchetypeId) => void;
  onSetLoungeTarget: (id: ArchetypeId | "floor") => void;
  onSetLoungePrompt: (value: string) => void;
  onRouteLoungeTurn: () => void;
  followUps: Partial<Record<ArchetypeId, string>>;
  onChangeFollowUp: (id: ArchetypeId, value: string) => void;
  onAskFollowUp: (id: ArchetypeId) => void;
  onSetTurnReviewIndex: (index: number) => void;
  onCloseTurnReview: () => void;
  onShowPlanner: () => void;
  onCommit: () => void;
  clerkDraft: ClerkDraft | null;
  followUpText: string;
  onSetFollowUpText: (value: string) => void;
  onCreateFollowUpSession: () => void;
};

function FloorView({
  session,
  motion,
  allArchetypes,
  selectedRoster,
  selectedArchetypes,
  settings,
  tuningCard,
  outputs,
  agentResults,
  sources,
  reviews,
  turnReviewOpen,
  turnReviewIndex,
  callState,
  quorumFlash,
  plannerVisible,
  onToggleArchetype,
  onTuneCard,
  onUpdateSettings,
  onUpdateCustomArchetype,
  onCreateCustomArchetype,
  onRunAnonymizer,
  onSetClinicalLiveApproval,
  onCallSession,
  onReview,
  onReroll,
  loungeSpeaker,
  loungeTarget,
  loungePrompt,
  loungeRunning,
  onSetLoungeSpeaker,
  onSetLoungeTarget,
  onSetLoungePrompt,
  onRouteLoungeTurn,
  followUps,
  onChangeFollowUp,
  onAskFollowUp,
  onSetTurnReviewIndex,
  onCloseTurnReview,
  onShowPlanner,
  onCommit,
  clerkDraft,
  followUpText,
  onSetFollowUpText,
  onCreateFollowUpSession,
}: FloorProps) {
  const parentLabel = session.parentSessionId ? "Follow-up Session" : "Primary Session";
  const visibleClerkDraft = clerkDraft ?? fallbackClerkDraft(session.mode, selectedRoster, agentResults, reviews);

  return (
    <section className="floor-layout">
      {(quorumFlash || callState === "calling") && (
        <div className={`quorum-flash ${quorumFlash ? "intro" : "waiting"}`} role="status" aria-live="polite">
          <span>
            <strong>{quorumFlash ? "We have Quorum." : "Asking the archetypes"}</strong>
            {quorumFlash ? (
              <small>The Session is being called.</small>
            ) : (
              <>
                <i aria-hidden="true" className="quorum-spinner" />
                <small>Waiting for every selected card to answer.</small>
              </>
            )}
          </span>
        </div>
      )}

      {turnReviewOpen && callState === "complete" && (
        <TurnReviewOverlay
          agentResults={agentResults}
          followUps={followUps}
          index={turnReviewIndex}
          onAskFollowUp={onAskFollowUp}
          onChangeFollowUp={onChangeFollowUp}
          onClose={onCloseTurnReview}
          onIndexChange={onSetTurnReviewIndex}
          onReroll={onReroll}
          onReview={onReview}
          outputs={outputs}
          reviews={reviews}
          roster={selectedRoster}
          sources={sources}
        />
      )}

      <aside className="docket-card">
        <div className="panel-heading">
          <span className="section-label">Session</span>
          <strong>{session.title}</strong>
        </div>

        <div className="session-context-card">
          <div className="session-badges">
            <span className={`mode-badge ${session.mode}`}>{session.mode === "clinical" ? "Clinical" : "Thinking"}</span>
            <span className="mode-badge linked">{parentLabel}</span>
          </div>
          <p>{session.sourceText}</p>
          {session.mode === "clinical" && (
            <AnonymizationPanel
              anonymization={session.anonymization}
              onApprove={() => onSetClinicalLiveApproval(true)}
              onPause={() => onSetClinicalLiveApproval(false)}
              onRun={onRunAnonymizer}
            />
          )}
          <div className="follow-up-card">
            <div>
              <span className="mini-label">Follow-up Session</span>
              <strong>Use the same Quorum again</strong>
            </div>
            <textarea
              onChange={(event) => onSetFollowUpText(event.target.value)}
              placeholder={
                session.mode === "clinical"
                  ? "Add interval history, new results, treatment response, adverse effects, patient concerns, or what changed since this review..."
                  : "Add what happened since this Session, new constraints, decisions made, results, objections, or the next version of the problem..."
              }
              value={followUpText}
            />
            <button className="secondary-button" disabled={!followUpText.trim()} onClick={onCreateFollowUpSession} type="button">
              <RefreshCcw size={16} />
              Start follow-up
            </button>
          </div>
        </div>
      </aside>

      <section className="floor-main">
        <div className="motion-panel">
          <div>
            <span className="section-label">The Motion</span>
            <h1>Call the Session</h1>
            <p>{motion}</p>
          </div>
          <button className="primary-button" disabled={callState === "calling"} onClick={onCallSession} type="button">
            <MessageSquareText size={18} />
            {callState === "calling" ? "Calling..." : "Call Session"}
          </button>
        </div>

        <section className="session-composer">
          <div className="panel-heading compact">
            <span className="section-label">Deck</span>
            <strong>Draw archetype cards</strong>
          </div>
          <div className="deck-toolbar">
            <button className="ghost-button tutorial-button" type="button" title="Guided mode placeholder">
              <Sparkles size={15} />
              Tutorial mode
            </button>
            <button className="ghost-button tutorial-button" onClick={onCreateCustomArchetype} type="button">
              <WandSparkles size={15} />
              Blank card
            </button>
          </div>
          <div className="archetype-strip card-deck">
            {allArchetypes.map((agent) => (
              <article
                aria-label={`${agent.name}: ${agent.stance}`}
                className={`archetype-token archetype-card ${selectedArchetypes.includes(agent.id) ? "active" : ""} ${
                  tuningCard === agent.id ? "tuning" : ""
                } ${agent.id === "oldGeezer" ? "negative-card" : ""}`}
                key={agent.id}
                style={{ "--agent-accent": agent.accent } as CSSProperties}
              >
                <button
                  className="card-face card-front"
                  onClick={() => onToggleArchetype(agent.id)}
                  type="button"
                >
                  <img alt="" className="card-art" draggable={false} src={archetypeArtImages[agent.id] ?? customCardImage} />
                  <span className="card-selected-mark">{selectedArchetypes.includes(agent.id) ? <Check size={15} /> : null}</span>
                  <span className="card-nameplate">
                    <span className="card-title">{agent.shortName}</span>
                    <small>{agent.stance}</small>
                  </span>
                </button>
                <button
                  aria-label={`Configure ${agent.name}`}
                  className="card-tune"
                  onClick={() => onTuneCard(tuningCard === agent.id ? null : agent.id)}
                  type="button"
                >
                  <Settings2 size={13} />
                  Configure
                </button>
                {tuningCard === agent.id && (
                  <div className="card-reverse">
                    <CardSettings
                      agent={agent}
                      settings={settings[agent.id] ?? defaultAgentSettings[agent.id] ?? defaultAgentSettings.intern}
                      onUpdate={onUpdateSettings}
                      onUpdateAgent={onUpdateCustomArchetype}
                    />
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        {callState !== "idle" && (
          <section className="floor-grid" aria-label="The Floor">
            {selectedRoster.map((agent) => (
              <AgentCard
                agent={agent}
                key={agent.id}
                output={outputs[agent.id] ?? ""}
                result={agentResults[agent.id]}
                sources={sources[agent.id] ?? []}
                review={reviews[agent.id] ?? "pending"}
                callState={callState}
                onReview={onReview}
                onReroll={onReroll}
                followUpValue={followUps[agent.id] ?? ""}
                onChangeFollowUp={onChangeFollowUp}
                onAskFollowUp={onAskFollowUp}
              />
            ))}
          </section>
        )}

        {session && callState === "complete" && (
          <section className="lounge-zone">
            <div className="panel-heading">
              <span className="section-label">Lounge</span>
              <strong>Route archetypes between each other</strong>
            </div>
            <div className="lounge-controls">
              <label>
                Speaker
                <select value={loungeSpeaker} onChange={(event) => onSetLoungeSpeaker(event.target.value)}>
                  {selectedRoster.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.shortName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Responding to
                <select
                  value={loungeTarget}
                  onChange={(event) => onSetLoungeTarget(event.target.value as ArchetypeId | "floor")}
                >
                  <option value="floor">Whole Floor</option>
                  {selectedRoster
                    .filter((agent) => agent.id !== loungeSpeaker)
                    .map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.shortName}
                      </option>
                    ))}
                </select>
              </label>
              <label className="lounge-prompt">
                Chair instruction
                <textarea
                  onChange={(event) => onSetLoungePrompt(event.target.value)}
                  placeholder="Ask for disagreement, convergence, missing evidence, patient burden, or a concrete next move..."
                  value={loungePrompt}
                />
              </label>
              <button className="primary-button" disabled={loungeRunning} onClick={onRouteLoungeTurn} type="button">
                <MessageSquareText size={17} />
                {loungeRunning ? "Routing..." : "Route turn"}
              </button>
            </div>
            {session.lounge.length ? (
              <div className="lounge-thread">
                {session.lounge.map((message) => {
                  const speaker = allArchetypes.find((agent) => agent.id === message.speakerId);
                  const target = message.targetId ? allArchetypes.find((agent) => agent.id === message.targetId) : undefined;
                  return (
                    <article className="lounge-message" key={message.id} style={{ "--agent-accent": speaker?.accent ?? "#5f6f9b" } as CSSProperties}>
                      <header>
                        <strong>{speaker?.shortName ?? "Archetype"}</strong>
                        <span>to {target?.shortName ?? "the Floor"}</span>
                      </header>
                      {message.keyPoints.length ? (
                        <ul>
                          {message.keyPoints.slice(0, 3).map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      ) : null}
                      <p>{message.text}</p>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-lounge">No routed turns yet.</div>
            )}
          </section>
        )}

        <section className="clerk-zone">
          <div className="panel-heading">
            <span className="section-label">The Clerks</span>
            <strong>Planner produces; Chair signs off</strong>
          </div>

          {!plannerVisible ? (
            <button className="secondary-button" disabled={callState !== "complete"} onClick={onShowPlanner} type="button">
              <ClipboardList size={17} />
              Direct Planner to draft
            </button>
          ) : (
            <div className="planner-draft">
              <div className="clerk-record">
                <span className="mini-label">Draft record</span>
                <p>{visibleClerkDraft.minutes}</p>
              </div>

              <div className="clerk-draft-grid">
                <div className="clerk-draft-block">
                  <span className="mini-label">Key takeaways</span>
                  <ul>
                    {visibleClerkDraft.takeaways.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="clerk-draft-block">
                  <span className="mini-label">Proposed action log</span>
                  <ul>
                    {visibleClerkDraft.actions.map((item) => (
                      <li key={`${item.label}-${item.detail}`}>
                        <strong>{item.label}</strong>
                        <span>
                          {item.detail} <em>{item.priority} - {item.owner}</em>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {visibleClerkDraft.unresolvedQuestions.length > 0 && (
                <div className="clerk-draft-block unresolved">
                  <span className="mini-label">Unresolved questions</span>
                  <ul>
                    {visibleClerkDraft.unresolvedQuestions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="draft-actions">
                <button className="primary-button" onClick={onCommit} type="button">
                  <FileText size={17} />
                  Sign Record
                </button>
              </div>
            </div>
          )}
        </section>
        {session?.actionLog.length ? (
          <section className="action-log">
            <div className="panel-heading compact">
              <span className="section-label">Action Log</span>
              <strong>{session.actionLog.length} events</strong>
            </div>
            {session.actionLog.slice(0, 8).map((entry) => (
              <div className="action-entry" key={entry.id}>
                <strong>{entry.label}</strong>
                <span>{entry.detail}</span>
              </div>
            ))}
          </section>
        ) : null}
      </section>
    </section>
  );
}

type AgentCardProps = {
  agent: Archetype;
  output: string;
  result?: AgentResult;
  sources: SourceLink[];
  review: ReviewStatus;
  callState: CallState;
  onReview: (id: ArchetypeId, status: ReviewStatus) => void;
  onReroll: (id: ArchetypeId) => void;
  followUpValue: string;
  onChangeFollowUp: (id: ArchetypeId, value: string) => void;
  onAskFollowUp: (id: ArchetypeId) => void;
  compact?: boolean;
};

type TurnReviewOverlayProps = {
  roster: Archetype[];
  index: number;
  outputs: Partial<Record<ArchetypeId, string>>;
  agentResults: Partial<Record<ArchetypeId, AgentResult>>;
  sources: Partial<Record<ArchetypeId, SourceLink[]>>;
  reviews: Partial<Record<ArchetypeId, ReviewStatus>>;
  followUps: Partial<Record<ArchetypeId, string>>;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onReview: (id: ArchetypeId, status: ReviewStatus) => void;
  onReroll: (id: ArchetypeId) => void;
  onChangeFollowUp: (id: ArchetypeId, value: string) => void;
  onAskFollowUp: (id: ArchetypeId) => void;
};

function TurnReviewOverlay({
  roster,
  index,
  outputs,
  agentResults,
  sources,
  reviews,
  followUps,
  onIndexChange,
  onClose,
  onReview,
  onReroll,
  onChangeFollowUp,
  onAskFollowUp,
}: TurnReviewOverlayProps) {
  const [expanded, setExpanded] = useState(false);
  const safeIndex = Math.min(index, Math.max(roster.length - 1, 0));
  const agent = roster[safeIndex];
  const result = agent ? agentResults[agent.id] : undefined;
  const output = agent ? outputs[agent.id] ?? result?.answer ?? "" : "";
  const sourceList = agent ? mergeSourceLinks(sources[agent.id], result?.citations) : [];
  const review = agent ? reviews[agent.id] ?? "pending" : "pending";
  const isFirst = safeIndex === 0;
  const isLast = safeIndex >= roster.length - 1;
  const points = result?.keyPoints?.length
    ? result.keyPoints.slice(0, 4)
    : output
      ? [output.slice(0, 260)]
      : ["No contribution captured for this card yet."];

  useEffect(() => {
    setExpanded(false);
  }, [agent?.id]);

  if (!agent) return null;

  const advance = () => {
    if (isLast) {
      onClose();
      return;
    }

    onIndexChange(safeIndex + 1);
  };

  const markAndAdvance = (status: ReviewStatus) => {
    onReview(agent.id, status);
    advance();
  };

  return (
    <div className="turn-review-scrim" role="dialog" aria-modal="true" aria-label="Review archetype contribution">
      <section className="turn-review-window" style={{ "--agent-accent": agent.accent } as CSSProperties}>
        <header className="turn-review-header">
          <div>
            <span className="section-label">Turn review</span>
            <strong>
              Card {safeIndex + 1} of {roster.length}
            </strong>
          </div>
          <button className="review-close" onClick={onClose} type="button" aria-label="Close turn review">
            <X size={17} />
          </button>
        </header>

        <div className="turn-review-body">
          <aside className="turn-review-card" aria-label={agent.name}>
            <img alt="" className="review-card-art" draggable={false} src={archetypeArtImages[agent.id] ?? customCardImage} />
            <span className="review-card-nameplate">
              <strong>{agent.shortName}</strong>
              <small>{agent.stance}</small>
            </span>
          </aside>

          <section className="turn-review-copy">
            <div className="turn-review-title">
              <span className={`review-status ${review}`}>{statusLabel[review]}</span>
              <h2>{agent.name}</h2>
              <p>{agent.tone}</p>
            </div>

            <div className="turn-review-summary">
              <span className="mini-label">Main messages</span>
              <ul>
                {points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>

            {result && (result.uncertainty.length > 0 || result.missingQuestions.length > 0) && (
              <div className="turn-review-structured">
                {result.uncertainty.length > 0 && (
                  <div>
                    <span className="mini-label">Uncertainty</span>
                    <ul>
                      {result.uncertainty.slice(0, 3).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.missingQuestions.length > 0 && (
                  <div>
                    <span className="mini-label">Missing questions</span>
                    <ul>
                      {result.missingQuestions.slice(0, 3).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {expanded && (
              <div className="turn-review-expanded">
                <span className="mini-label">Full contribution</span>
                <p>{output || "No full contribution recorded."}</p>
                {sourceList.length > 0 && (
                  <div className="source-list">
                    {sourceList.map((source) => (
                      <a href={source.url} key={source.url} rel="noreferrer" target="_blank">
                        <ExternalLink size={12} />
                        {source.title}
                      </a>
                    ))}
                  </div>
                )}
                <div className="agent-followup review-followup">
                  <input
                    aria-label={`Ask ${agent.shortName} a follow-up`}
                    onChange={(event) => onChangeFollowUp(agent.id, event.target.value)}
                    placeholder={`Ask ${agent.shortName} to refine...`}
                    value={followUps[agent.id] ?? ""}
                  />
                  <button onClick={() => onAskFollowUp(agent.id)} type="button">
                    <Send size={14} />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="turn-review-actions">
          <button className="ghost-button" disabled={isFirst} onClick={() => onIndexChange(safeIndex - 1)} type="button">
            <ChevronLeft size={16} />
            Previous
          </button>
          <button className="secondary-button" onClick={() => setExpanded((value) => !value)} type="button">
            <MessageSquareText size={16} />
            {expanded ? "Collapse" : "Expand"}
          </button>
          <button className="secondary-button" onClick={() => onReroll(agent.id)} type="button">
            <RotateCcw size={16} />
            Reroll
          </button>
          <span className="turn-review-spacer" />
          <button className="secondary-button" onClick={() => markAndAdvance("rejected")} type="button">
            <X size={16} />
            Reject
          </button>
          <button className="secondary-button" onClick={() => markAndAdvance("revision")} type="button">
            <RefreshCcw size={16} />
            Revise
          </button>
          <button className="primary-button" onClick={() => markAndAdvance("accepted")} type="button">
            <Check size={16} />
            {isLast ? "Accept and finish" : "Accept and next"}
          </button>
          <button className="ghost-button" onClick={advance} type="button">
            {isLast ? "Finish" : "Next"}
            {!isLast && <ChevronRight size={16} />}
          </button>
        </footer>
      </section>
    </div>
  );
}

function AnonymizationPanel({
  anonymization,
  onApprove,
  onPause,
  onRun,
}: {
  anonymization?: AnonymizationState;
  onApprove: () => void;
  onPause: () => void;
  onRun: () => void;
}) {
  if (!anonymization) {
    return (
      <div className="anonymizer-card">
        <div className="privacy-note compact">
          <ShieldAlert size={15} />
          Clinical free text is local-only until reviewed.
        </div>
        <button className="secondary-button" onClick={onRun} type="button">
          <ShieldAlert size={16} />
          Run local anonymizer
        </button>
      </div>
    );
  }

  return (
    <div className="anonymizer-card">
      <div className={`anonymizer-status ${anonymization.approvedForLive ? "approved" : ""}`}>
        <strong>{anonymization.approvedForLive ? "Anonymized live calls enabled" : "Anonymized text ready for review"}</strong>
        <span>{anonymization.redactionCount} replacements</span>
      </div>
      <ul className="anonymizer-findings">
        {anonymization.findings.map((finding) => (
          <li key={finding}>{finding}</li>
        ))}
      </ul>
      <pre className="anonymizer-preview">{anonymization.anonymizedText}</pre>
      {anonymization.approvedForLive ? (
        <button className="secondary-button" onClick={onPause} type="button">
          Pause live clinical calls
        </button>
      ) : (
        <button className="primary-button" onClick={onApprove} type="button">
          Use anonymized text for live calls
        </button>
      )}
    </div>
  );
}

function CardSettings({
  agent,
  settings,
  onUpdate,
  onUpdateAgent,
}: {
  agent: Archetype;
  settings: AgentSettings;
  onUpdate: (id: ArchetypeId, patch: Partial<AgentSettings>) => void;
  onUpdateAgent: (id: ArchetypeId, patch: Partial<Archetype>) => void;
}) {
  const customRules = agent.rules.join("\n");
  const providerModels: Record<AgentSettings["provider"], string[]> = {
    openai: ["server-default", "gpt-5.5", "gpt-5.5-pro", "gpt-5", "gpt-4.1"],
    anthropic: ["future-anthropic-default", "claude-opus-4.1", "claude-sonnet-4.5"],
    local: ["future-local-default", "ollama", "lm-studio"],
  };

  return (
    <div className="card-back">
      <div className="card-back-header">
        <strong>{agent.shortName}</strong>
        <span>Configure</span>
      </div>
      {agent.custom && (
        <div className="custom-card-fields">
          <label>
            Name
            <input
              onChange={(event) =>
                onUpdateAgent(agent.id, {
                  name: event.target.value || "Custom Archetype",
                  shortName: event.target.value.slice(0, 18) || "Custom",
                })
              }
              value={agent.name}
            />
          </label>
          <label>
            Stance
            <input
              onChange={(event) => onUpdateAgent(agent.id, { stance: event.target.value })}
              value={agent.stance}
            />
          </label>
          <label>
            Prompt instructions
            <textarea
              onChange={(event) =>
                onUpdateAgent(agent.id, {
                  rules: event.target.value
                    .split("\n")
                    .map((rule) => rule.trim())
                    .filter(Boolean),
                })
              }
              value={customRules}
            />
          </label>
        </div>
      )}
      <label>
        Provider
        <select
          value={settings.provider}
          onChange={(event) =>
            onUpdate(agent.id, {
              provider: event.target.value as AgentSettings["provider"],
              model: providerModels[event.target.value as AgentSettings["provider"]][0],
            })
          }
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic (future)</option>
          <option value="local">Local model (future)</option>
        </select>
      </label>
      <label>
        Model
        <select value={settings.model} onChange={(event) => onUpdate(agent.id, { model: event.target.value })}>
          {providerModels[settings.provider].map((model) => (
            <option key={model} value={model}>
              {model === "server-default" ? "Server default" : model}
            </option>
          ))}
        </select>
      </label>
      <label>
        Reasoning
        <select
          value={settings.reasoning}
          onChange={(event) => onUpdate(agent.id, { reasoning: event.target.value as AgentSettings["reasoning"] })}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      {agent.id === "biblioRat" && (
        <label className="checkbox-setting">
          <input
            checked={Boolean(settings.evidenceMode)}
            onChange={(event) => onUpdate(agent.id, { evidenceMode: event.target.checked })}
            type="checkbox"
          />
          Evidence web search
        </label>
      )}
      {settings.provider !== "openai" && <p className="provider-note">Stored as a card preference; runtime adapter pending.</p>}
    </div>
  );
}

function AgentCard({
  agent,
  output,
  result,
  sources,
  review,
  callState,
  onReview,
  onReroll,
  followUpValue,
  onChangeFollowUp,
  onAskFollowUp,
  compact = false,
}: AgentCardProps) {
  const waiting = callState === "calling" && !output;
  const sourceList = mergeSourceLinks(sources, result?.citations);

  return (
    <article
      className={`agent-card ${compact ? "compact-agent" : ""} ${agent.id === "oldGeezer" ? "negative-agent" : ""}`}
      style={{ "--agent-accent": agent.accent } as CSSProperties}
    >
      <header className="agent-header">
        <span className="agent-icon">{iconForArchetype(agent.id)}</span>
        <span>
          <strong>{agent.name}</strong>
          <small>{agent.stance}</small>
        </span>
      </header>

      <div className="agent-output">
        {agent.id === "oldGeezer" && <span className="negative-ribbon">Watch yourself agreeing with this</span>}
        {result?.keyPoints?.length ? (
          <div className="agent-summary">
            <span className="mini-label">Main points</span>
            <ul className="summary-list">
              {result.keyPoints.slice(0, 4).map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            {result.uncertainty.length > 0 && (
              <>
                <span className="mini-label">Uncertainty</span>
                <ul className="summary-list muted">
                  {result.uncertainty.slice(0, 2).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            )}
            {result.missingQuestions.length > 0 && (
              <>
                <span className="mini-label">Missing questions</span>
                <ul className="summary-list muted">
                  {result.missingQuestions.slice(0, 2).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}
        {waiting ? (
          <span className="typing-placeholder">Waiting for the Floor...</span>
        ) : output ? (
          <>
            <p>{output}</p>
            {sourceList.length > 0 && (
              <div className="source-list">
                {sourceList.map((source) => (
                  <a href={source.url} key={source.url} rel="noreferrer" target="_blank">
                    <ExternalLink size={12} />
                    {source.title}
                  </a>
                ))}
              </div>
            )}
          </>
        ) : (
          <span className="typing-placeholder">Call the Session to hear this voice.</span>
        )}
      </div>

      <div className="agent-followup">
        <input
          aria-label={`Ask ${agent.shortName} a follow-up`}
          onChange={(event) => onChangeFollowUp(agent.id, event.target.value)}
          placeholder={`Ask ${agent.shortName} to refine...`}
          value={followUpValue}
        />
        <button onClick={() => onAskFollowUp(agent.id)} type="button">
          <Send size={14} />
        </button>
      </div>

      <footer className="review-row">
        <span className={`review-status ${review}`}>{statusLabel[review]}</span>
        <div className="review-actions">
          <button aria-label={`Reroll ${agent.name}`} onClick={() => onReroll(agent.id)} type="button">
            <RotateCcw size={14} />
          </button>
          <button aria-label={`Accept ${agent.name}`} onClick={() => onReview(agent.id, "accepted")} type="button">
            <Check size={14} />
          </button>
          <button aria-label={`Request revision from ${agent.name}`} onClick={() => onReview(agent.id, "revision")} type="button">
            <RefreshCcw size={14} />
          </button>
          <button aria-label={`Reject ${agent.name}`} onClick={() => onReview(agent.id, "rejected")} type="button">
            <X size={14} />
          </button>
        </div>
      </footer>
    </article>
  );
}

export default App;
