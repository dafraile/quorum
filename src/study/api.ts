import type { AgentKey, Contribution, Debrief, SessionPayload } from "../../shared/studyTypes";

export const studyToken = () => new URLSearchParams(window.location.search).get("t") ?? "";

export class StudyApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const post = async <T>(path: string, body: Record<string, unknown>, timeoutMs = 90_000): Promise<T> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: studyToken(), ...body }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new StudyApiError(response.status, payload.error || `Request failed (${response.status})`);
    return payload as T;
  } catch (error) {
    if (error instanceof StudyApiError) throw error;
    if (controller.signal.aborted) throw new StudyApiError(504, "The request took too long. Please try again.");
    throw new StudyApiError(0, "Connection problem. Please check your network and try again.");
  } finally {
    window.clearTimeout(timer);
  }
};

export const fetchSession = () => post<SessionPayload>("/api/study/session", {});

export const fetchStaticFloor = (caseIndex: number) =>
  post<{ contributions: Contribution[]; vetted: boolean }>("/api/study/static-floor", { caseIndex });

export const fetchContribution = (input: {
  caseIndex: number;
  agentId: AgentKey;
  requestId: string;
  motion?: { text: string; filedBy: "chair" | "patient" };
  previous?: string;
  patientUtterances?: string[];
}) => post<Contribution>("/api/study/contribution", input);

export const fetchPatientReply = (input: {
  caseIndex: number;
  question: string;
  history: Array<{ role: "chair" | "patient"; text: string }>;
  floorSummary: string[];
}) => post<{ reply: string }>("/api/study/patient", input, 60_000);

export const fetchDebrief = (caseIndex: number) => post<Debrief>("/api/study/debrief", { caseIndex });

export const markComplete = () => post<{ ok: true }>("/api/study/complete", {});

export const saveSnapshot = (snapshot: unknown) => post<{ ok: true }>("/api/study/snapshot", { snapshot }, 20_000);

// Events are sent in order through a small queue that retries on network failure,
// so a dropped connection delays the log rather than losing it.
type QueuedEvent = { type: string; caseIndex?: number; data?: unknown; clientAt: string; resolve: () => void };
const queue: QueuedEvent[] = [];
let flushing = false;

const flush = async () => {
  if (flushing) return;
  flushing = true;
  while (queue.length) {
    const next = queue[0];
    try {
      await post("/api/study/event", { type: next.type, caseIndex: next.caseIndex, data: next.data, clientAt: next.clientAt }, 20_000);
      queue.shift();
      next.resolve();
    } catch (error) {
      if (error instanceof StudyApiError && error.status >= 400 && error.status < 500) {
        queue.shift(); // rejected by the server; retrying will not help
        next.resolve();
        continue;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
    }
  }
  flushing = false;
};

/** Queues an event; the promise resolves once the server has stored it. */
export const logEvent = (type: string, data?: unknown, caseIndex?: number) =>
  new Promise<void>((resolve) => {
    queue.push({ type, caseIndex, data, clientAt: new Date().toISOString(), resolve });
    void flush();
  });
