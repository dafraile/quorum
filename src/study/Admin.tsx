import { useEffect, useState } from "react";
import { studyAgentById } from "../../shared/studyRoster";
import type { AgentKey, FloorSource, ParticipantConfig, PlanStart } from "../../shared/studyTypes";
import "./study.css";

type ParticipantRow = ParticipantConfig & {
  token: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
};

const tokenKey = "quorum-study-admin-token";

const readStoredToken = () => {
  try {
    return window.sessionStorage.getItem(tokenKey) ?? "";
  } catch {
    return "";
  }
};

const adminFetch = async (path: string, token: string, init?: RequestInit) => {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
};

export function StudyAdmin() {
  const [token, setToken] = useState(readStoredToken);
  const [draftToken, setDraftToken] = useState("");
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [pilot, setPilot] = useState(true);
  const [label, setLabel] = useState("");
  const [showConsent, setShowConsent] = useState(true);
  const [floorSources, setFloorSources] = useState<FloorSource[]>(["static", "static"]);
  const [planStarts, setPlanStarts] = useState<Array<PlanStart | "random">>(["random", "random"]);
  const [allocation, setAllocation] = useState<"auto" | "0" | "1" | "2" | "3">("auto");
  const [confirmDelete, setConfirmDelete] = useState<string>();

  const refresh = async (activeToken = token) => {
    if (!activeToken) return;
    try {
      const payload = await adminFetch("/api/study/admin/participants", activeToken);
      setRows(payload.participants);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load participants");
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) {
    return (
      <div className="study">
        <section className="form-card narrow">
          <h1>Quorum study: researcher console</h1>
          <label className="field">
            Admin token (STUDY_ADMIN_TOKEN)
            <input type="password" value={draftToken} onChange={(event) => setDraftToken(event.target.value)} />
          </label>
          <button
            className="primary"
            disabled={!draftToken}
            onClick={() => {
              try {
                window.sessionStorage.setItem(tokenKey, draftToken);
              } catch {
                // Session storage unavailable: keep the token in memory only.
              }
              setToken(draftToken);
            }}
          >
            Open console
          </button>
        </section>
      </div>
    );
  }

  const linkFor = (row: ParticipantRow) => `${window.location.origin}/study?t=${row.token}`;

  const create = async () => {
    setNotice(undefined);
    const randomPlan = planStarts.includes("random");
    try {
      const created = await adminFetch("/api/study/admin/participants", token, {
        method: "POST",
        body: JSON.stringify({
          pilot,
          label: label || undefined,
          showConsent,
          floorSources,
          planStarts: randomPlan ? undefined : planStarts,
          allocation: allocation === "auto" ? undefined : Number(allocation),
        }),
      });
      setNotice(`Created ${created.participantId}.`);
      setLabel("");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create participant");
    }
  };

  const exportAll = async () => {
    try {
      const payload = await adminFetch("/api/study/admin/export", token);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `quorum-study-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Export failed");
    }
  };

  const remove = async (body: { participantId?: string; scope?: "incomplete" }) => {
    try {
      const payload = await adminFetch("/api/study/admin/delete", token, { method: "POST", body: JSON.stringify(body) });
      setNotice(`Deleted ${payload.deleted.join(", ")}.`);
      setConfirmDelete(undefined);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Delete failed");
    }
  };

  const mixSummary = (row: ParticipantRow) =>
    (Object.entries(row.providerMix) as Array<[AgentKey, string]>)
      .map(([agent, provider]) => `${studyAgentById(agent).shortName}: ${provider === "openai" ? "OpenAI" : "Anthropic"}`)
      .join(" · ");

  return (
    <div className="study admin">
      <header className="study-header">
        <strong>Quorum study: researcher console</strong>
        <span className="study-meta">{rows.length} participants</span>
        <button
          className="link"
          onClick={() => {
            try {
              window.sessionStorage.removeItem(tokenKey);
            } catch {
              // ignore
            }
            setToken("");
          }}
        >
          Sign out
        </button>
      </header>

      {error && <p className="item-error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <section className="form-card">
        <h2>New participant link</h2>
        <div className="admin-grid">
          <label className="check">
            <input type="checkbox" checked={pilot} onChange={() => setPilot(!pilot)} />
            <span>Pilot / test user (IDs T01…; adds pilot questions)</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={showConsent} onChange={() => setShowConsent(!showConsent)} />
            <span>Show consent form</span>
          </label>
          <label className="field">
            Label (no names or identifiers)
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. pilot round 1" />
          </label>
          <label className="field">
            Counterbalanced sequence
            <select value={allocation} onChange={(event) => setAllocation(event.target.value as typeof allocation)}>
              <option value="auto">Next in block-randomised allocation</option>
              <option value="0">0: case A dyadic → case B triadic</option>
              <option value="1">1: case A triadic → case B dyadic</option>
              <option value="2">2: case B dyadic → case A triadic</option>
              <option value="3">3: case B triadic → case A dyadic</option>
            </select>
          </label>
          {[0, 1].map((position) => (
            <div key={position} className="field">
              <span>Case {position + 1}</span>
              <select
                value={floorSources[position]}
                onChange={(event) =>
                  setFloorSources((current) => current.map((value, index) => (index === position ? (event.target.value as FloorSource) : value)))
                }
              >
                <option value="static">Opening Floor: static (vetted, Opus)</option>
                <option value="live">Opening Floor: live (OpenAI/Anthropic mix)</option>
              </select>
              <select
                value={planStarts[position]}
                onChange={(event) =>
                  setPlanStarts((current) =>
                    current.map((value, index) => (index === position ? (event.target.value as PlanStart | "random") : value)),
                  )
                }
              >
                <option value="random">Final plan box: random (pilot: one of each)</option>
                <option value="prefilled">Final plan box: pre-filled</option>
                <option value="blank">Final plan box: blank</option>
              </select>
            </div>
          ))}
        </div>
        <button className="primary" onClick={() => void create()}>
          Create participant link
        </button>
      </section>

      <section className="form-card">
        <div className="button-row">
          <h2>Participants</h2>
          <button onClick={() => void refresh()}>Refresh</button>
          <button onClick={() => void exportAll()}>Export all (JSON)</button>
          {confirmDelete === "incomplete" ? (
            <>
              <button className="danger" onClick={() => void remove({ scope: "incomplete" })}>
                Confirm: delete all incomplete sessions
              </button>
              <button onClick={() => setConfirmDelete(undefined)}>Cancel</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete("incomplete")}>Delete incomplete sessions…</button>
          )}
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Sequence</th>
              <th>Live provider mix</th>
              <th>Link</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.participantId}>
                <td>
                  <strong>{row.participantId}</strong>
                  {row.label && <div className="hint">{row.label}</div>}
                </td>
                <td>{row.status}</td>
                <td>
                  {row.sequence.map((slot, index) => (
                    <div key={index}>
                      {index + 1}. {slot.caseId} · {slot.mode} · {slot.floorSource} · {slot.planStart}
                    </div>
                  ))}
                </td>
                <td className="hint">{mixSummary(row)}</td>
                <td>
                  <button onClick={() => void navigator.clipboard.writeText(linkFor(row)).then(() => setNotice(`Copied link for ${row.participantId}.`))}>
                    Copy link
                  </button>
                </td>
                <td>
                  {confirmDelete === row.participantId ? (
                    <>
                      <button className="danger" onClick={() => void remove({ participantId: row.participantId })}>
                        Delete
                      </button>
                      <button onClick={() => setConfirmDelete(undefined)}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelete(row.participantId)}>Withdraw…</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
