import {
  Activity,
  Archive,
  BookOpenText,
  Check,
  ChevronLeft,
  ClipboardList,
  Clock3,
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
  type VisitId,
  archetypes,
  defaultAgentSettings,
  defaultSession,
  fallbackSources,
  matters,
  motions,
  plannerDrafts,
  sessionScripts,
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
  suggestedActions: string[];
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
  template?: "mrs-m";
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
  visit: VisitId;
  selectedArchetypes: ArchetypeId[];
  settings: Record<ArchetypeId, AgentSettings>;
  committed: Record<VisitId, boolean>;
  minutes: string[];
  sessions: QuorumSession[];
  activeSessionId?: string;
  customArchetypes: Archetype[];
};

const storageKey = "quorum-demo-state-v033";

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
  visit: "visit1",
  selectedArchetypes: defaultSession,
  settings: defaultAgentSettings,
  committed: {
    visit1: false,
    visit2: false,
  },
  minutes: [],
  sessions: [],
  customArchetypes: [],
};

const loadPersisted = (): PersistedState => {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return initialPersisted;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      ...initialPersisted,
      ...parsed,
      settings: {
        ...defaultAgentSettings,
        ...(parsed.settings ?? {}),
      },
      sessions: (parsed.sessions ?? []).map((session) => ({
        ...session,
        settings: {
          ...defaultAgentSettings,
          ...(session.settings ?? {}),
        },
        selectedArchetypes: session.selectedArchetypes ?? defaultSession,
        results: session.results ?? {},
        outputs: session.outputs ?? {},
        reviews: session.reviews ?? {},
        lounge: session.lounge ?? [],
        minutes: session.minutes ?? [],
        actionLog: session.actionLog ?? [],
      })),
      customArchetypes: parsed.customArchetypes ?? [],
    } as PersistedState;
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

  return {
    answer: text,
    keyPoints: keyPoints.length ? keyPoints : [`${id} has a contribution ready for review.`],
    questions: sentences.filter((item) => item.includes("?")).slice(0, 2),
    suggestedActions: [],
  };
};

const parseAgentResult = (payload: any, id: ArchetypeId): AgentResult => {
  if (payload?.result?.answer) {
    return {
      answer: String(payload.result.answer),
      keyPoints: Array.isArray(payload.result.keyPoints) ? payload.result.keyPoints.slice(0, 4).map(String) : [],
      questions: Array.isArray(payload.result.questions) ? payload.result.questions.slice(0, 3).map(String) : [],
      suggestedActions: Array.isArray(payload.result.suggestedActions)
        ? payload.result.suggestedActions.slice(0, 4).map(String)
        : [],
    };
  }

  return toAgentResult(String(payload?.text || ""), id);
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
  const [outputs, setOutputs] = useState<Partial<Record<ArchetypeId, string>>>({});
  const [agentResults, setAgentResults] = useState<Partial<Record<ArchetypeId, AgentResult>>>({});
  const [sources, setSources] = useState<Partial<Record<ArchetypeId, SourceLink[]>>>({});
  const [reviews, setReviews] = useState<Partial<Record<ArchetypeId, ReviewStatus>>>({});
  const [plannerVisible, setPlannerVisible] = useState(false);
  const [clerkDraft, setClerkDraft] = useState<string[]>([]);
  const [travelRevealed, setTravelRevealed] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeInfo>({ live: false, model: "gpt-5.5" });
  const [useLiveApi, setUseLiveApi] = useState(true);
  const [tuningCard, setTuningCard] = useState<ArchetypeId | null>(null);
  const [followUps, setFollowUps] = useState<Partial<Record<ArchetypeId, string>>>({});
  const [intakeMode, setIntakeMode] = useState<SessionMode>("clinical");
  const [intakeTitle, setIntakeTitle] = useState("");
  const [intakeText, setIntakeText] = useState("");
  const [loungeSpeaker, setLoungeSpeaker] = useState<ArchetypeId>("intern");
  const [loungeTarget, setLoungeTarget] = useState<ArchetypeId | "floor">("floor");
  const [loungePrompt, setLoungePrompt] = useState("");
  const [loungeRunning, setLoungeRunning] = useState(false);
  const timers = useRef<number[]>([]);

  const allArchetypes = useMemo(() => [...archetypes, ...persisted.customArchetypes], [persisted.customArchetypes]);
  const activeSession = persisted.sessions.find((session) => session.id === persisted.activeSessionId);
  const isCustomSession = Boolean(activeSession && activeSession.template !== "mrs-m");
  const activeSettings = activeSession?.settings ?? persisted.settings;
  const activeMatter = matters[0];
  const selectedArchetypes = activeSession?.selectedArchetypes ?? persisted.selectedArchetypes;
  const currentVisit = persisted.visit;
  const clinicalInputBlocked = Boolean(
    activeSession?.mode === "clinical" && activeSession.template !== "mrs-m" && !activeSession.anonymization?.approvedForLive,
  );
  const runtimeBlocked = view === "floor" && clinicalInputBlocked;
  const liveRuntimeActive = runtime.live && useLiveApi && !runtimeBlocked;
  const currentMotion = activeSession
    ? activeSession.mode === "clinical"
      ? "Review the submitted clinical context. Surface assumptions, missing questions, safety concerns, evidence needs, and proportionate next actions."
      : "Deliberate on the submitted problem. Surface assumptions, tensions, options, risks, and next moves."
    : motions[currentVisit];

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
    setClerkDraft([]);
    setQuorumFlash(false);
    setTravelRevealed(false);
    setLoungePrompt("");
    setLoungeRunning(false);
  };

  const resetDemo = () => {
    window.localStorage.removeItem(storageKey);
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setPersisted(initialPersisted);
    setCallState("idle");
    setOutputs({});
    setAgentResults({});
    setSources({});
    setReviews({});
    setPlannerVisible(false);
    setClerkDraft([]);
    setTravelRevealed(false);
    setLoungePrompt("");
    setLoungeRunning(false);
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
    setClerkDraft([]);
    setQuorumFlash(false);
    setTravelRevealed(false);
    setCallState(Object.keys(session.results ?? {}).length ? "complete" : "idle");
    setLoungeSpeaker(session.selectedArchetypes[0] ?? "intern");
    setLoungeTarget("floor");
    setLoungePrompt("");
    setLoungeRunning(false);
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

  const createSession = (mode: SessionMode, title: string, sourceText: string, template?: "mrs-m") => {
    const now = new Date().toISOString();
    const session: QuorumSession = {
      id: createId("session"),
      title: title.trim() || (mode === "clinical" ? "Untitled clinical review" : "Untitled thinking session"),
      mode,
      sourceText: sourceText.trim(),
      template,
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
    if (activeSession && activeSession.template !== "mrs-m") {
      const submittedText = sessionWorkingText(activeSession);

      return [
        `Session title: ${activeSession.title}`,
        `Mode: ${activeSession.mode}`,
        activeSession.mode === "clinical" && activeSession.anonymization
          ? "Submitted context after local anonymization:"
          : "Submitted context:",
        submittedText,
        `Committed Minutes: ${activeSession.minutes.join("\n\n") || "None yet."}`,
      ].join("\n");
    }

    const resultLine =
      currentVisit === "visit1"
        ? "Eosinophils 1,200/ul. Asymptomatic. Initial history says no recent foreign travel."
        : `Eosinophils 6,000/ul. Stool OCP negative x3. CXR clean. Medication review still open. ${
            travelRevealed ? "Travel clarified: Egypt Nile cruise about ten years ago." : "Deferred travel question still open."
          }`;

    return [
      `${activeMatter.name}, ${activeMatter.age}, ${activeMatter.sex}. ${activeMatter.summary}`,
      `Background: ${activeMatter.background.join("; ")}.`,
      `Medication: ${activeMatter.medication.join("; ")}.`,
      resultLine,
      `Committed Minutes: ${(activeSession?.minutes ?? persisted.minutes).join("\n\n") || "None yet."}`,
    ].join("\n");
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

    const scripted = sessionScripts[currentVisit][id];
    if (scripted && !isCustomSession) return scripted;

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
          visit: currentVisit,
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

      if (payload.sources?.length) {
        setSources((previous) => ({ ...previous, [id]: payload.sources }));
      }

      return parseAgentResult(payload, id);
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
    setClerkDraft([]);
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
      ).then(() => setCallState("complete"));

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
        setCallState("complete");
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
    setClerkDraft([]);
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
        if (Array.isArray(payload.actions) && payload.actions.length) {
          setClerkDraft(payload.actions.slice(0, 8).map(String));
          return;
        }
      } catch {
        // Use deterministic fallback below.
      }
    }

    const accepted = selectedRoster.filter((agent) => reviews[agent.id] === "accepted");
    const summaryActions = accepted.flatMap((agent) => agentResults[agent.id]?.suggestedActions ?? []).filter(Boolean);
    setClerkDraft(summaryActions.length ? summaryActions.slice(0, 6) : plannerDrafts[currentVisit]);
  };

  const commitMinutes = () => {
    const visitLabel = currentVisit === "visit1" ? "Visit 1" : "Visit 2";
    const draft = clerkDraft.length ? clerkDraft : plannerDrafts[currentVisit];
    const minutes = draft.map((item) => `- ${item}`).join("\n");

    if (activeSession) {
      updateActiveSession((session) => ({
        ...session,
        minutes: [
          `${session.title} Minutes committed\n${minutes}`,
          ...session.minutes.filter((entry) => !entry.startsWith(`${session.title} Minutes`)),
        ],
        actionLog: [
          {
            id: createId("act"),
            at: new Date().toISOString(),
            label: "Minutes committed",
            detail: `${draft.length} Clerk items were committed to the session record.`,
          },
          ...session.actionLog,
        ].slice(0, 30),
      }));
      setPersisted((previous) => ({ ...previous, activeSessionId: undefined }));
      setView("docket");
      return;
    }

    setPersisted((previous) => ({
      ...previous,
      committed: {
        ...previous.committed,
        [currentVisit]: true,
      },
      minutes: [
        `${visitLabel} Minutes committed\n${minutes}`,
        ...previous.minutes.filter((entry) => !entry.startsWith(`${visitLabel} Minutes`)),
      ],
    }));
    appendAction("Minutes committed", `${draft.length} Clerk items were committed to the record.`);

    setView("docket");
  };

  const advanceToVisit2 = () => {
    resetTransient();
    setPersisted((previous) => ({
      ...previous,
      visit: "visit2",
    }));
    setTravelRevealed(false);
    setView("floor");
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

      {view === "docket" ? (
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
          matter={activeMatter}
          session={activeSession}
          isCustomSession={isCustomSession}
          motion={currentMotion}
          allArchetypes={allArchetypes}
          currentVisit={currentVisit}
          selectedRoster={selectedRoster}
          selectedArchetypes={selectedArchetypes}
          settings={activeSettings}
          tuningCard={tuningCard}
          outputs={outputs}
          agentResults={agentResults}
          sources={sources}
          reviews={reviews}
          callState={callState}
          quorumFlash={quorumFlash}
          plannerVisible={plannerVisible}
          travelRevealed={travelRevealed}
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
          onShowPlanner={draftPlanner}
          onCommit={commitMinutes}
          onRevealTravel={() => setTravelRevealed(true)}
          onAdvanceToVisit2={advanceToVisit2}
          clerkDraft={clerkDraft}
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
              sessions.slice(0, 5).map((session) => (
                <button key={session.id} onClick={() => onOpenSession(session.id)} type="button">
                  <strong>{session.title}</strong>
                  <span>
                    {session.mode === "clinical" ? "Clinical" : "Thinking"} - {session.selectedArchetypes.length} cards -{" "}
                    {session.minutes.length} records
                  </span>
                </button>
              ))
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
  matter: (typeof matters)[number];
  session?: QuorumSession;
  isCustomSession: boolean;
  motion: string;
  allArchetypes: Archetype[];
  currentVisit: VisitId;
  selectedRoster: Archetype[];
  selectedArchetypes: ArchetypeId[];
  settings: Record<ArchetypeId, AgentSettings>;
  tuningCard: ArchetypeId | null;
  outputs: Partial<Record<ArchetypeId, string>>;
  agentResults: Partial<Record<ArchetypeId, AgentResult>>;
  sources: Partial<Record<ArchetypeId, SourceLink[]>>;
  reviews: Partial<Record<ArchetypeId, ReviewStatus>>;
  callState: CallState;
  quorumFlash: boolean;
  plannerVisible: boolean;
  travelRevealed: boolean;
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
  onShowPlanner: () => void;
  onCommit: () => void;
  onRevealTravel: () => void;
  onAdvanceToVisit2: () => void;
  clerkDraft: string[];
};

function FloorView({
  matter,
  session,
  isCustomSession,
  motion,
  allArchetypes,
  currentVisit,
  selectedRoster,
  selectedArchetypes,
  settings,
  tuningCard,
  outputs,
  agentResults,
  sources,
  reviews,
  callState,
  quorumFlash,
  plannerVisible,
  travelRevealed,
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
  onShowPlanner,
  onCommit,
  onRevealTravel,
  onAdvanceToVisit2,
  clerkDraft,
}: FloorProps) {
  return (
    <section className="floor-layout">
      {quorumFlash && (
        <div className="quorum-flash" role="status">
          <span>We have Quorum.</span>
        </div>
      )}

      <aside className="docket-card">
        <div className="panel-heading">
          <span className="section-label">{isCustomSession ? "Session" : "Matter"}</span>
          <strong>{session?.title ?? matter.name}</strong>
        </div>

        {isCustomSession && session ? (
          <div className="session-context-card">
            <span className={`mode-badge ${session.mode}`}>{session.mode === "clinical" ? "Clinical" : "Thinking"}</span>
            <p>{session.sourceText}</p>
            {session.mode === "clinical" && (
              <AnonymizationPanel
                anonymization={session.anonymization}
                onApprove={() => onSetClinicalLiveApproval(true)}
                onPause={() => onSetClinicalLiveApproval(false)}
                onRun={onRunAnonymizer}
              />
            )}
          </div>
        ) : (
          <>
            <div className="patient-heading">
              <span className="patient-avatar">M</span>
              <div>
                <h2>
                  {matter.age}, {matter.sex}
                </h2>
                <p>{matter.summary}</p>
              </div>
            </div>

            <DocketFacts currentVisit={currentVisit} travelRevealed={travelRevealed} onRevealTravel={onRevealTravel} />

            <div className="condition-list">
              <span className="mini-label">Medical conditions</span>
              {matter.conditions.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>

            <div className="medication-list">
              <span className="mini-label">Medication</span>
              {matter.medication.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </>
        )}
      </aside>

      <section className="floor-main">
        <div className="motion-panel">
          <div>
            <span className="section-label">The Motion</span>
            <h1>{isCustomSession ? "Call the Session" : currentVisit === "visit1" ? "Call the Session" : "Reopen the Session"}</h1>
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
              <span className="mini-label">Planner draft</span>
              <ul>
                {(clerkDraft.length ? clerkDraft : plannerDrafts[currentVisit]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="draft-actions">
                <button className="primary-button" onClick={onCommit} type="button">
                  <FileText size={17} />
                  Commit Minutes
                </button>
                {!isCustomSession && currentVisit === "visit1" && (
                  <button className="secondary-button" onClick={onAdvanceToVisit2} type="button">
                    <Clock3 size={17} />
                    Three weeks later
                  </button>
                )}
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
          </div>
        ) : null}
        {waiting ? (
          <span className="typing-placeholder">Waiting for the Floor...</span>
        ) : output ? (
          <>
            <p>{output}</p>
            {sources.length > 0 && (
              <div className="source-list">
                {sources.map((source) => (
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

type DocketFactsProps = {
  currentVisit: VisitId;
  travelRevealed: boolean;
  onRevealTravel: () => void;
};

function DocketFacts({ currentVisit, travelRevealed, onRevealTravel }: DocketFactsProps) {
  return (
    <div className="fact-stack">
      <Metric label="Eosinophils" value={currentVisit === "visit1" ? "1,200/ul" : "6,000/ul"} tone="red" />
      <Metric label="CXR" value={currentVisit === "visit1" ? "Ordered" : "Clean"} tone="teal" />
      <Metric label="Stool OCP" value={currentVisit === "visit1" ? "Ordered x3" : "Negative x3"} tone="brass" />
      {currentVisit === "visit2" && (
        <div className={`travel-box ${travelRevealed ? "revealed" : ""}`}>
          <span className="mini-label">Deferred question</span>
          {travelRevealed ? (
            <strong>Egypt Nile cruise, about ten years ago.</strong>
          ) : (
            <>
              <span>Re-take travel history with specific prompts.</span>
              <button className="inline-action" onClick={onRevealTravel} type="button">
                Ask now
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type MetricProps = {
  label: string;
  value: string;
  tone: "red" | "teal" | "brass";
};

function Metric({ label, value, tone }: MetricProps) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type StepProps = {
  active: boolean;
  done: boolean;
  label: string;
};

function Step({ active, done, label }: StepProps) {
  return (
    <div className={`step ${active ? "active" : ""} ${done ? "done" : ""}`}>
      <span>{done ? <Check size={14} /> : <Clock3 size={14} />}</span>
      <strong>{label}</strong>
    </div>
  );
}

function docketFlag(currentVisit: VisitId, committed: Record<VisitId, boolean>) {
  if (currentVisit === "visit2" && committed.visit2) return "Minutes committed; follow-up plan signed";
  if (currentVisit === "visit2") return "Reopened: eosinophils 6,000/ul and deferred questions still open";
  if (committed.visit1) return "Visit 1 Minutes committed; review due in three weeks";
  return "Pulsing flag: medication review and deferred travel question";
}

export default App;
