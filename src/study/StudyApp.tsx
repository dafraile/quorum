import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { SessionPayload } from "../../shared/studyTypes";
import { fetchSession, logEvent, markComplete, saveSnapshot, studyToken } from "./api";
import { CaseView } from "./CaseView";
import {
  consentStatements,
  demographicFreeText,
  demographicItems,
  picfSections,
  pilotItems,
  pilotPlanStartItem,
  questionnaireSections,
  type QuestionItem,
} from "./content";
import { initialStudyState, newCaseState, restoreSnapshot, type CaseState, type StudyState } from "./state";
import "./study.css";

export function StudyApp() {
  const [session, setSession] = useState<SessionPayload>();
  const [state, setState] = useState<StudyState>();
  const [loadError, setLoadError] = useState<string>();
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!studyToken()) {
      setLoadError("This page needs a personal study link. Please use the link the research team sent you.");
      return;
    }
    fetchSession()
      .then((payload) => {
        setSession(payload);
        setState(restoreSnapshot(payload.snapshot) ?? initialStudyState());
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Could not load the study session"));
  }, []);

  // Save a resume snapshot shortly after every change, and immediately when the tab is hidden.
  useEffect(() => {
    if (!state) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveSnapshot(state).catch(() => undefined), 600);
    const onHide = () => {
      if (document.visibilityState === "hidden") void saveSnapshot(state).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [state]);

  const update = useCallback((updater: (current: StudyState) => StudyState) => {
    setState((current) => (current ? updater(current) : current));
  }, []);

  const updateCase = useCallback(
    (caseIndex: number) => (updater: (current: CaseState) => CaseState) =>
      update((current) => ({
        ...current,
        cases: current.cases.map((item, index) => (index === caseIndex ? updater(item) : item)),
      })),
    [update],
  );

  if (loadError) return <Shell><section className="form-card"><p>{loadError}</p></section></Shell>;
  if (!session || !state) return <Shell><section className="form-card">Loading…</section></Shell>;

  const caseCount = session.sequence.length;

  const startCase = (caseIndex: number) => {
    update((current) => ({
      ...current,
      step: "case",
      caseIndex,
      cases: current.cases[caseIndex] ? current.cases : [...current.cases, newCaseState()],
    }));
    const slot = session.sequence[caseIndex];
    void logEvent("case_started", { caseId: slot.caseId, mode: slot.mode, floorSource: slot.floorSource, planStart: slot.planStart, position: caseIndex + 1 }, caseIndex);
  };

  const stopSession = () => {
    void logEvent("session_stopped", { step: state.step, caseIndex: state.caseIndex });
    update((current) => ({ ...current, step: "stopped" }));
  };

  const header = (
    <StudyHeader
      participantId={session.participantId}
      pilot={session.pilot}
      canStop={!["done", "stopped", "declined"].includes(state.step)}
      onStop={stopSession}
    />
  );

  switch (state.step) {
    case "welcome":
      return (
        <Shell header={header}>
          <section className="form-card narrow">
            <h1>Quorum</h1>
            <p>
              Thank you for taking part. In this session you will chair a panel of AI agents discussing two fictional patients. Before
              each discussion you record your own working diagnosis and plan; then you rule on what the panel says, and finish with a
              short questionnaire. It takes about 30 minutes.
            </p>
            <p>Please do not type any real patient information at any point.</p>
            <button
              className="primary"
              onClick={() => {
                void logEvent("welcome_continued");
                update((current) => ({ ...current, step: session.showConsent ? "consent" : "demographics" }));
              }}
            >
              Begin
            </button>
          </section>
        </Shell>
      );

    case "consent":
      return (
        <Shell header={header}>
          <ConsentStep
            onAgree={() => {
              void logEvent("consent_agreed", { statements: consentStatements });
              update((current) => ({ ...current, step: "demographics", consentAt: new Date().toISOString() }));
            }}
            onDecline={() => {
              void logEvent("consent_declined");
              update((current) => ({ ...current, step: "declined" }));
            }}
          />
        </Shell>
      );

    case "declined":
      return (
        <Shell header={header}>
          <section className="form-card narrow">
            <h2>Thank you</h2>
            <p>You have chosen not to take part. Nothing further will be recorded, and you can close this window.</p>
          </section>
        </Shell>
      );

    case "demographics":
      return (
        <Shell header={header}>
          <DemographicsStep
            onSubmit={(answers) => {
              void logEvent("demographics_submitted", answers);
              update((current) => ({ ...current, demographics: answers }));
              startCase(0);
            }}
          />
        </Shell>
      );

    case "case": {
      const caseIndex = state.caseIndex;
      const caseState = state.cases[caseIndex];
      if (!caseState) {
        return (
          <Shell header={header}>
            <section className="form-card narrow">
              <button className="primary" onClick={() => startCase(caseIndex)}>
                Start case {caseIndex + 1}
              </button>
            </section>
          </Shell>
        );
      }
      return (
        <Shell header={header}>
          <CaseView
            key={caseIndex}
            slot={session.sequence[caseIndex]}
            caseIndex={caseIndex}
            caseCount={caseCount}
            caseState={caseState}
            updateCase={updateCase(caseIndex)}
            onFinished={() => {
              if (caseIndex + 1 < caseCount) startCase(caseIndex + 1);
              else update((current) => ({ ...current, step: "questionnaire" }));
            }}
          />
        </Shell>
      );
    }

    case "questionnaire": {
      const planStarts = new Set(session.sequence.map((slot) => slot.planStart));
      const extra: QuestionItem[] = session.pilot
        ? [...(planStarts.size > 1 ? [pilotPlanStartItem] : []), ...pilotItems]
        : [];
      return (
        <Shell header={header}>
          <QuestionnaireStep
            extraItems={extra}
            onSubmit={async (answers) => {
              await logEvent("questionnaire_submitted", answers);
              await markComplete().catch(() => undefined);
              update((current) => ({ ...current, step: "done", questionnaire: answers }));
            }}
          />
        </Shell>
      );
    }

    case "stopped":
      return (
        <Shell header={header}>
          <section className="form-card narrow">
            <h2>Session stopped</h2>
            <p>You have stopped the session. Your incomplete session data will be deleted. Thank you for your time.</p>
          </section>
        </Shell>
      );

    case "done":
      return (
        <Shell header={header}>
          <section className="form-card narrow">
            <h2>Thank you</h2>
            <p>
              Your session is complete. A member of the research team will talk with you about the optional follow-up interview and
              your voucher.
            </p>
          </section>
        </Shell>
      );
  }
}

function Shell({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <div className="study">
      {header}
      {children}
    </div>
  );
}

function StudyHeader({
  participantId,
  pilot,
  canStop,
  onStop,
}: {
  participantId: string;
  pilot: boolean;
  canStop: boolean;
  onStop: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <header className="study-header">
      <strong>Quorum</strong>
      <span className="study-meta">
        Participant {participantId}
        {pilot ? " · pilot" : ""}
      </span>
      {canStop &&
        (confirm ? (
          <span className="stop-confirm">
            Stop now? Incomplete sessions are deleted.
            <button onClick={onStop}>Yes, stop</button>
            <button onClick={() => setConfirm(false)}>No, continue</button>
          </span>
        ) : (
          <button className="link" onClick={() => setConfirm(true)}>
            Stop the session
          </button>
        ))}
    </header>
  );
}

function ConsentStep({ onAgree, onDecline }: { onAgree: () => void; onDecline: () => void }) {
  const [checked, setChecked] = useState<boolean[]>(consentStatements.map(() => false));
  return (
    <section className="form-card narrow consent">
      <h1>Participant information and consent</h1>
      {picfSections.map((section) => (
        <div key={section.heading}>
          <h3>{section.heading}</h3>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </div>
      ))}
      <h3>Consent</h3>
      {consentStatements.map((statement, index) => (
        <label key={statement} className="check">
          <input
            type="checkbox"
            checked={checked[index]}
            onChange={() => setChecked((current) => current.map((value, i) => (i === index ? !value : value)))}
          />
          <span>{statement}</span>
        </label>
      ))}
      <div className="button-row">
        <button className="primary" disabled={!checked.every(Boolean)} onClick={onAgree}>
          Agree
        </button>
        <button onClick={onDecline}>I do not agree</button>
      </div>
    </section>
  );
}

function ChoiceField({
  item,
  value,
  onChange,
}: {
  item: { id: string; label: string; options: string[] };
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="field">
      <legend>{item.label}</legend>
      <div className="scale wrap">
        {item.options.map((option) => (
          <label key={option} className={value === option ? "selected" : ""}>
            <input type="radio" name={item.id} checked={value === option} onChange={() => onChange(option)} />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function DemographicsStep({ onSubmit }: { onSubmit: (answers: Record<string, string>) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const set = (id: string, value: string) => setAnswers((current) => ({ ...current, [id]: value }));
  return (
    <section className="form-card narrow">
      <h1>About you</h1>
      <p className="hint">All questions are optional.</p>
      {demographicItems.map((item) => (
        <ChoiceField key={item.id} item={item} value={answers[item.id]} onChange={(value) => set(item.id, value)} />
      ))}
      <label className="field">
        {demographicFreeText.label}
        <input value={answers[demographicFreeText.id] ?? ""} onChange={(event) => set(demographicFreeText.id, event.target.value)} />
      </label>
      <button className="primary" onClick={() => onSubmit(answers)}>
        Continue to the first case
      </button>
    </section>
  );
}

function QuestionnaireStep({
  extraItems,
  onSubmit,
}: {
  extraItems: QuestionItem[];
  onSubmit: (answers: Record<string, string>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (id: string, value: string) => setAnswers((current) => ({ ...current, [id]: value }));
  const sections = extraItems.length ? [...questionnaireSections, { heading: "Pilot questions", items: extraItems }] : questionnaireSections;

  return (
    <section className="form-card narrow">
      <h1>Questionnaire</h1>
      <p className="hint">About your experience across both cases.</p>
      {sections.map((section) => (
        <div key={section.heading} className="question-section">
          <h2>{section.heading}</h2>
          {section.items.map((item) => (
            <div key={item.id} className="question">
              {item.options ? (
                <ChoiceField item={item} value={answers[item.id]} onChange={(value) => set(item.id, value)} />
              ) : (
                <p className="question-label">{item.label}</p>
              )}
              {item.text && (
                <label className="field">
                  <span className="hint">{item.text}</span>
                  <textarea rows={2} value={answers[`${item.id}_text`] ?? ""} onChange={(event) => set(`${item.id}_text`, event.target.value)} />
                </label>
              )}
            </div>
          ))}
        </div>
      ))}
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onSubmit(answers);
        }}
      >
        {busy ? "Saving…" : "Submit questionnaire"}
      </button>
    </section>
  );
}
