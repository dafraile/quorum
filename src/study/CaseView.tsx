import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  negativeAgentId,
  negativePanelLabel,
  panelAgentIds,
  studyAgentById,
  studyAgents,
} from "../../shared/studyRoster";
import type { AgentKey, Debrief, Verdict } from "../../shared/studyTypes";
import { StudyApiError, fetchContribution, fetchDebrief, fetchPatientReply, fetchStaticFloor, logEvent } from "./api";
import { changeOptions, confidenceOptions } from "./content";
import {
  activeAgents,
  createId,
  effectiveText,
  isRuled,
  latestAnswerFor,
  now,
  patientUtterances,
  rulingCounts,
  type CaseSlot,
  type CaseState,
  type ChairMotion,
  type FloorItem,
} from "./state";

type CaseViewProps = {
  slot: CaseSlot;
  caseIndex: number;
  caseCount: number;
  caseState: CaseState;
  updateCase: (updater: (current: CaseState) => CaseState) => void;
  onFinished: () => void;
};

const secondsSince = (iso?: string) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 1000) : undefined);

export function CaseView({ slot, caseIndex, caseCount, caseState, updateCase, onFinished }: CaseViewProps) {
  // Latest state for async callbacks and timers (props are stale inside closures).
  const stateRef = useRef(caseState);
  stateRef.current = caseState;

  const log = (type: string, data?: unknown) => logEvent(type, data, caseIndex);

  const patchItem = (id: string, patch: Partial<FloorItem>) =>
    updateCase((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));

  // ------------------------------------------------------------ loading

  const requestLive = async (item: FloorItem, motion?: ChairMotion) => {
    const current = stateRef.current;
    try {
      const result = await fetchContribution({
        caseIndex,
        agentId: item.agentId!,
        requestId: item.id,
        motion: motion ? { text: motion.text, filedBy: motion.filedBy } : undefined,
        previous: motion ? latestAnswerFor(current, item.agentId!) : undefined,
        patientUtterances: slot.mode === "triadic" ? patientUtterances(current) : undefined,
      });
      patchItem(item.id, { text: result.answer, status: "ready", error: undefined });
    } catch (error) {
      patchItem(item.id, { status: "error", error: error instanceof Error ? error.message : "Request failed" });
    }
  };

  const requestStatic = async (itemIds: string[]) => {
    try {
      const { contributions } = await fetchStaticFloor(caseIndex);
      const byAgent = new Map(contributions.map((item) => [item.agentId, item]));
      updateCase((current) => ({
        ...current,
        items: current.items.map((item) => {
          if (!itemIds.includes(item.id) || !item.agentId) return item;
          const found = byAgent.get(item.agentId);
          return found
            ? { ...item, text: found.answer, status: "ready", error: undefined }
            : { ...item, status: "error", error: "Missing from the prepared Floor" };
        }),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      updateCase((current) => ({
        ...current,
        items: current.items.map((item) => (itemIds.includes(item.id) ? { ...item, status: "error", error: message } : item)),
      }));
    }
  };

  const retryItem = (item: FloorItem) => {
    patchItem(item.id, { status: "loading", error: undefined });
    log("item_retry", { itemId: item.id, agentId: item.agentId, kind: item.kind });
    if (item.kind === "opening" && item.source === "static") {
      void requestStatic([item.id]);
      return;
    }
    const motion = item.motionId ? stateRef.current.motions.find((entry) => entry.id === item.motionId) : undefined;
    void requestLive(item, motion);
  };

  // ------------------------------------------------------------ record -> floor

  const openFloor = (precommit: { diagnosis: string; plan: string; confidence: number }) => {
    const openedAt = now();
    const items: FloorItem[] = [...panelAgentIds, negativeAgentId].map((agentId) => ({
      id: createId("item"),
      kind: "opening",
      agentId,
      text: "",
      status: "loading",
      source: slot.floorSource,
      createdAt: openedAt,
    }));
    updateCase((current) => ({
      ...current,
      precommit: { ...precommit, at: openedAt },
      phase: "floor",
      floorOpenedAt: openedAt,
      items,
    }));
    void log("precommit_submitted", {
      ...precommit,
      confidenceLabel: confidenceOptions[precommit.confidence - 1],
      secondsOnRecord: secondsSince(caseState.startedAt),
    });
    void log("floor_opened", { floorSource: slot.floorSource, mode: slot.mode, caseId: slot.caseId });

    if (slot.floorSource === "static") {
      void requestStatic(items.map((item) => item.id));
    } else {
      items.forEach((item) => void requestLive(item));
    }
  };

  // ------------------------------------------------------------ floor actions

  const rule = (item: FloorItem, verdict: Verdict, amendedText?: string) => {
    updateCase((current) => ({
      ...current,
      items: current.items.map((entry) =>
        entry.id === item.id ? { ...entry, ruling: { verdict, amendedText, at: now() } } : entry,
      ),
    }));
    void log("ruling", {
      itemId: item.id,
      kind: item.kind,
      agentId: item.agentId,
      motionId: item.motionId,
      patientMotionId: item.patientMotionId,
      source: item.source,
      verdict,
      amendedText,
      originalText: item.text,
      previousVerdict: item.ruling?.verdict,
      secondsSinceFloorOpened: secondsSince(stateRef.current.floorOpenedAt),
    });
  };

  const fileMotion = (text: string, target: AgentKey | "floor", filedBy: "chair" | "patient" = "chair") => {
    const current = stateRef.current;
    const targets = target === "floor" ? activeAgents(current) : [target];
    const motion: ChairMotion = { id: createId("motion"), text, target, targets, filedBy, at: now() };
    const items: FloorItem[] = targets.map((agentId) => ({
      id: createId("item"),
      kind: "motion-response",
      agentId,
      motionId: motion.id,
      text: "",
      status: "loading",
      source: "live",
      createdAt: motion.at,
    }));
    updateCase((state) => ({ ...state, motions: [...state.motions, motion], items: [...state.items, ...items] }));
    void log("motion_filed", { motionId: motion.id, text, target, targets, filedBy });
    items.forEach((item) => void requestLive(item, motion));
  };

  const withdrawAdvocate = (trigger: string) => {
    if (stateRef.current.advocateWithdrawnAt) return;
    const at = now();
    stateRef.current = { ...stateRef.current, advocateWithdrawnAt: at };
    updateCase((state) => (state.advocateWithdrawnAt ? state : { ...state, advocateWithdrawnAt: at }));
    void log("advocate_withdrawn", { trigger });
  };

  const askPatient = async (question: string) => {
    const current = stateRef.current;
    const chairTurn = { id: createId("chat"), role: "chair" as const, text: question, at: now() };
    const pendingId = createId("chat");
    updateCase((state) => ({
      ...state,
      chat: [...state.chat, chairTurn, { id: pendingId, role: "patient", text: "", at: now(), status: "loading" }],
    }));
    void log("patient_question", { question, secondsSinceFloorOpened: secondsSince(current.floorOpenedAt) });

    const history = current.chat.filter((turn) => !turn.status).map(({ role, text }) => ({ role, text }));
    const floorSummary = current.items
      .filter((item) => item.status === "ready" && item.agentId)
      .map((item) => `${studyAgentById(item.agentId!).shortName}: ${item.text.slice(0, 240)}`);
    try {
      const { reply } = await fetchPatientReply({ caseIndex, question, history, floorSummary });
      updateCase((state) => ({
        ...state,
        chat: state.chat.map((turn) => (turn.id === pendingId ? { ...turn, text: reply, status: undefined, at: now() } : turn)),
      }));
      withdrawAdvocate("patient_answered");
    } catch (error) {
      updateCase((state) => ({
        ...state,
        chat: state.chat.map((turn) =>
          turn.id === pendingId
            ? { ...turn, status: "error", text: error instanceof Error ? error.message : "No answer. Please ask again." }
            : turn,
        ),
      }));
    }
  };

  // Scripted patient Motions (triadic): fire when a ruling count or time threshold is reached.
  useEffect(() => {
    if (slot.mode !== "triadic" || caseState.phase !== "floor") return;
    const tick = () => {
      const current = stateRef.current;
      if (!current.floorOpenedAt) return;
      const seconds = (Date.now() - Date.parse(current.floorOpenedAt)) / 1000;
      const ruled = current.items.filter(isRuled).length;
      const lastPatientMotion = [...current.items].reverse().find((item) => item.kind === "patient-motion");
      if (lastPatientMotion && Date.now() - Date.parse(lastPatientMotion.createdAt) < 30_000) return;
      const next = slot.case.patientMotions.find(
        (motion) =>
          !current.firedPatientMotions.includes(motion.id) &&
          ((motion.trigger.afterRulings !== undefined && ruled >= motion.trigger.afterRulings) ||
            (motion.trigger.afterSeconds !== undefined && seconds >= motion.trigger.afterSeconds)),
      );
      if (!next) return;

      const item: FloorItem = {
        id: createId("item"),
        kind: "patient-motion",
        patientMotionId: next.id,
        text: next.text,
        status: "ready",
        source: "script",
        createdAt: now(),
      };
      stateRef.current = { ...current, firedPatientMotions: [...current.firedPatientMotions, next.id], items: [...current.items, item] };
      updateCase((state) =>
        state.firedPatientMotions.includes(next.id)
          ? state
          : { ...state, firedPatientMotions: [...state.firedPatientMotions, next.id], items: [...state.items, item] },
      );
      void log("patient_motion_filed", { itemId: item.id, patientMotionId: next.id, text: next.text, seconds: Math.round(seconds), ruled });
      withdrawAdvocate("patient_motion");
    };
    tick();
    const timer = window.setInterval(tick, 2000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.mode, caseState.phase]);

  const closeFloor = () => {
    const current = stateRef.current;
    updateCase((state) => ({ ...state, phase: "final" }));
    void log("floor_closed", {
      ...rulingCounts(current),
      motions: current.motions.length,
      patientQuestions: current.chat.filter((turn) => turn.role === "chair").length,
      secondsOnFloor: secondsSince(current.floorOpenedAt),
    });
  };

  const submitFinal = async (final: NonNullable<CaseState["final"]>) => {
    const current = stateRef.current;
    updateCase((state) => ({ ...state, final }));
    // The server releases the debrief only after this event is stored, so wait for it.
    await log("final_submitted", {
      ...final,
      confidenceAfterLabel: confidenceOptions[final.confidenceAfter - 1],
      planStart: slot.planStart,
      precommit: current.precommit,
      diagnosisChanged: final.diagnosis.trim() !== (current.precommit?.diagnosis ?? "").trim(),
      planChanged: final.plan.trim() !== (current.precommit?.plan ?? "").trim(),
    });
    updateCase((state) => ({ ...state, phase: "debrief", debriefOpenedAt: now() }));
  };

  const header = (
    <div className="case-header">
      <div>
        <span className="case-step">
          Case {caseIndex + 1} of {caseCount}
        </span>
        <h1>{slot.case.title}</h1>
      </div>
      <span className={`mode-badge ${slot.mode}`}>
        {slot.mode === "triadic" ? `Triadic · ${slot.case.patientLabel} is taking part` : "Dyadic · GP and panel"}
      </span>
    </div>
  );

  if (caseState.phase === "record") {
    return (
      <div className="study-page">
        {header}
        <div className="record-layout">
          <RecordView slot={slot} />
          <PrecommitForm onSubmit={openFloor} />
        </div>
      </div>
    );
  }

  if (caseState.phase === "floor") {
    return (
      <div className="study-page wide">
        {header}
        <FloorView
          slot={slot}
          caseState={caseState}
          onRule={rule}
          onRetry={retryItem}
          onMotion={fileMotion}
          onAskPatient={askPatient}
          onClose={closeFloor}
        />
      </div>
    );
  }

  if (caseState.phase === "final") {
    return (
      <div className="study-page">
        {header}
        <FinalForm slot={slot} caseState={caseState} onSubmit={submitFinal} />
      </div>
    );
  }

  return (
    <div className="study-page">
      {header}
      <DebriefView
        caseIndex={caseIndex}
        caseState={caseState}
        isLast={caseIndex + 1 >= caseCount}
        onContinue={() => {
          void log("debrief_closed", { secondsOnDebrief: secondsSince(caseState.debriefOpenedAt) });
          onFinished();
        }}
      />
    </div>
  );
}

// ================================================================ record & precommit

function RecordView({ slot }: { slot: CaseSlot }) {
  return (
    <section className="record-card">
      <h2>Patient record</h2>
      <p className="record-note">Synthetic record. No real patient.</p>
      {slot.case.record.map((section) => (
        <div className="record-section" key={section.heading}>
          <h3>{section.heading}</h3>
          <ul>
            {section.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Scale({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: string[];
  value?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="scale" role="radiogroup">
      {options.map((label, index) => (
        <label key={label} className={value === index + 1 ? "selected" : ""}>
          <input type="radio" name={name} checked={value === index + 1} onChange={() => onChange(index + 1)} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

function PrecommitForm({ onSubmit }: { onSubmit: (value: { diagnosis: string; plan: string; confidence: number }) => void }) {
  const [diagnosis, setDiagnosis] = useState("");
  const [plan, setPlan] = useState("");
  const [confidence, setConfidence] = useState<number>();
  const ready = diagnosis.trim().length > 1 && plan.trim().length > 1 && confidence !== undefined;

  return (
    <section className="form-card precommit">
      <h2>Before the panel speaks</h2>
      <p>Record your own working diagnosis and plan. The panel's discussion appears after you submit, and this entry is then locked.</p>
      <label className="field">
        Working diagnosis
        <textarea rows={3} value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} />
      </label>
      <label className="field">
        Plan
        <textarea rows={5} value={plan} onChange={(event) => setPlan(event.target.value)} />
      </label>
      <fieldset className="field">
        <legend>Before the panel's discussion is shown, how confident are you in your working diagnosis and plan?</legend>
        <Scale name="confidence-before" options={confidenceOptions} value={confidence} onChange={setConfidence} />
      </fieldset>
      <button className="primary" disabled={!ready} onClick={() => onSubmit({ diagnosis: diagnosis.trim(), plan: plan.trim(), confidence: confidence! })}>
        Lock my plan and open the Floor
      </button>
    </section>
  );
}

// ================================================================ floor

type FloorViewProps = {
  slot: CaseSlot;
  caseState: CaseState;
  onRule: (item: FloorItem, verdict: Verdict, amendedText?: string) => void;
  onRetry: (item: FloorItem) => void;
  onMotion: (text: string, target: AgentKey | "floor", filedBy?: "chair" | "patient") => void;
  onAskPatient: (question: string) => Promise<void>;
  onClose: () => void;
};

function FloorView({ slot, caseState, onRule, onRetry, onMotion, onAskPatient, onClose }: FloorViewProps) {
  const openings = caseState.items.filter((item) => item.kind === "opening");
  const panelOpenings = panelAgentIds.flatMap((id) => openings.filter((item) => item.agentId === id));
  const negativeOpening = openings.filter((item) => item.agentId === negativeAgentId);
  const withdrawn = Boolean(caseState.advocateWithdrawnAt);

  // Motions and patient Motions in the order they reached the Floor.
  const proceedings = useMemo(() => {
    const entries: Array<{ at: string; kind: "motion"; motion: ChairMotion } | { at: string; kind: "patient"; item: FloorItem }> = [
      ...caseState.motions.map((motion) => ({ at: motion.at, kind: "motion" as const, motion })),
      ...caseState.items
        .filter((item) => item.kind === "patient-motion")
        .map((item) => ({ at: item.createdAt, kind: "patient" as const, item })),
    ];
    return entries.sort((a, b) => a.at.localeCompare(b.at));
  }, [caseState.motions, caseState.items]);

  const card = (item: FloorItem) => (
    <FloorCard
      key={item.id}
      item={item}
      withdrawn={item.agentId === "patientAdvocate" && withdrawn}
      onRule={onRule}
      onRetry={onRetry}
      onPutToPanel={item.kind === "patient-motion" ? () => onMotion(item.text, "floor", "patient") : undefined}
      patientLabel={slot.case.patientLabel}
    />
  );

  return (
    <div className="floor-layout">
      <aside className="floor-left">
        <details open>
          <summary>Your locked pre-commitment</summary>
          <div className="precommit-locked">
            <strong>Working diagnosis</strong>
            <p>{caseState.precommit?.diagnosis}</p>
            <strong>Plan</strong>
            <p>{caseState.precommit?.plan}</p>
          </div>
        </details>
        <details>
          <summary>Patient record</summary>
          <RecordView slot={slot} />
        </details>
      </aside>

      <main className="floor-main">
        <div className="motion-banner">
          <span>Motion before the Floor</span>
          <p>{slot.case.motion}</p>
        </div>

        <h2 className="floor-heading">Opening contributions</h2>
        <div className="card-stack">{panelOpenings.map(card)}</div>

        <section className="negative-panel" aria-label={negativePanelLabel}>
          <div className="negative-label">{negativePanelLabel}</div>
          {negativeOpening.map(card)}
        </section>

        {proceedings.length > 0 && <h2 className="floor-heading">Proceedings</h2>}
        {proceedings.map((entry) =>
          entry.kind === "patient" ? (
            <div className="proceeding" key={entry.item.id}>
              {card(entry.item)}
            </div>
          ) : (
            <div className="proceeding" key={entry.motion.id}>
              <div className="motion-filed">
                <span>
                  {entry.motion.filedBy === "patient" ? `${slot.case.patientLabel}'s Motion, put to ` : "Chair's Motion to "}
                  {entry.motion.target === "floor" ? "the whole Floor" : studyAgentById(entry.motion.target).name}
                </span>
                <p>{entry.motion.text}</p>
              </div>
              <div className="card-stack">
                {caseState.items.filter((item) => item.motionId === entry.motion.id).map((item) =>
                  item.agentId === negativeAgentId ? (
                    <div className="negative-inline" key={item.id}>
                      <div className="negative-label small">{negativePanelLabel}</div>
                      {card(item)}
                    </div>
                  ) : (
                    card(item)
                  ),
                )}
              </div>
            </div>
          ),
        )}
      </main>

      <aside className="floor-right">
        {slot.mode === "triadic" && (
          <PatientSeat patientLabel={slot.case.patientLabel} chat={caseState.chat} onAsk={onAskPatient} />
        )}
        <MotionComposer caseState={caseState} onMotion={onMotion} />
        <MinutesPanel caseState={caseState} patientLabel={slot.case.patientLabel} onClose={onClose} />
      </aside>
    </div>
  );
}

const verdictLabel: Record<Verdict, string> = { accept: "Accepted", amend: "Amended", reject: "Rejected" };

function FloorCard({
  item,
  withdrawn,
  onRule,
  onRetry,
  onPutToPanel,
  patientLabel,
}: {
  item: FloorItem;
  withdrawn: boolean;
  onRule: (item: FloorItem, verdict: Verdict, amendedText?: string) => void;
  onRetry: (item: FloorItem) => void;
  onPutToPanel?: () => void;
  patientLabel: string;
}) {
  const [amending, setAmending] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [rerule, setRerule] = useState(false);
  const agent = item.agentId ? studyAgentById(item.agentId) : undefined;
  const isPatient = item.kind === "patient-motion";

  return (
    <article
      className={`floor-card ${agent?.negative ? "negative" : ""} ${isPatient ? "patient" : ""} ${item.ruling ? `ruled ${item.ruling.verdict}` : ""}`}
      style={agent ? ({ "--accent": agent.accent } as CSSProperties) : undefined}
    >
      <header>
        {agent ? <img src={agent.art} alt="" /> : <span className="patient-avatar">{patientLabel.slice(-1)}</span>}
        <div>
          <strong>{agent ? agent.name : `${patientLabel} (patient) files a Motion`}</strong>
          <span>{agent ? agent.stance : "The patient can see the Floor"}</span>
        </div>
        {withdrawn && <em className="withdrawn">Withdrawn: the patient is speaking for themselves</em>}
      </header>

      {item.status === "loading" && <p className="loading-line">Deliberating…</p>}
      {item.status === "error" && (
        <div className="item-error">
          <p>This contribution did not arrive. {item.error}</p>
          <button onClick={() => onRetry(item)}>Try again</button>
        </div>
      )}
      {item.status === "ready" && !amending && (
        <>
          <p className="card-text">{effectiveText(item)}</p>
          {item.ruling?.verdict === "amend" && <p className="amend-note">Amended by the Chair</p>}
        </>
      )}
      {amending && (
        <div className="amend-box">
          <textarea rows={5} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <div className="ruling-row">
            <button
              className="primary"
              disabled={!draft.trim() || draft.trim() === item.text.trim()}
              onClick={() => {
                onRule(item, "amend", draft.trim());
                setAmending(false);
                setRerule(false);
              }}
            >
              Save amendment
            </button>
            <button onClick={() => setAmending(false)}>Cancel</button>
          </div>
        </div>
      )}

      {item.status === "ready" && !amending && (
        <footer className="ruling-row">
          {item.ruling && !rerule ? (
            <>
              <span className={`verdict ${item.ruling.verdict}`}>{verdictLabel[item.ruling.verdict]}</span>
              <button className="link" onClick={() => setRerule(true)}>
                Change ruling
              </button>
            </>
          ) : (
            <>
              <button className="rule accept" onClick={() => { onRule(item, "accept"); setRerule(false); }}>
                Accept
              </button>
              <button
                className="rule amend"
                onClick={() => {
                  setDraft(effectiveText(item));
                  setAmending(true);
                }}
              >
                Amend
              </button>
              <button className="rule reject" onClick={() => { onRule(item, "reject"); setRerule(false); }}>
                Reject
              </button>
            </>
          )}
          {onPutToPanel && (
            <button className="link" onClick={onPutToPanel}>
              Put to the panel
            </button>
          )}
        </footer>
      )}
    </article>
  );
}

function MotionComposer({
  caseState,
  onMotion,
}: {
  caseState: CaseState;
  onMotion: (text: string, target: AgentKey | "floor") => void;
}) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState<AgentKey | "floor">("floor");
  const available = activeAgents(caseState);
  const pending = caseState.items.some((item) => item.status === "loading");

  return (
    <section className="side-card">
      <h3>File a Motion</h3>
      <p className="hint">Ask the panel a question or put a proposal to it.</p>
      <select value={target} onChange={(event) => setTarget(event.target.value as AgentKey | "floor")}>
        <option value="floor">The whole Floor</option>
        {studyAgents
          .filter((agent) => available.includes(agent.id))
          .map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
      </select>
      <textarea rows={3} value={text} placeholder="e.g. What would make you change your mind?" onChange={(event) => setText(event.target.value)} />
      <button
        className="primary"
        disabled={!text.trim() || pending}
        onClick={() => {
          onMotion(text.trim(), available.includes(target as AgentKey) || target === "floor" ? target : "floor");
          setText("");
        }}
      >
        {pending ? "Panel is responding…" : "File Motion"}
      </button>
    </section>
  );
}

function PatientSeat({
  patientLabel,
  chat,
  onAsk,
}: {
  patientLabel: string;
  chat: CaseState["chat"];
  onAsk: (question: string) => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const waiting = chat.some((turn) => turn.status === "loading");

  return (
    <section className="side-card patient-seat">
      <h3>{patientLabel}, the patient</h3>
      <p className="hint">Simulated patient. They can see the Floor and may file Motions. You can ask them directly.</p>
      <div className="chat">
        {chat.length === 0 && <p className="hint">No questions asked yet.</p>}
        {chat.map((turn) => (
          <p key={turn.id} className={`chat-turn ${turn.role} ${turn.status ?? ""}`}>
            <strong>{turn.role === "chair" ? "You" : patientLabel}:</strong>{" "}
            {turn.status === "loading" ? "…" : turn.text}
          </p>
        ))}
      </div>
      <textarea
        rows={2}
        value={question}
        placeholder={`Ask ${patientLabel} a question`}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && question.trim() && !waiting) {
            event.preventDefault();
            void onAsk(question.trim());
            setQuestion("");
          }
        }}
      />
      <button
        className="primary"
        disabled={!question.trim() || waiting}
        onClick={() => {
          void onAsk(question.trim());
          setQuestion("");
        }}
      >
        Ask the patient
      </button>
    </section>
  );
}

function MinutesPanel({ caseState, patientLabel, onClose }: { caseState: CaseState; patientLabel: string; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const minutes = caseState.items.filter((item) => item.ruling && item.ruling.verdict !== "reject");
  const counts = rulingCounts(caseState);

  return (
    <section className="side-card minutes">
      <h3>Minutes</h3>
      <p className="hint">Only what you accept or amend enters the Minutes.</p>
      {minutes.length === 0 ? (
        <p className="hint">Nothing accepted yet.</p>
      ) : (
        <ol>
          {minutes.map((item) => (
            <li key={item.id}>
              <strong>{item.agentId ? studyAgentById(item.agentId).shortName : patientLabel}:</strong> {effectiveText(item)}
            </li>
          ))}
        </ol>
      )}
      {confirming ? (
        <div className="confirm">
          {counts.unruled > 0 && (
            <p>
              {counts.unruled} contribution{counts.unruled === 1 ? " has" : "s have"} not been ruled on and will not enter the Minutes.
            </p>
          )}
          <button className="primary" onClick={onClose}>
            Close the Floor
          </button>
          <button onClick={() => setConfirming(false)}>Keep deliberating</button>
        </div>
      ) : (
        <button className="primary" onClick={() => setConfirming(true)}>
          Close the Floor and record my final plan
        </button>
      )}
    </section>
  );
}

// ================================================================ final & debrief

function FinalForm({
  slot,
  caseState,
  onSubmit,
}: {
  slot: CaseSlot;
  caseState: CaseState;
  onSubmit: (value: NonNullable<CaseState["final"]>) => Promise<void>;
}) {
  const prefilled = slot.planStart === "prefilled";
  const [saving, setSaving] = useState(false);
  const [diagnosis, setDiagnosis] = useState(prefilled ? caseState.precommit?.diagnosis ?? "" : "");
  const [plan, setPlan] = useState(prefilled ? caseState.precommit?.plan ?? "" : "");
  const [confidenceAfter, setConfidenceAfter] = useState<number>();
  const [change, setChange] = useState<number>();
  const [changeReason, setChangeReason] = useState("");
  const minutes = caseState.items.filter((item) => item.ruling && item.ruling.verdict !== "reject");
  const ready = diagnosis.trim() && plan.trim() && confidenceAfter && change;

  return (
    <div className="record-layout">
      <section className="record-card">
        <h2>Your pre-commitment</h2>
        <div className="precommit-locked">
          <strong>Working diagnosis</strong>
          <p>{caseState.precommit?.diagnosis}</p>
          <strong>Plan</strong>
          <p>{caseState.precommit?.plan}</p>
        </div>
        <h2>Minutes</h2>
        {minutes.length ? (
          <ol className="minutes-list">
            {minutes.map((item) => (
              <li key={item.id}>
                <strong>{item.agentId ? studyAgentById(item.agentId).shortName : slot.case.patientLabel}:</strong> {effectiveText(item)}
              </li>
            ))}
          </ol>
        ) : (
          <p className="hint">You did not accept any contributions into the Minutes.</p>
        )}
      </section>

      <section className="form-card">
        <h2>Your final diagnosis and plan</h2>
        <p>{prefilled ? "This starts from what you recorded before the panel. Edit it as you see fit." : "Write your final working diagnosis and plan."}</p>
        <label className="field">
          Working diagnosis
          <textarea rows={3} value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} />
        </label>
        <label className="field">
          Plan
          <textarea rows={6} value={plan} onChange={(event) => setPlan(event.target.value)} />
        </label>
        <fieldset className="field">
          <legend>After ruling on the panel's contributions, how confident are you in your final diagnosis and plan?</legend>
          <Scale name="confidence-after" options={confidenceOptions} value={confidenceAfter} onChange={setConfidenceAfter} />
        </fieldset>
        <fieldset className="field">
          <legend>Did the deliberation change your working diagnosis or plan?</legend>
          <Scale name="change" options={changeOptions} value={change} onChange={setChange} />
        </fieldset>
        <label className="field">
          What changed it, or why did you keep your original plan?
          <textarea rows={3} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} />
        </label>
        <button
          className="primary"
          disabled={!ready || saving}
          onClick={() => {
            setSaving(true);
            void onSubmit({
              diagnosis: diagnosis.trim(),
              plan: plan.trim(),
              confidenceAfter: confidenceAfter!,
              change: changeOptions[change! - 1],
              changeReason: changeReason.trim(),
              at: now(),
            });
          }}
        >
          {saving ? "Saving…" : "Submit and see the debrief"}
        </button>
      </section>
    </div>
  );
}

function DebriefView({
  caseIndex,
  caseState,
  isLast,
  onContinue,
}: {
  caseIndex: number;
  caseState: CaseState;
  isLast: boolean;
  onContinue: () => void;
}) {
  const [debrief, setDebrief] = useState<Debrief>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(undefined);
    let timer: number | undefined;
    const load = (triesLeft: number) =>
      fetchDebrief(caseIndex)
        .then((value) => !cancelled && setDebrief(value))
        .catch((reason) => {
          if (cancelled) return;
          // 409: the final-plan event is still on its way to the server.
          if (reason instanceof StudyApiError && reason.status === 409 && triesLeft > 0) {
            timer = window.setTimeout(() => void load(triesLeft - 1), 1500);
            return;
          }
          setError(reason instanceof Error ? reason.message : "Could not load the debrief");
        });
    void load(4);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [caseIndex, attempt]);

  const negativeItems = caseState.items.filter((item) => item.agentId === negativeAgentId && item.status === "ready");

  if (error) {
    return (
      <section className="form-card">
        <p>{error}</p>
        <button onClick={() => setAttempt((value) => value + 1)}>Try again</button>
      </section>
    );
  }
  if (!debrief) return <section className="form-card">Loading the debrief…</section>;

  return (
    <section className="form-card debrief">
      <h2>Debrief</h2>
      {debrief.draft && <p className="draft-flag">Draft reference plan: pending review by the Chief Investigator.</p>}

      <h3>The deliberately unreliable panel member</h3>
      <p>
        <strong>{debrief.negativeAgentName}.</strong> {debrief.negativePurpose}
      </p>
      {negativeItems.length > 0 && (
        <div className="negative-recap">
          {negativeItems.map((item) => (
            <blockquote key={item.id}>
              <p>{item.text}</p>
              <footer>Your ruling: {item.ruling ? verdictLabel[item.ruling.verdict].toLowerCase() : "not ruled on"}</footer>
            </blockquote>
          ))}
        </div>
      )}

      <h3>Reference assessment</h3>
      <p>{debrief.referenceAssessment}</p>
      <h3>Reference plan</h3>
      <ul>
        {debrief.referencePlan.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="caveat">{debrief.caveat}</p>
      <button className="primary" onClick={onContinue}>
        {isLast ? "Continue to the questionnaire" : "Continue to the next case"}
      </button>
    </section>
  );
}
