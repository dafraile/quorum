import { Pencil, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { listNames } from "./Chamber";
import { minutesOf, type CaseState, type FloorPoint, type WorkingPlan } from "./state";
import { agentById, words } from "./tableConfig";

// ================================================================ the Chair's working plan (between rounds)

const sameWorking = (a: WorkingPlan, b: WorkingPlan) => a.diagnosis === b.diagnosis && a.plan === b.plan && a.notes === b.notes;

/** Edits save when a field loses focus and when the editor closes, so nothing typed is lost. */
export function WorkingPlanEditor({ working, onSave }: { working: WorkingPlan; onSave: (next: WorkingPlan) => void }) {
  const [draft, setDraft] = useState(working);
  const latest = useRef(draft);
  latest.current = draft;
  const saved = useRef(working);
  const save = useRef(onSave);
  save.current = onSave;

  const commit = () => {
    if (sameWorking(latest.current, saved.current)) return;
    saved.current = latest.current;
    save.current(latest.current);
  };

  useEffect(() => () => commit(), []);

  const field = (key: keyof Omit<WorkingPlan, "updatedAt">) => ({
    value: draft[key],
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft((current) => ({ ...current, [key]: event.target.value })),
    onBlur: commit,
  });

  return (
    <div className="working-plan">
      <label className="field">
        {words().diagnosis}
        <textarea rows={2} {...field("diagnosis")} />
      </label>
      <label className="field">
        {words().plan}
        <textarea rows={5} {...field("plan")} />
      </label>
      <label className="field">
        Notes <span className="field-hint">for you only; the panel does not see them</span>
        <textarea rows={3} placeholder="Anything you want to remember, check or come back to…" {...field("notes")} />
      </label>
      <p className="record-note">
        {working.updatedAt
          ? `Saved at ${new Date(working.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Your locked plan stays as it was.`
          : "Starts from the plan you locked. Changes save as you go; the locked plan stays as it was."}
      </p>
    </div>
  );
}

export function WorkingPlanView({ working }: { working: WorkingPlan }) {
  return (
    <section className="locked-plan working">
      <h2>{words().workingTitle}</h2>
      <p className="record-note">As you left it at the table.</p>
      <h3>{words().diagnosis}</h3>
      <p>{working.diagnosis}</p>
      <h3>{words().plan}</h3>
      <p>{working.plan}</p>
      {working.notes.trim() && (
        <>
          <h3>Notes</h3>
          <p>{working.notes}</p>
        </>
      )}
    </section>
  );
}

// ================================================================ the Clerk's summary of the sealed Minutes

const Faces = ({ agentIds }: { agentIds: FloorPoint["agentIds"] }) => (
  <span className="floor-faces" title={listNames(agentIds.map((id) => agentById(id).shortName))}>
    {agentIds.map((id) => (
      <img key={id} src={agentById(id).art} alt="" />
    ))}
  </span>
);

export function SummarySheet({
  caseState,
  onRetry,
  onReopen,
  onToFinal,
}: {
  caseState: CaseState;
  onRetry: () => void;
  onReopen: () => void;
  onToFinal: () => void;
}) {
  const summary = caseState.summary;
  const minutes = minutesOf(caseState);

  if (!summary || summary.status === "loading") {
    return (
      <div className="summary-sheet waiting">
        <span className="paper-portrait clerk big" aria-hidden="true" />
        <p className="ledger-wait">The Minutes are sealed. The Clerk is writing them up for your plan…</p>
      </div>
    );
  }
  if (summary.status === "error") {
    return (
      <div className="summary-sheet waiting">
        <p className="ledger-wait">The Clerk could not write the summary: {summary.error}</p>
        <div className="slip-actions">
          <button className="brass" onClick={onRetry}>
            Try again
          </button>
          <button onClick={onReopen}>Reopen the rulings</button>
        </div>
      </div>
    );
  }

  return (
    <div className="summary-sheet">
      <span className="rail-step">The Minutes, sealed</span>
      <h2>The Clerk's summary</h2>
      {summary.overview && <p className="summary-overview">{summary.overview}</p>}
      {summary.points.length ? (
        <ol className="floor-points">
          {summary.points.map((point) => (
            <li key={point.id}>
              <Faces agentIds={point.agentIds} />
              <span className="floor-text">{point.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p>You carried nothing forward, so {words().finalNoun} will be yours alone.</p>
      )}
      {minutes.length > 0 && (
        <details className="summary-minutes">
          <summary>The Minutes as you sealed them ({minutes.length})</summary>
          <ol>
            {minutes.map((item) => (
              <li key={item.id}>
                <span className="minutes-who">{listNames(item.agentIds.map((id) => agentById(id).shortName))}</span>
                {item.text}
                {item.verdict === "amend" && <span className="minutes-part"> (in part)</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
      <p className="record-note">
        These points go into your final plan marked as from the Floor. You can edit or remove any of them there.
      </p>
      <div className="slip-actions">
        <button className="brass big" onClick={onToFinal}>
          Take this into my final plan
        </button>
        <button onClick={onReopen}>Reopen the rulings</button>
      </div>
    </div>
  );
}

// ================================================================ the final plan: the Floor's points, marked, plus the Chair's own

export function FloorPointsEditor({
  points,
  removed,
  onChange,
}: {
  points: FloorPoint[];
  removed: FloorPoint[];
  onChange: (points: FloorPoint[], removed: FloorPoint[]) => void;
}) {
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState("");

  const save = (point: FloorPoint) => {
    const text = draft.trim();
    onChange(
      points.map((item) => (item.id === point.id ? { ...item, text: text || item.original } : item)),
      removed,
    );
    setEditing(undefined);
  };

  return (
    <div className="from-floor">
      <span className="from-floor-label">From the Floor: the Clerk's summary of your Minutes</span>
      {points.length === 0 && removed.length === 0 && <p className="record-note">Nothing was carried forward.</p>}
      <ol className="floor-points editable">
        {points.map((point) => (
          <li key={point.id}>
            <Faces agentIds={point.agentIds} />
            {editing === point.id ? (
              <div className="floor-edit">
                <textarea rows={2} value={draft} autoFocus onChange={(event) => setDraft(event.target.value)} />
                <div className="slip-actions">
                  <button className="brass" onClick={() => save(point)}>
                    Save
                  </button>
                  <button onClick={() => setEditing(undefined)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <span className="floor-text">
                  {point.text}
                  {point.text !== point.original && <span className="floor-edited"> (edited by you)</span>}
                </span>
                <span className="floor-actions">
                  <button
                    className="icon"
                    aria-label="Edit this point"
                    title="Edit"
                    onClick={() => {
                      setEditing(point.id);
                      setDraft(point.text);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon"
                    aria-label="Remove this point from my plan"
                    title="Remove"
                    onClick={() => onChange(points.filter((item) => item.id !== point.id), [...removed, point])}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
      {removed.length > 0 && (
        <ul className="floor-removed">
          {removed.map((point) => (
            <li key={point.id}>
              <span>Removed: {point.text}</span>
              <button
                className="icon"
                aria-label="Put this point back"
                title="Put back"
                onClick={() => onChange([...points, point], removed.filter((item) => item.id !== point.id))}
              >
                <Undo2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FinalPlanView({ final }: { final: NonNullable<CaseState["final"]> }) {
  return (
    <div className="final-plan-view">
      <h3>{words().diagnosis}</h3>
      <p>{final.diagnosis}</p>
      <h3>{words().plan}</h3>
      {final.fromFloor && final.fromFloor.length > 0 && (
        <ol className="floor-points">
          {final.fromFloor.map((point) => (
            <li key={point.id}>
              <Faces agentIds={point.agentIds} />
              <span className="floor-text">{point.text}</span>
            </li>
          ))}
        </ol>
      )}
      {final.plan && <p className="own-plan">{final.plan}</p>}
    </div>
  );
}
