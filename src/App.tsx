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

type PersistedState = {
  visit: VisitId;
  selectedArchetypes: ArchetypeId[];
  settings: Record<ArchetypeId, AgentSettings>;
  committed: Record<VisitId, boolean>;
  minutes: string[];
};

const storageKey = "quorum-demo-state-v033";

const visitImages: Record<VisitId, { alt: string; caption: string; src: string }> = {
  visit1: {
    src: "/generated/visit-1-consult.png",
    alt: "Marseille tarot style scene of Mrs M discussing routine blood results with her clinician.",
    caption: "Visit 1: incidental eosinophilia on routine cardiovascular bloods.",
  },
  visit2: {
    src: "/generated/visit-2-followup.png",
    alt: "Marseille tarot style scene of Mrs M at follow-up with travel history, blood results, and chest X-ray.",
    caption: "Visit 2: count rising, clean CXR, stool OCP negative, travel history live.",
  },
};

const archetypeArtPositions: Record<ArchetypeId, { x: string; y: string }> = {
  intern: { x: "0%", y: "0%" },
  oldNurse: { x: "33.3%", y: "0%" },
  biblioRat: { x: "66.6%", y: "0%" },
  contrarian: { x: "100%", y: "0%" },
  patientAdvocate: { x: "13%", y: "100%" },
  shrink: { x: "50%", y: "100%" },
  oldGeezer: { x: "87%", y: "100%" },
};

const initialPersisted: PersistedState = {
  visit: "visit1",
  selectedArchetypes: defaultSession,
  settings: defaultAgentSettings,
  committed: {
    visit1: false,
    visit2: false,
  },
  minutes: [],
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
  }
};

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
  const [caseRevealOpen, setCaseRevealOpen] = useState(false);
  const [outputs, setOutputs] = useState<Partial<Record<ArchetypeId, string>>>({});
  const [sources, setSources] = useState<Partial<Record<ArchetypeId, SourceLink[]>>>({});
  const [reviews, setReviews] = useState<Partial<Record<ArchetypeId, ReviewStatus>>>({});
  const [plannerVisible, setPlannerVisible] = useState(false);
  const [travelRevealed, setTravelRevealed] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeInfo>({ live: false, model: "gpt-5.5" });
  const [useLiveApi, setUseLiveApi] = useState(true);
  const [tuningCard, setTuningCard] = useState<ArchetypeId | null>(null);
  const [followUps, setFollowUps] = useState<Partial<Record<ArchetypeId, string>>>({});
  const timers = useRef<number[]>([]);

  const activeMatter = matters[0];
  const selectedArchetypes = persisted.selectedArchetypes;
  const currentVisit = persisted.visit;
  const liveRuntimeActive = runtime.live && useLiveApi;

  const selectedRoster = useMemo(
    () => archetypes.filter((agent) => selectedArchetypes.includes(agent.id)),
    [selectedArchetypes],
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
    setSources({});
    setReviews({});
    setPlannerVisible(false);
    setQuorumFlash(false);
    setTravelRevealed(false);
  };

  const resetDemo = () => {
    window.localStorage.removeItem(storageKey);
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setPersisted(initialPersisted);
    setCallState("idle");
    setOutputs({});
    setSources({});
    setReviews({});
    setPlannerVisible(false);
    setTravelRevealed(false);
    setCaseRevealOpen(false);
    setView("docket");
  };

  const toggleArchetype = (id: ArchetypeId) => {
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
    setPersisted((previous) => ({
      ...previous,
      settings: {
        ...previous.settings,
        [id]: {
          ...previous.settings[id],
          ...patch,
        },
      },
    }));
  };

  const caseContext = () => {
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
      `Committed Minutes: ${persisted.minutes.join("\n\n") || "None yet."}`,
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

    return sessionScripts[currentVisit][id];
  };

  const runAgentApi = async (id: ArchetypeId, chairQuestion?: string) => {
    const agent = archetypes.find((item) => item.id === id)!;
    const settings = persisted.settings[id];
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
          motion: motions[currentVisit],
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

      return payload.text as string;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const callSession = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setOutputs({});
    setSources({});
    setReviews({});
    setPlannerVisible(false);
    setCallState("calling");
    setQuorumFlash(true);

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
          let text = "";
          try {
            text = await runAgentApi(id);
          } catch {
            text = fallbackFor(id);
          }
          setOutputs((previous) => ({ ...previous, [id]: "" }));
          typeOutput(id, text || fallbackFor(id), index * 220);
        }),
      ).then(() => setCallState("complete"));

      return;
    }

    let longest = 0;

    selectedArchetypes.forEach((id, index) => {
      const text = fallbackFor(id);
      const startDelay = 500 + index * 420;
      const estimated = startDelay + Math.ceil(text.length / 7) * 24;
      longest = Math.max(longest, estimated);
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
      [id]: `${previous[id] || ""}\n\nChair: ${question}\n\n${archetypes.find((item) => item.id === id)?.shortName}: ${
        liveRuntimeActive ? "Calling OpenAI..." : "Reframing from this stance..."
      }`,
    }));

    setFollowUps((previous) => ({ ...previous, [id]: "" }));

    if (liveRuntimeActive) {
      try {
        const text = await runAgentApi(id, question);
        setOutputs((previous) => ({
          ...previous,
          [id]: `${previous[id]?.replace(/Calling OpenAI\.\.\.$/, "") || ""}${text}`,
        }));
      } catch {
        setOutputs((previous) => ({
          ...previous,
          [id]: `${previous[id]?.replace(/Calling OpenAI\.\.\.$/, "") || ""}${fallbackFor(id)}`,
        }));
      }
      return;
    }

    setOutputs((previous) => ({
      ...previous,
      [id]: `${previous[id]?.replace(/Reframing from this stance\.\.\.$/, "") || ""}${fallbackFor(id)}`,
    }));
  };

  const setReview = (id: ArchetypeId, status: ReviewStatus) => {
    setReviews((previous) => ({ ...previous, [id]: status }));
  };

  const commitMinutes = () => {
    const visitLabel = currentVisit === "visit1" ? "Visit 1" : "Visit 2";
    const minutes = plannerDrafts[currentVisit].map((item) => `- ${item}`).join("\n");

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
            <em>One voice is not enough</em>
          </span>
        </button>

        <div className="runtime-strip" aria-live="polite">
          <span className="status-dot" />
          <span>{callState === "calling" ? "Session on the Floor" : "Chair ready"}</span>
          <span className="runtime-chip">
            {runtime.live ? `OpenAI live: ${runtime.model}` : "Fallback runtime"}
          </span>
          <button
            className={`runtime-toggle ${liveRuntimeActive ? "active" : ""}`}
            disabled={!runtime.live}
            onClick={() => setUseLiveApi((value) => !value)}
            type="button"
          >
            {liveRuntimeActive ? "Live calls on" : "Live calls off"}
          </button>
        </div>

        <div className="topbar-actions">
          {view === "floor" && (
            <button className="ghost-button" onClick={() => setView("docket")} type="button">
              <ChevronLeft size={16} />
              Docket
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
          currentVisit={currentVisit}
          committed={persisted.committed}
          minutes={persisted.minutes}
          onPreviewMatter={() => setCaseRevealOpen(true)}
          onAdvanceToVisit2={advanceToVisit2}
        />
      ) : (
        <FloorView
          matter={activeMatter}
          currentVisit={currentVisit}
          selectedRoster={selectedRoster}
          selectedArchetypes={selectedArchetypes}
          settings={persisted.settings}
          tuningCard={tuningCard}
          outputs={outputs}
          sources={sources}
          reviews={reviews}
          callState={callState}
          quorumFlash={quorumFlash}
          plannerVisible={plannerVisible}
          travelRevealed={travelRevealed}
          onToggleArchetype={toggleArchetype}
          onTuneCard={setTuningCard}
          onUpdateSettings={updateAgentSettings}
          onCallSession={callSession}
          onReview={setReview}
          followUps={followUps}
          onChangeFollowUp={(id, value) => setFollowUps((previous) => ({ ...previous, [id]: value }))}
          onAskFollowUp={askAgentFollowUp}
          onShowPlanner={() => setPlannerVisible(true)}
          onCommit={commitMinutes}
          onRevealTravel={() => setTravelRevealed(true)}
          onAdvanceToVisit2={advanceToVisit2}
        />
      )}

      {caseRevealOpen && (
        <CaseRevealModal
          currentVisit={currentVisit}
          onClose={() => setCaseRevealOpen(false)}
          onOpenFloor={() => {
            setCaseRevealOpen(false);
            resetTransient();
            setView("floor");
          }}
        />
      )}
    </main>
  );
}

type DocketProps = {
  currentVisit: VisitId;
  committed: Record<VisitId, boolean>;
  minutes: string[];
  onPreviewMatter: () => void;
  onAdvanceToVisit2: () => void;
};

function DocketView({ currentVisit, committed, minutes, onPreviewMatter, onAdvanceToVisit2 }: DocketProps) {
  return (
    <section className="docket-layout">
      <div className="thesis-panel">
        <span className="section-label">Architecture</span>
        <h1>Safe AI assistance requires structural epistemic variety.</h1>
        <p>
          A Session of archetypes deliberates on the Floor. The human Chair governs. The Clerks
          produce only what the Chair signs off. When the Session is present, we have quorum.
        </p>
        <div className="thesis-actions">
          <button className="primary-button" onClick={onPreviewMatter} type="button">
            <Activity size={17} />
            Open flagged matter
          </button>
          {committed.visit1 && currentVisit === "visit1" && (
            <button className="secondary-button" onClick={onAdvanceToVisit2} type="button">
              <Clock3 size={17} />
              Three weeks later
            </button>
          )}
        </div>
      </div>

      <div className="docket-grid">
        <section className="matter-list" aria-label="Docket matters">
          <div className="panel-heading">
            <span className="section-label">The Docket</span>
            <strong>Four matters awaiting the Chair</strong>
          </div>

          {matters.map((matter) => (
            <button
              className={`matter-card ${matter.urgency} ${matter.id === "mrs-m" ? "selected" : ""}`}
              key={matter.id}
              onClick={matter.id === "mrs-m" ? onPreviewMatter : undefined}
              type="button"
            >
              <span className="matter-name">
                {matter.name}
                <small>
                  {matter.age}, {matter.sex}
                </small>
              </span>
              <span className="matter-summary">{matter.summary}</span>
              <span className="matter-flag">{matter.id === "mrs-m" ? docketFlag(currentVisit, committed) : matter.flag}</span>
            </button>
          ))}
        </section>

        <section className="overview-panel">
          <div className="panel-heading">
            <span className="section-label">Minutes</span>
            <strong>Persistent record across visits</strong>
          </div>

          <div className="visit-rail">
            <Step active={currentVisit === "visit1"} done={committed.visit1} label="Visit 1" />
            <Step active={currentVisit === "visit2"} done={committed.visit2} label="Visit 2" />
          </div>

          <div className="preview-board">
            <div>
              <span className="mini-label">Mrs M</span>
              <h2>{currentVisit === "visit1" ? "Routine bloods are not routine reasoning." : "The deferred question returns."}</h2>
              <p>
                {currentVisit === "visit1"
                  ? "The answer may already be visible in the medication list, but only if the Session forces the Chair to look."
                  : "Three weeks later, the count has risen. The Minutes carry forward the unresolved travel history and medication review."}
              </p>
            </div>
            <div className="metric-stack">
              <Metric label="Eosinophils" value={currentVisit === "visit1" ? "1,200/ul" : "6,000/ul"} tone="red" />
              <Metric label="Stool OCP" value={currentVisit === "visit1" ? "Pending" : "Negative x3"} tone="teal" />
              <Metric label="Open item" value="Travel history" tone="brass" />
            </div>
          </div>

          <div className="minutes-log">
            {minutes.length ? (
              minutes.map((entry) => (
                <pre key={entry} className="minutes-entry">
                  {entry}
                </pre>
              ))
            ) : (
              <div className="empty-minutes">
                <Archive size={22} />
                <span>No Minutes committed yet.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

type CaseRevealModalProps = {
  currentVisit: VisitId;
  onClose: () => void;
  onOpenFloor: () => void;
};

function CaseRevealModal({ currentVisit, onClose, onOpenFloor }: CaseRevealModalProps) {
  const image = visitImages[currentVisit];

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Mrs M case reveal">
      <section className="case-reveal">
        <button className="modal-close" onClick={onClose} type="button" aria-label="Close case preview">
          <X size={18} />
        </button>

        <figure className="visit-portrait">
          <img alt={image.alt} src={image.src} />
          <figcaption>{image.caption}</figcaption>
        </figure>

        <div className="case-copy">
          <span className="section-label">Flagged matter</span>
          <h2>{currentVisit === "visit1" ? "Mrs M came because the surgery called." : "Three weeks later, the unresolved question is still live."}</h2>
          <p>
            {currentVisit === "visit1"
              ? "She feels well. Routine cardiovascular bloods found eosinophilia. The risk is not that the model misses a rare diagnosis; it is that the clinician accepts a clean story and skips medication review, travel history, and proportionality."
              : "Repeat eosinophils are now 6,000/ul. Stool OCP is negative across three samples and CXR is clean. The Minutes carry forward exactly what would otherwise be lost: medication review and a deferred travel question."}
          </p>

          <div className="case-beats">
            <Metric label="Signal" value={currentVisit === "visit1" ? "1,200/ul" : "6,000/ul"} tone="red" />
            <Metric label="Patient state" value="Asymptomatic" tone="teal" />
            <Metric label="Session task" value={currentVisit === "visit1" ? "Investigate or observe?" : "Parallel next steps?"} tone="brass" />
          </div>

          <div className="modal-actions">
            <button className="primary-button" onClick={onOpenFloor} type="button">
              <Layers3 size={17} />
              Compose the Session
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

type FloorProps = {
  matter: (typeof matters)[number];
  currentVisit: VisitId;
  selectedRoster: Archetype[];
  selectedArchetypes: ArchetypeId[];
  settings: Record<ArchetypeId, AgentSettings>;
  tuningCard: ArchetypeId | null;
  outputs: Partial<Record<ArchetypeId, string>>;
  sources: Partial<Record<ArchetypeId, SourceLink[]>>;
  reviews: Partial<Record<ArchetypeId, ReviewStatus>>;
  callState: CallState;
  quorumFlash: boolean;
  plannerVisible: boolean;
  travelRevealed: boolean;
  onToggleArchetype: (id: ArchetypeId) => void;
  onTuneCard: (id: ArchetypeId | null) => void;
  onUpdateSettings: (id: ArchetypeId, patch: Partial<AgentSettings>) => void;
  onCallSession: () => void;
  onReview: (id: ArchetypeId, status: ReviewStatus) => void;
  followUps: Partial<Record<ArchetypeId, string>>;
  onChangeFollowUp: (id: ArchetypeId, value: string) => void;
  onAskFollowUp: (id: ArchetypeId) => void;
  onShowPlanner: () => void;
  onCommit: () => void;
  onRevealTravel: () => void;
  onAdvanceToVisit2: () => void;
};

function FloorView({
  matter,
  currentVisit,
  selectedRoster,
  selectedArchetypes,
  settings,
  tuningCard,
  outputs,
  sources,
  reviews,
  callState,
  quorumFlash,
  plannerVisible,
  travelRevealed,
  onToggleArchetype,
  onTuneCard,
  onUpdateSettings,
  onCallSession,
  onReview,
  followUps,
  onChangeFollowUp,
  onAskFollowUp,
  onShowPlanner,
  onCommit,
  onRevealTravel,
  onAdvanceToVisit2,
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
          <span className="section-label">Matter</span>
          <strong>{matter.name}</strong>
        </div>

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
      </aside>

      <section className="floor-main">
        <div className="motion-panel">
          <div>
            <span className="section-label">The Motion</span>
            <h1>{currentVisit === "visit1" ? "Call the Session" : "Reopen the Session"}</h1>
            <p>{motions[currentVisit]}</p>
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
            <button className="ghost-button tutorial-button" type="button" title="Custom archetypes placeholder">
              <WandSparkles size={15} />
              Blank card
            </button>
          </div>
          <div className="archetype-strip card-deck">
            {archetypes.map((agent) => (
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
                  style={
                    {
                      "--art-x": archetypeArtPositions[agent.id].x,
                      "--art-y": archetypeArtPositions[agent.id].y,
                    } as CSSProperties
                  }
                  type="button"
                >
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
                    <CardSettings agent={agent} settings={settings[agent.id]} onUpdate={onUpdateSettings} />
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
                sources={sources[agent.id] ?? []}
                review={reviews[agent.id] ?? "pending"}
                callState={callState}
                onReview={onReview}
                followUpValue={followUps[agent.id] ?? ""}
                onChangeFollowUp={onChangeFollowUp}
                onAskFollowUp={onAskFollowUp}
              />
            ))}
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
                {plannerDrafts[currentVisit].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="draft-actions">
                <button className="primary-button" onClick={onCommit} type="button">
                  <FileText size={17} />
                  Commit Minutes
                </button>
                {currentVisit === "visit1" && (
                  <button className="secondary-button" onClick={onAdvanceToVisit2} type="button">
                    <Clock3 size={17} />
                    Three weeks later
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </section>

    </section>
  );
}

type AgentCardProps = {
  agent: Archetype;
  output: string;
  sources: SourceLink[];
  review: ReviewStatus;
  callState: CallState;
  onReview: (id: ArchetypeId, status: ReviewStatus) => void;
  followUpValue: string;
  onChangeFollowUp: (id: ArchetypeId, value: string) => void;
  onAskFollowUp: (id: ArchetypeId) => void;
  compact?: boolean;
};

function CardSettings({
  agent,
  settings,
  onUpdate,
}: {
  agent: Archetype;
  settings: AgentSettings;
  onUpdate: (id: ArchetypeId, patch: Partial<AgentSettings>) => void;
}) {
  return (
    <div className="card-back">
      <div className="card-back-header">
        <strong>{agent.shortName}</strong>
        <span>Configure</span>
      </div>
      <label>
        Provider
        <select value={settings.provider} disabled>
          <option value="openai">OpenAI</option>
        </select>
      </label>
      <label>
        Model
        <select value={settings.model} onChange={(event) => onUpdate(agent.id, { model: event.target.value })}>
          <option value="server-default">Server default</option>
          <option value="gpt-5.5">gpt-5.5</option>
          <option value="gpt-5.5-pro">gpt-5.5-pro</option>
          <option value="gpt-5">gpt-5</option>
          <option value="gpt-4.1">gpt-4.1</option>
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
    </div>
  );
}

function AgentCard({
  agent,
  output,
  sources,
  review,
  callState,
  onReview,
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
