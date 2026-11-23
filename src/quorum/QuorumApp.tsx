import { ArrowLeft, Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentKey, PublicCase, StudyMode } from "../../shared/studyTypes";
import { CaseView } from "../study/CaseView";
import type { CaseSlot, CaseState } from "../study/state";
import "../study/study.css";
import "./quorum.css";
import { applyRedactions, findRedactions, kindLabels, manualRedaction, placeholder, type Redaction } from "./anonymise";
import { budgets, customCase, freshTable, setUpTable, slotFor, studyAgents, thinkingAgents, type Budget, type TableSpec } from "./demo";

type Route = "landing" | "training" | "consult" | "thinking";

const routeOf = (path: string): Route =>
  path.startsWith("/clinical/training") ? "training" : path.startsWith("/clinical/consult") ? "consult" : path.startsWith("/thinking") ? "thinking" : "landing";

export function QuorumApp() {
  const route = routeOf(window.location.pathname);
  useEffect(() => {
    document.body.classList.toggle("body-thinking", route === "thinking");
    document.title = route === "thinking" ? "Quorum · Thinking" : route === "landing" ? "Quorum" : "Quorum · Clinical";
  }, [route]);
  if (route === "training") return <Training />;
  if (route === "consult") return <Consult />;
  if (route === "thinking") return <Thinking />;
  return <Landing />;
}

// ================================================================ landing

function Landing() {
  return (
    <div className="landing">
      <header className="landing-head">
        <span className="wordmark">Quorum</span>
        <p>A table of different minds. You chair it; you decide.</p>
      </header>
      <main className="doors">
        <section className="door door-clinical" aria-labelledby="door-clinical">
          <span className="door-kicker">Clinical</span>
          <h2 id="door-clinical">For clinicians</h2>
          <p className="door-lead">
            Put a case to a panel of clinical archetypes: an intern, an experienced nurse, a librarian, a contrarian, a patient advocate and a
            doctor who hasn't updated in years. Ask, let them argue, and rule on what goes into your plan.
          </p>
          <div className="door-faces" aria-hidden="true">
            {studyAgents.map((agent) => (
              <img key={agent.id} src={agent.art} alt="" />
            ))}
          </div>
          <div className="door-modes">
            <a className="mode-card" href="/clinical/training">
              <h3>Training</h3>
              <p>Work through hard cases, with a simulated patient in the room if you like. A reference plan waits at the end.</p>
              <span className="mode-go">Open the case library</span>
            </a>
            <a className="mode-card" href="/clinical/consult">
              <h3>Consultation</h3>
              <p>Bring your own case. It is anonymised in your browser, and you check every redaction, before anything is sent.</p>
              <span className="mode-go">Bring a case</span>
            </a>
          </div>
          <p className="door-note">A research prototype for demonstration. Not a validated clinical tool.</p>
        </section>
        <section className="door door-thinking" aria-labelledby="door-thinking">
          <span className="door-kicker">Thinking</span>
          <h2 id="door-thinking">For anyone with a question</h2>
          <p className="door-lead">
            Choose who sits at your table: the Beginner, the Maker, the Collector, the Contrarian, the Heart and the Elder. Put your question
            to them, let them argue it out, and keep what helps you decide.
          </p>
          <div className="door-faces" aria-hidden="true">
            {thinkingAgents.map((agent) => (
              <img key={agent.id} src={agent.art} alt="" />
            ))}
          </div>
          <div className="door-modes single">
            <a className="mode-card" href="/thinking">
              <h3>Bring a question</h3>
              <p>A decision, a dilemma, a plan you are unsure of. No limit on questions, unless you want one.</p>
              <span className="mode-go">Sit down at the table</span>
            </a>
          </div>
        </section>
      </main>
      <footer className="landing-foot">The GP study runs separately, by invitation, under Macquarie University ethics approval.</footer>
    </div>
  );
}

// ================================================================ the shared table page

function TablePage({
  spec,
  publicCase,
  mode,
  library,
  initial,
  startWith,
  finishLabel,
  onFinished,
  thinking = false,
}: {
  spec: TableSpec;
  publicCase: PublicCase;
  mode: StudyMode;
  library: boolean;
  initial: CaseState;
  startWith?: { diagnosis: string; plan: string; confidence: number };
  finishLabel: string;
  onFinished: () => void;
  thinking?: boolean;
}) {
  // Configure before the first render of the table.
  const ready = useRef(false);
  if (!ready.current) {
    setUpTable(spec, finishLabel);
    ready.current = true;
  }
  const [caseState, setCaseState] = useState(initial);
  const slot: CaseSlot = useMemo(() => slotFor(publicCase, mode, library), [publicCase, mode, library]);
  return (
    <div className={`study quorum-table ${thinking ? "theme-thinking" : ""}`}>
      <TopBar thinking={thinking} />
      <CaseView
        slot={slot}
        caseIndex={0}
        caseCount={1}
        caseState={caseState}
        updateCase={(updater) => setCaseState((current) => updater(current))}
        onFinished={onFinished}
        startWith={startWith}
      />
    </div>
  );
}

function TopBar({ thinking = false, back }: { thinking?: boolean; back?: { label: string; onClick: () => void } }) {
  return (
    <header className="study-header quorum-bar">
      <a className="bar-home" href="/">
        Quorum
      </a>
      <span className="study-meta">{thinking ? "Thinking" : "Clinical"}</span>
      {back ? (
        <button className="link" onClick={back.onClick}>
          <ArrowLeft size={14} /> {back.label}
        </button>
      ) : (
        <a className="link" href="/">
          Leave the table
        </a>
      )}
    </header>
  );
}

function BudgetPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <fieldset className="field budget-picker">
      <legend>Questions to the panel</legend>
      <div className="scale">
        {Object.entries(budgets).map(([key, item]) => (
          <label key={key} className={value === key ? "selected" : ""}>
            <input type="radio" name="budget" checked={value === key} onChange={() => onChange(key)} />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ================================================================ Clinical: training

type LibraryCase = PublicCase & { hasPatient: boolean };

function Training() {
  const [cases, setCases] = useState<LibraryCase[]>();
  const [error, setError] = useState<string>();
  const [withPatient, setWithPatient] = useState<Record<string, boolean>>({});
  const [budgetKey, setBudgetKey] = useState("open");
  const [chosen, setChosen] = useState<{ item: LibraryCase; mode: StudyMode; budget: Budget }>();

  useEffect(() => {
    fetch("/api/quorum/library")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not load the cases");
        setCases(payload.cases);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load the cases"));
  }, []);

  if (chosen) {
    return (
      <TablePage
        spec={{ domain: "clinical", caseId: chosen.item.id, mode: chosen.mode }}
        publicCase={chosen.item}
        mode={chosen.mode}
        library
        initial={freshTable(chosen.budget)}
        finishLabel="Back to the case library"
        onFinished={() => window.location.assign("/clinical/training")}
      />
    );
  }

  return (
    <div className="study quorum-page">
      <TopBar />
      <section className="form-card wide-card">
        <span className="rail-step">Clinical · Training</span>
        <h1>The case library</h1>
        <p className="lead">
          Hard cases from general practice. Read the record, commit to your own plan, then take it to the panel. One panel member is
          deliberately unreliable, and the debrief shows a reference plan to compare with yours.
        </p>
        <BudgetPicker value={budgetKey} onChange={setBudgetKey} />
        {error && <p className="item-error">{error}</p>}
        {!cases && !error && <p className="record-note">Loading the cases…</p>}
        <div className="library">
          {cases?.map((item) => (
            <article key={item.id} className="library-card">
              <h2>{item.title}</h2>
              <p className="library-patient">
                {item.patientLabel}
                {item.patientIntro ? `, ${item.patientIntro.charAt(0).toLowerCase()}${item.patientIntro.slice(1)}` : ""}
              </p>
              <p>{item.record.find((section) => /reason/i.test(section.heading))?.lines.join(" ") ?? item.motion}</p>
              <ul className="library-tags">
                <li>General practice</li>
                <li>Polypharmacy</li>
                <li>Hard</li>
              </ul>
              {item.hasPatient && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={withPatient[item.id] ?? true}
                    onChange={() => setWithPatient((current) => ({ ...current, [item.id]: !(current[item.id] ?? true) }))}
                  />
                  <span>{item.patientLabel} in the room, to talk to</span>
                </label>
              )}
              <button
                className="brass"
                onClick={() =>
                  setChosen({
                    item,
                    mode: item.hasPatient && (withPatient[item.id] ?? true) ? "triadic" : "dyadic",
                    budget: budgets[budgetKey].budget,
                  })
                }
              >
                Start this case
              </button>
            </article>
          ))}
        </div>
        <p className="record-note">More cases are coming, drawn from published primary-care case reports.</p>
      </section>
    </div>
  );
}

// ================================================================ Clinical: consultation (your own case)

function Consult() {
  const [step, setStep] = useState<"disclaimer" | "paste" | "review" | "table">("disclaimer");
  const [understood, setUnderstood] = useState(false);
  const [text, setText] = useState("");
  const [question, setQuestion] = useState("");
  const [redactions, setRedactions] = useState<Redaction[]>([]);
  const [released, setReleased] = useState<Set<string>>(new Set());
  const [budgetKey, setBudgetKey] = useState("open");
  const [spec, setSpec] = useState<Extract<TableSpec, { matter: { question: string; text: string; title: string } }>>();

  if (step === "table" && spec) {
    return (
      <TablePage
        spec={spec}
        publicCase={customCase(spec)}
        mode="dyadic"
        library={false}
        initial={freshTable(budgets[budgetKey].budget)}
        finishLabel="Bring another case"
        onFinished={() => window.location.assign("/clinical/consult")}
      />
    );
  }

  return (
    <div className="study quorum-page">
      <TopBar back={step === "review" ? { label: "Edit the case", onClick: () => setStep("paste") } : undefined} />
      {step === "disclaimer" && (
        <section className="form-card narrow">
          <span className="rail-step">Clinical · Consultation</span>
          <h1>Before you bring a case</h1>
          <div className="disclaimer">
            <p>
              <strong>Quorum is a research prototype shown for demonstration.</strong> It is not a validated clinical tool, not a medical
              device, and not a substitute for your own judgement or local guidance.
            </p>
            <p>
              Check what your jurisdiction, your regulator and your organisation allow before you use AI with any patient information. The
              case you type is sent to commercial AI services (OpenAI and Anthropic) to generate the panel.
            </p>
            <p>
              Your text is anonymised <strong>in this browser</strong> first, and you review every redaction before anything is sent. The
              anonymiser finds common identifiers; it can miss things. You are responsible for removing anything that could identify a
              patient.
            </p>
            <p>Nothing is stored on the server. Copy or download the record at the end if you want to keep it.</p>
          </div>
          <label className="check">
            <input type="checkbox" checked={understood} onChange={() => setUnderstood(!understood)} />
            <span>I understand, and I will not send anything that identifies a patient.</span>
          </label>
          <button className="brass big" disabled={!understood} onClick={() => setStep("paste")}>
            Continue
          </button>
        </section>
      )}

      {step === "paste" && (
        <section className="form-card narrow">
          <span className="rail-step">Clinical · Consultation</span>
          <h1>Your case</h1>
          <p className="lead">Paste or type the case as you would present it to a colleague. Keep age, sex and the clinical detail; the anonymiser takes out names, dates, identifiers and places.</p>
          <label className="field">
            The case
            <textarea rows={14} value={text} onChange={(event) => setText(event.target.value)} placeholder="73-year-old man, retired plumber. Seen today with…" />
          </label>
          <label className="field">
            What do you want the panel's help with? <span className="field-hint">optional</span>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What am I missing, and what should I do today?" />
          </label>
          <BudgetPicker value={budgetKey} onChange={setBudgetKey} />
          <button
            className="brass big"
            disabled={text.trim().length < 40}
            onClick={() => {
              setRedactions(findRedactions(text));
              setReleased(new Set());
              setStep("review");
            }}
          >
            <ShieldCheck size={18} /> Anonymise and review
          </button>
          {text.trim().length > 0 && text.trim().length < 40 && <p className="record-note">A few more lines, please: the panel needs the clinical picture.</p>}
        </section>
      )}

      {step === "review" && (
        <AnonymiseReview
          text={text}
          question={question}
          redactions={redactions}
          released={released}
          onToggle={(id) =>
            setReleased((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onAdd={(item) => setRedactions((current) => [...current, item].sort((a, b) => a.start - b.start))}
          onConfirm={() => {
            const cleanQuestion = applyRedactions(question, findRedactions(question), new Set());
            setSpec({ domain: "clinical", matter: { title: "Your case", text: applyRedactions(text, redactions, released), question: cleanQuestion.trim() } });
            setStep("table");
          }}
        />
      )}
    </div>
  );
}

function AnonymiseReview({
  text,
  question,
  redactions,
  released,
  onToggle,
  onAdd,
  onConfirm,
}: {
  text: string;
  question: string;
  redactions: Redaction[];
  released: Set<string>;
  onToggle: (id: string) => void;
  onAdd: (item: Redaction) => void;
  onConfirm: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const [pending, setPending] = useState<Redaction>();
  const bodyRef = useRef<HTMLDivElement>(null);
  const active = redactions.filter((item) => !released.has(item.id));

  const segments = useMemo(() => {
    const parts: Array<{ kind: "text"; start: number; value: string } | { kind: "mark"; item: Redaction }> = [];
    let cursor = 0;
    for (const item of redactions) {
      if (item.start > cursor) parts.push({ kind: "text", start: cursor, value: text.slice(cursor, item.start) });
      parts.push({ kind: "mark", item });
      cursor = item.end;
    }
    if (cursor < text.length) parts.push({ kind: "text", start: cursor, value: text.slice(cursor) });
    return parts;
  }, [text, redactions]);

  const captureSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !bodyRef.current) return setPending(undefined);
    const range = selection.getRangeAt(0);
    const at = (node: Node, offset: number) => {
      const element = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))?.closest<HTMLElement>("[data-start]");
      return element ? Number(element.dataset.start) + offset : undefined;
    };
    const start = at(range.startContainer, range.startOffset);
    const end = at(range.endContainer, range.endOffset);
    if (start === undefined || end === undefined) return setPending(undefined);
    setPending(manualRedaction(text, Math.min(start, end), Math.max(start, end), redactions) ?? undefined);
  };

  const counts = active.reduce<Record<string, number>>((all, item) => ({ ...all, [kindLabels[item.kind]]: (all[kindLabels[item.kind]] ?? 0) + 1 }), {});

  return (
    <section className="form-card anonymise">
      <span className="rail-step">Clinical · Consultation</span>
      <h1>Check what leaves this browser</h1>
      <p className="lead">
        Highlighted words will be replaced before the case is sent. Click a highlight to keep those words after all. Select any other words to
        remove them too.
      </p>
      <p className="anon-summary">
        <ShieldCheck size={16} /> {active.length} {active.length === 1 ? "item" : "items"} removed
        {Object.keys(counts).length > 0 && `: ${Object.entries(counts).map(([label, n]) => `${label.toLowerCase()} ${n}`).join(", ")}`}
      </p>
      <div className="anon-toolbar">
        <button className="link" onClick={() => setShowSent(!showSent)}>
          {showSent ? <EyeOff size={14} /> : <Eye size={14} />} {showSent ? "Show the highlights" : "Show exactly what will be sent"}
        </button>
      </div>
      {showSent ? (
        <pre className="anon-text sent">{applyRedactions(text, redactions, released)}</pre>
      ) : (
        <div className="anon-text" ref={bodyRef} onMouseUp={captureSelection}>
          {segments.map((part, index) =>
            part.kind === "text" ? (
              <span key={index} data-start={part.start}>
                {part.value}
              </span>
            ) : (
              <button
                key={part.item.id}
                className={`anon-mark ${released.has(part.item.id) ? "released" : ""}`}
                title={released.has(part.item.id) ? "Kept: click to remove again" : `${kindLabels[part.item.kind]}: click to keep these words`}
                onClick={() => onToggle(part.item.id)}
              >
                <span className="anon-original">{part.item.original}</span>
                {!released.has(part.item.id) && <span className="anon-placeholder">{placeholder(part.item.kind)}</span>}
              </button>
            ),
          )}
        </div>
      )}
      {pending && (
        <div className="anon-pending">
          Remove “{pending.original}”?
          <button
            className="brass"
            onClick={() => {
              onAdd(pending);
              setPending(undefined);
              window.getSelection()?.removeAllRanges();
            }}
          >
            Remove these words
          </button>
          <button onClick={() => setPending(undefined)}>Cancel</button>
        </div>
      )}
      {question.trim() && (
        <p className="record-note">
          Your question for the panel, also anonymised: “{applyRedactions(question, findRedactions(question), new Set())}”
        </p>
      )}
      <label className="check">
        <input type="checkbox" checked={checked} onChange={() => setChecked(!checked)} />
        <span>I have read the text that will be sent, and it does not identify the patient.</span>
      </label>
      <button className="brass big" disabled={!checked} onClick={onConfirm}>
        <Check size={18} /> Take it to the table
      </button>
    </section>
  );
}

// ================================================================ Thinking

const exampleQuestions = [
  "Should I take the job offer in another city?",
  "Is it time to close my side project, or give it one more year?",
  "How should I split the next five years between research and building?",
  "Should we move closer to my parents as they get older?",
];

function Thinking() {
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [leaning, setLeaning] = useState("");
  const [seats, setSeats] = useState<AgentKey[]>(thinkingAgents.map((agent) => agent.id));
  const [budgetKey, setBudgetKey] = useState("open");
  const [started, setStarted] = useState<{ spec: Extract<TableSpec, { domain: "thinking" }>; budget: Budget }>();
  const toggle = (id: AgentKey) => setSeats((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const ready = question.trim().length > 8 && seats.length >= 2;

  if (started) {
    return (
      <TablePage
        thinking
        spec={started.spec}
        publicCase={customCase(started.spec)}
        mode="dyadic"
        library={false}
        initial={freshTable(started.budget, started.spec.seats)}
        startWith={{ diagnosis: started.spec.matter.leaning, plan: "", confidence: 0 }}
        finishLabel="Ask another question"
        onFinished={() => window.location.assign("/thinking")}
      />
    );
  }

  return (
    <div className="study quorum-page theme-thinking">
      <TopBar thinking />
      <section className="form-card wide-card thinking-intake">
        <span className="rail-step">Thinking</span>
        <h1>What are you trying to think through?</h1>
        <label className="field question-field">
          <span className="sr-only">Your question</span>
          <textarea rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Put the question as plainly as you can…" />
        </label>
        <div className="examples" aria-label="Examples">
          {exampleQuestions.map((example) => (
            <button key={example} className="example" onClick={() => setQuestion(example)}>
              {example}
            </button>
          ))}
        </div>
        <div className="intake-grid">
          <label className="field">
            What the table should know <span className="field-hint">optional</span>
            <textarea rows={5} value={context} onChange={(event) => setContext(event.target.value)} placeholder="The situation, what is at stake, what you have tried…" />
          </label>
          <label className="field">
            Where you lean right now <span className="field-hint">optional, and you can change it later</span>
            <textarea rows={5} value={leaning} onChange={(event) => setLeaning(event.target.value)} placeholder="I think I should… because…" />
          </label>
        </div>

        <h2>Choose who sits at your table</h2>
        <p className="record-note">At least two, so there is someone to argue with.</p>
        <div className="seat-picker">
          {thinkingAgents.map((agent) => {
            const on = seats.includes(agent.id);
            return (
              <button key={agent.id} className={`seat-pick ${on ? "on" : ""}`} aria-pressed={on} onClick={() => toggle(agent.id)}>
                <img src={agent.art} alt="" />
                <strong>{agent.shortName}</strong>
                <span>{agent.stance}</span>
              </button>
            );
          })}
        </div>
        <BudgetPicker value={budgetKey} onChange={setBudgetKey} />
        <p className="record-note">What you type is sent to commercial AI services (OpenAI and Anthropic) to generate the table. Nothing is stored on the server.</p>
        <button
          className="brass big"
          disabled={!ready}
          onClick={() =>
            setStarted({
              spec: {
                domain: "thinking",
                matter: { title: question.trim().slice(0, 90), text: context.trim(), question: question.trim(), leaning: leaning.trim() },
                seats,
              },
              budget: budgets[budgetKey].budget,
            })
          }
        >
          Sit down at the table
        </button>
      </section>
    </div>
  );
}
