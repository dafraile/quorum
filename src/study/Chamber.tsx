import { ChevronLeft, ChevronRight, Pin as PinIcon, X } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cardBackArt, negativeAgentId, negativePanelLabel, studyAgentById } from "../../shared/studyRoster";
import type { AgentKey, OpeningStyle, Verdict } from "../../shared/studyTypes";
import {
  activeAgents,
  debateLineFor,
  isSpeaking,
  minutesOf,
  questionsLeft,
  roundBudget,
  roundNames,
  verdictLabels,
  type CandidateState,
  type CaseSlot,
  type CaseState,
  type Line,
  type Pin,
  type Seat,
} from "./state";

// ================================================================ shared bits

const seatOrder = (slot: CaseSlot): Array<AgentKey | "patient"> => {
  const agents: AgentKey[] = ["intern", "oldNurse", "biblioRat", "contrarian", "patientAdvocate", "oldGeezer"];
  return slot.mode === "triadic" ? [...agents.slice(0, 3), "patient", ...agents.slice(3)] : agents;
};

const seatName = (seat: Seat, slot: CaseSlot) =>
  seat === "floor" ? "The Floor" : seat === "patient" ? slot.case.patientLabel : studyAgentById(seat).name;

const shortSeatName = (seat: Seat, slot: CaseSlot) =>
  seat === "floor" ? "the Floor" : seat === "patient" ? slot.case.patientLabel : studyAgentById(seat).shortName;

/** Marks the Chair's pinned words inside a panel member's text. */
const withPins = (text: string, quotes: string[]): ReactNode => {
  const spans: Array<{ start: number; end: number }> = [];
  for (const quote of quotes) {
    const start = text.indexOf(quote);
    if (start !== -1) spans.push({ start, end: start + quote.length });
  }
  if (!spans.length) return text;
  spans.sort((a, b) => a.start - b.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, index) => {
    if (span.start < cursor) return;
    if (span.start > cursor) nodes.push(text.slice(cursor, span.start));
    nodes.push(<mark key={index}>{text.slice(span.start, span.end)}</mark>);
    cursor = span.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
};

// ================================================================ the table

type TableProps = {
  slot: CaseSlot;
  caseState: CaseState;
  style: OpeningStyle;
  onFocus: (seat: Seat) => void;
};

type Placed = { seat: AgentKey | "patient"; x: number; y: number; h: number; z: number; depth: number; front: boolean; rimX: number; rimY: number };

export function Table({ slot, caseState, style, onFocus }: TableProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 640 });

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const seats = seatOrder(slot);
  const focusIndex = Math.max(0, seats.indexOf(caseState.focus as AgentKey | "patient"));
  const floorFocused = caseState.focus === "floor";

  const { w, h } = size;
  const cx = w / 2;
  const cy = h * 0.4;
  const rx = Math.min(w * 0.4, 460);
  const ry = Math.min(rx * 0.3, h * 0.17);
  const baseH = Math.min(h * 0.5, 360, w * 0.42);

  const placed: Placed[] = seats.map((seat, index) => {
    const steps = seats.length;
    let offset = (index - focusIndex) % steps;
    if (offset > steps / 2) offset -= steps;
    if (offset < -steps / 2) offset += steps;
    const angle = (offset * 2 * Math.PI) / steps;
    const depth = (Math.cos(angle) + 1) / 2;
    const rimX = cx + rx * Math.sin(angle);
    const rimY = cy + ry * Math.cos(angle);
    const front = offset === 0 && !floorFocused;
    if (front) {
      // The card in focus steps off the rim, toward the Chair.
      return { seat, x: cx, y: h - 18, h: baseH, z: 200, depth: 1, front, rimX, rimY };
    }
    const scale = 0.36 + 0.42 * depth ** 1.3;
    return { seat, x: rimX, y: rimY + 6, h: baseH * scale, z: 10 + Math.round(depth * 100), depth, front, rimX, rimY };
  });

  const placeOf = (seat: AgentKey) => placed.find((item) => item.seat === seat);

  const arcs =
    caseState.round >= 2
      ? caseState.lines
          .filter((line) => line.kind === "debate" && line.status === "done")
          .flatMap((line) =>
            (line.stances ?? []).map((stance, index) => ({
              key: `${line.id}-${index}`,
              from: line.speaker as AgentKey,
              to: stance.agentId,
              stance: stance.stance,
            })),
          )
      : [];

  const turn = (delta: number) => {
    const next = seats[(focusIndex + delta + seats.length) % seats.length];
    onFocus(next);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) return;
      if (event.key === "ArrowLeft") turn(-1);
      if (event.key === "ArrowRight") turn(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="table-stage" ref={stageRef}>
      <div
        className="table-top"
        style={{ left: cx - rx * 1.08, top: cy - ry * 1.12, width: rx * 2.16, height: ry * 2.24 } as CSSProperties}
        aria-hidden="true"
      />

      <svg className="table-threads" width={w} height={h} aria-hidden="true">
        <defs>
          <marker id="thread-challenge" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="thread-head challenges" />
          </marker>
          <marker id="thread-back" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="thread-head backs" />
          </marker>
        </defs>
        {arcs.map((arc) => {
          const from = placeOf(arc.from);
          const to = placeOf(arc.to);
          if (!from || !to) return null;
          const strong = floorFocused || caseState.focus === arc.from || caseState.focus === arc.to;
          const bend = 0.55;
          const qx = cx + ((from.rimX + to.rimX) / 2 - cx) * (1 - bend);
          const qy = cy + ((from.rimY + to.rimY) / 2 - cy) * (1 - bend);
          return (
            <path
              key={arc.key}
              d={`M ${from.rimX} ${from.rimY} Q ${qx} ${qy} ${to.rimX} ${to.rimY}`}
              className={`thread ${arc.stance} ${strong ? "strong" : ""}`}
              markerEnd={`url(#${arc.stance === "challenges" ? "thread-challenge" : "thread-back"})`}
            />
          );
        })}
      </svg>

      <button
        className={`floor-seal ${floorFocused ? "active" : ""}`}
        style={{ left: cx, top: cy }}
        onClick={() => onFocus("floor")}
        aria-pressed={floorFocused}
      >
        <span>The Floor</span>
        <small>speak to everyone</small>
      </button>

      {placed.map((item) => (
        <SeatCard key={item.seat} item={item} slot={slot} caseState={caseState} style={style} onFocus={onFocus} />
      ))}

      <button className="turn-button left" onClick={() => turn(-1)} aria-label="Turn the table left">
        <ChevronLeft size={22} />
      </button>
      <button className="turn-button right" onClick={() => turn(1)} aria-label="Turn the table right">
        <ChevronRight size={22} />
      </button>
    </div>
  );
}

function SeatCard({
  item,
  slot,
  caseState,
  style,
  onFocus,
}: {
  item: Placed;
  slot: CaseSlot;
  caseState: CaseState;
  style: OpeningStyle;
  onFocus: (seat: Seat) => void;
}) {
  const { seat } = item;
  const isPatient = seat === "patient";
  const agent = isPatient ? undefined : studyAgentById(seat);
  const opening = isPatient ? undefined : caseState.openings[seat];
  const withdrawn = seat === "patientAdvocate" && Boolean(caseState.advocateWithdrawnAt);
  const faceDown = !isPatient && (!opening || opening.status === "loading" || withdrawn);
  const speaking = !isPatient && isSpeaking(caseState, seat);
  const patientSpeaking = isPatient && caseState.lines.some((line) => line.speaker === "patient" && line.status === "streaming");
  const pins = isPatient ? 0 : caseState.pins.filter((pin) => pin.agentId === seat).length;
  const debated = !isPatient && caseState.round >= 2 && Boolean(debateLineFor(caseState, seat)?.text);
  const showHook =
    item.front && style === "hook" && !isPatient && opening?.status === "ready" && opening.hook && !opening.heardAt && caseState.round === 1;
  const width = item.h * 0.69;

  return (
    <button
      className={`seat-card ${item.front ? "front" : ""} ${agent?.negative ? "negative" : ""} ${speaking || patientSpeaking ? "speaking" : ""} ${
        withdrawn ? "withdrawn" : ""
      } ${isPatient ? "patient" : ""}`}
      style={
        {
          left: item.x - width / 2,
          top: item.y - item.h,
          width,
          height: item.h,
          zIndex: item.z,
          "--depth": item.depth,
        } as CSSProperties
      }
      onClick={() => onFocus(seat)}
      aria-label={`${seatName(seat, slot)}${agent?.negative ? `. ${negativePanelLabel}` : ""}`}
      aria-pressed={caseState.focus === seat}
    >
      <span className={`card-flip ${faceDown ? "down" : ""}`}>
        <span className="card-face front-face">
          {isPatient ? (
            <span className="patient-face">
              <span className="patient-initial">{slot.case.patientLabel.replace(/^(Mr|Ms|Mrs|Dr)\s+/, "").slice(0, 1)}</span>
              <span className="patient-name">{slot.case.patientLabel}</span>
              <span className="patient-role">the patient, at the table</span>
            </span>
          ) : (
            <img src={agent!.art} alt="" draggable={false} />
          )}
        </span>
        <span className="card-face back-face">
          <img src={cardBackArt} alt="" draggable={false} />
          {withdrawn && <span className="withdrawn-note">Withdrawn. {slot.case.patientLabel} speaks for himself now.</span>}
          {opening?.status === "error" && !withdrawn && <span className="withdrawn-note">Could not take a seat. Open to retry.</span>}
        </span>
      </span>

      <span className="seat-plate">
        <span className="seat-name">{isPatient ? slot.case.patientLabel : agent!.shortName}</span>
        {agent?.negative && <span className="negative-ribbon">{negativePanelLabel}</span>}
      </span>

      {pins > 0 && <span className="seat-pins" aria-label={`${pins} carried forward`}>{pins}</span>}
      {debated && !item.front && <span className="seat-debated" aria-hidden="true" />}
      {showHook && <span className="hook-slip">{opening!.hook}</span>}
    </button>
  );
}

// ================================================================ the sheet (conversation)

type PaperProps = {
  slot: CaseSlot;
  caseState: CaseState;
  style: OpeningStyle;
  onAsk: (seat: Seat, text: string) => void;
  onHear: (agentId: AgentKey) => void;
  onPin: (sourceId: string, agentId: AgentKey, quote: string) => void;
  onRetryLine: (lineId: string) => void;
  onRetryOpening: (agentId: AgentKey) => void;
  onFocus: (seat: Seat) => void;
};

export function Paper({ slot, caseState, style, onAsk, onHear, onPin, onRetryLine, onRetryOpening, onFocus }: PaperProps) {
  const seat = caseState.focus;
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState<{ sourceId: string; agentId: AgentKey; text: string; x: number; y: number }>();
  const bodyRef = useRef<HTMLDivElement>(null);
  const left = questionsLeft(caseState);
  const isAgent = seat !== "floor" && seat !== "patient";
  const agent = isAgent ? studyAgentById(seat) : undefined;
  const withdrawn = seat === "patientAdvocate" && Boolean(caseState.advocateWithdrawnAt);
  const pinnedQuotes = (agentId: AgentKey) => caseState.pins.filter((pin) => pin.agentId === agentId).map((pin) => pin.quote);
  const budgetApplies = seat !== "patient";
  const canAsk = !withdrawn && (!budgetApplies || left > 0) && (seat !== "floor" || activeAgents(caseState).length > 0);
  const lineCount = caseState.lines.length;
  const lastText = caseState.lines[lineCount - 1]?.text.length ?? 0;

  useEffect(() => {
    setSelection(undefined);
    setDraft("");
  }, [seat]);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [seat, lineCount, lastText]);

  const captureSelection = () => {
    const current = window.getSelection();
    const text = current?.toString().trim() ?? "";
    if (!current || !text || current.rangeCount === 0) {
      setSelection(undefined);
      return;
    }
    const anchor = current.anchorNode instanceof Element ? current.anchorNode : current.anchorNode?.parentElement;
    const source = anchor?.closest<HTMLElement>("[data-pin-source]");
    const body = bodyRef.current;
    if (!source || !body || !source.contains(current.focusNode)) {
      setSelection(undefined);
      return;
    }
    const rect = current.getRangeAt(0).getBoundingClientRect();
    const frame = body.getBoundingClientRect();
    setSelection({
      sourceId: source.dataset.pinSource!,
      agentId: source.dataset.pinAgent as AgentKey,
      text,
      x: rect.left - frame.left + rect.width / 2,
      y: rect.top - frame.top + body.scrollTop,
    });
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || !canAsk) return;
    onAsk(seat, text);
    setDraft("");
  };

  const entries = paperEntries(caseState, seat);
  const opening = isAgent ? caseState.openings[seat] : undefined;

  return (
    <aside className={`paper ${agent?.negative ? "negative" : ""}`} aria-label={`Conversation with ${seatName(seat, slot)}`}>
      <header className="paper-head">
        {agent ? <img className="paper-portrait" src={agent.art} alt="" /> : <span className={`paper-portrait ${seat}`} aria-hidden="true" />}
        <div>
          <h2>{seatName(seat, slot)}</h2>
          <p>
            {seat === "floor"
              ? "A Motion here goes to every panel member at once and costs one question."
              : seat === "patient"
                ? `${slot.case.patientLabel} can see the table. Questions to him are free.`
                : agent!.stance}
          </p>
        </div>
      </header>
      {agent?.negative && <p className="negative-banner">{negativePanelLabel}</p>}

      <div className="paper-body" ref={bodyRef} onMouseUp={captureSelection} onKeyUp={captureSelection}>
        {isAgent && opening && (
          <OpeningEntry
            agentId={seat}
            opening={opening}
            style={style}
            pinned={pinnedQuotes(seat)}
            heardLine={caseState.lines.find((line) => line.kind === "hook-reply" && line.speaker === seat)}
            canHear={caseState.round === 1}
            onHear={() => onHear(seat)}
            onRetry={() => onRetryOpening(seat)}
            onPinAll={(quote) => onPin(`open-${seat}`, seat, quote)}
          />
        )}
        {seat === "floor" && entries.length === 0 && (
          <p className="paper-empty">
            Nothing has been put to the Floor yet. A Motion is a question or proposal for the whole panel: everyone answers in their own voice.
          </p>
        )}
        {seat === "patient" && entries.length === 0 && (
          <p className="paper-empty">
            {slot.case.patientLabel} has not said anything yet. Ask him what you would ask in the room; he answers only from what he knows.
          </p>
        )}
        {entries.map((line) => (
          <LineEntry
            key={line.id}
            line={line}
            seat={seat}
            slot={slot}
            pinned={line.speaker !== "chair" && line.speaker !== "patient" ? pinnedQuotes(line.speaker) : []}
            onPinAll={(quote) => line.speaker !== "chair" && line.speaker !== "patient" && onPin(line.id, line.speaker, quote)}
            onRetry={() => onRetryLine(line.id)}
            onFocus={onFocus}
          />
        ))}
        {selection && (
          <button
            className="pin-float"
            style={{ left: selection.x, top: selection.y }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onPin(selection.sourceId, selection.agentId, selection.text);
              window.getSelection()?.removeAllRanges();
              setSelection(undefined);
            }}
          >
            <PinIcon size={14} /> Carry these words forward
          </button>
        )}
      </div>

      {caseState.round < 3 && (
        <footer className="paper-compose">
          <textarea
            rows={2}
            value={draft}
            disabled={!canAsk}
            placeholder={
              withdrawn
                ? "The Advocate has withdrawn: the patient speaks for himself."
                : !canAsk
                  ? `No questions left this round. ${caseState.round === 1 ? "Call the debate" : "Call the synthesis"} when you are ready.`
                  : seat === "floor"
                    ? "Put a Motion to the whole Floor…"
                    : `Ask ${shortSeatName(seat, slot)}…`
            }
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <div className="compose-row">
            <span className="compose-hint">
              {seat === "patient" ? "Free" : `${left} of ${roundBudget[caseState.round as 1 | 2]} questions left in this round`}
            </span>
            <button className="brass" disabled={!canAsk || !draft.trim()} onClick={submit}>
              {seat === "floor" ? "Put to the Floor" : `Ask ${shortSeatName(seat, slot)}`}
            </button>
          </div>
        </footer>
      )}
    </aside>
  );
}

/** Lines that belong on a seat's sheet. */
const paperEntries = (caseState: CaseState, seat: Seat): Line[] => {
  const lines = caseState.lines;
  if (seat === "patient") return lines.filter((line) => line.to === "patient" || line.speaker === "patient");
  if (seat === "floor") {
    const motionIds = new Set(lines.filter((line) => line.to === "floor" || line.kind === "patient-motion").map((line) => line.motionId ?? line.id));
    return lines.filter(
      (line) =>
        line.to === "floor" ||
        (line.kind === "patient-motion" && lines.some((reply) => reply.motionId === line.id)) ||
        (line.motionId !== undefined && motionIds.has(line.motionId) && line.speaker !== "chair") ||
        line.kind === "debate",
    );
  }
  const answered = new Set(lines.filter((line) => line.speaker === seat && line.motionId).map((line) => line.motionId));
  return lines.filter(
    (line) =>
      (line.speaker === seat && line.kind !== "hook-reply") ||
      (line.speaker === "chair" && line.to === seat) ||
      (line.speaker === "chair" && line.to === "floor" && answered.has(line.motionId)) ||
      (line.kind === "patient-motion" && answered.has(line.id)),
  );
};

function OpeningEntry({
  agentId,
  opening,
  style,
  pinned,
  heardLine,
  canHear,
  onHear,
  onRetry,
  onPinAll,
}: {
  agentId: AgentKey;
  opening: NonNullable<CaseState["openings"][AgentKey]>;
  style: OpeningStyle;
  pinned: string[];
  heardLine?: Line;
  canHear: boolean;
  onHear: () => void;
  onRetry: () => void;
  onPinAll: (quote: string) => void;
}) {
  if (opening.status === "loading") return <p className="entry thinking">Taking a seat…</p>;
  if (opening.status === "error") {
    return (
      <div className="entry error">
        <p>Could not take a seat: {opening.error}</p>
        <button className="link" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  if (style === "hook") {
    return (
      <div className="entry opening hook">
        <p className="hook-line" data-pin-source={`open-${agentId}`} data-pin-agent={agentId}>
          {withPins(opening.hook, pinned)}
        </p>
        {!heardLine && canHear && (
          <button className="brass ghost" onClick={onHear}>
            Hear them out
          </button>
        )}
        {heardLine && (
          <div className="entry agent">
            <p data-pin-source={heardLine.id} data-pin-agent={agentId} className={heardLine.status === "streaming" ? "streaming" : ""}>
              {withPins(heardLine.text, pinned)}
            </p>
            {heardLine.status === "done" && <PinWhole onPin={() => onPinAll(heardLine.text)} />}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="entry opening">
      <span className="entry-label">Opening</span>
      <p data-pin-source={`open-${agentId}`} data-pin-agent={agentId}>
        {withPins(opening.answer, pinned)}
      </p>
      <PinWhole onPin={() => onPinAll(opening.answer)} />
    </div>
  );
}

function PinWhole({ onPin }: { onPin: () => void }) {
  return (
    <button className="pin-whole" onClick={onPin} title="Carry the whole point forward">
      <PinIcon size={13} /> Carry forward
    </button>
  );
}

function LineEntry({
  line,
  seat,
  slot,
  pinned,
  onPinAll,
  onRetry,
  onFocus,
}: {
  line: Line;
  seat: Seat;
  slot: CaseSlot;
  pinned: string[];
  onPinAll: (quote: string) => void;
  onRetry: () => void;
  onFocus: (seat: Seat) => void;
}) {
  const roundTag = line.round > 1 ? <span className="entry-round">{roundNames[line.round]}</span> : null;

  if (line.speaker === "chair") {
    return (
      <div className="entry chair">
        <span className="entry-label">
          You{line.to === "floor" ? ", to the Floor" : ""} {roundTag}
        </span>
        <p>{line.text}</p>
      </div>
    );
  }

  if (line.speaker === "patient") {
    return (
      <div className={`entry patient ${line.kind === "patient-motion" ? "motion" : ""}`}>
        <span className="entry-label">
          {slot.case.patientLabel}
          {line.kind === "patient-motion" ? ", raising a point" : ""}
        </span>
        {line.status === "error" ? (
          <p className="entry-error">
            No answer: {line.error}{" "}
            <button className="link" onClick={onRetry}>
              Ask again
            </button>
          </p>
        ) : (
          <p className={line.status === "streaming" ? "streaming" : ""}>{line.text || " "}</p>
        )}
      </div>
    );
  }

  const agent = studyAgentById(line.speaker);
  const showName = seat === "floor";
  return (
    <div className={`entry agent ${agent.negative ? "negative" : ""} ${line.kind === "debate" ? "debate" : ""}`}>
      <span className="entry-label">
        {showName ? (
          <button className="link" onClick={() => onFocus(line.speaker as AgentKey)}>
            {agent.shortName}
          </button>
        ) : line.kind === "debate" ? (
          "In the debate"
        ) : (
          agent.shortName
        )}{" "}
        {line.kind !== "debate" && roundTag}
      </span>
      {line.status === "error" ? (
        <p className="entry-error">
          No answer: {line.error}{" "}
          <button className="link" onClick={onRetry}>
            Ask again
          </button>
        </p>
      ) : (
        <p data-pin-source={line.id} data-pin-agent={line.speaker} className={line.status === "streaming" ? "streaming" : ""}>
          {line.text ? withPins(line.text, pinned) : line.kind === "debate" ? "Reading the proceedings…" : " "}
        </p>
      )}
      {line.stances && line.stances.length > 0 && (
        <ul className="stances">
          {line.stances.map((stance, index) => (
            <li key={index} className={stance.stance}>
              <button className="link" onClick={() => onFocus(stance.agentId)}>
                {stance.stance === "challenges" ? "Challenges" : "Backs"} {studyAgentById(stance.agentId).shortName}
              </button>
              : {stance.point}
            </li>
          ))}
        </ul>
      )}
      {line.status === "done" && line.text && <PinWhole onPin={() => onPinAll(line.text)} />}
    </div>
  );
}

// ================================================================ carried-forward tray

export function PinTray({ caseState, onUnpin }: { caseState: CaseState; onUnpin: (pin: Pin) => void }) {
  const [open, setOpen] = useState(false);
  const count = caseState.pins.length;
  return (
    <div className={`pin-tray ${open ? "open" : ""}`}>
      <button className="pin-tray-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <PinIcon size={15} /> Carrying forward <strong>{count}</strong>
      </button>
      {open && (
        <div className="pin-tray-list">
          {count === 0 ? (
            <p>Select words in any panel member's reply, or use “Carry forward”, to take a point into the synthesis.</p>
          ) : (
            <ul>
              {caseState.pins.map((pin) => (
                <li key={pin.id}>
                  <span className="pin-who">{studyAgentById(pin.agentId).shortName}</span>
                  <span className="pin-quote">“{pin.quote}”</span>
                  <button className="icon" onClick={() => onUnpin(pin)} aria-label="Stop carrying this forward">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================ round 3: synthesis

type SynthesisProps = {
  slot: CaseSlot;
  caseState: CaseState;
  onRule: (candidate: CandidateState, verdict: Verdict, amendedText?: string) => void;
  onRetry: () => void;
};

export function Ledger({ slot, caseState, onRule, onRetry }: SynthesisProps) {
  const [partial, setPartial] = useState<string>();
  const panel = useMemo(() => seatOrder(slot).filter((seat): seat is AgentKey => seat !== "patient"), [slot]);

  if (caseState.candidatesStatus === "loading") {
    return (
      <div className="ledger">
        <div className="ledger-panel">
          {panel.map((id) => (
            <img key={id} src={studyAgentById(id).art} alt="" className="ledger-face thinking" />
          ))}
        </div>
        <p className="ledger-wait">The Clerk is gathering what the panel put to you…</p>
      </div>
    );
  }
  if (caseState.candidatesStatus === "error") {
    return (
      <div className="ledger">
        <p className="ledger-wait">The Clerk could not gather the candidates: {caseState.candidatesError}</p>
        <button className="brass" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  const ruled = caseState.candidates.filter((candidate) => candidate.ruling).length;
  return (
    <div className="ledger">
      <div className="ledger-head">
        <h2>What goes into the Minutes</h2>
        <p>
          Rule on each point by talking to the Clerk, or directly here. Only what you carry forward enters the Minutes. {ruled} of{" "}
          {caseState.candidates.length} ruled.
        </p>
      </div>
      <ol className="slips">
        {caseState.candidates.map((candidate, index) => {
          const negative = candidate.agentIds.includes(negativeAgentId);
          const shown = candidate.proposed ?? candidate.ruling;
          return (
            <li
              key={candidate.id}
              className={`slip ${negative ? "negative" : ""} ${candidate.ruling ? `ruled ${candidate.ruling.verdict}` : ""} ${
                candidate.proposed ? "proposed" : ""
              }`}
            >
              <div className="slip-who">
                <span className="slip-number">{index + 1}</span>
                {candidate.agentIds.map((id) => (
                  <img key={id} src={studyAgentById(id).art} alt="" className="slip-face" />
                ))}
                <span>{candidate.agentIds.map((id) => studyAgentById(id).shortName).join(" and ")}</span>
                {candidate.origin === "pin" && <span className="slip-pinned">your pin</span>}
                {negative && <span className="slip-negative">{negativePanelLabel}</span>}
              </div>
              {candidate.summary && <p className="slip-summary">{candidate.summary}</p>}
              {partial === candidate.id ? (
                <PartialPicker
                  quote={candidate.quote}
                  onCancel={() => setPartial(undefined)}
                  onCarry={(words) => {
                    onRule(candidate, "amend", words);
                    setPartial(undefined);
                  }}
                />
              ) : (
                <blockquote className="slip-quote">“{candidate.quote}”</blockquote>
              )}
              {shown && (
                <p className={`slip-stamp ${shown.verdict} ${candidate.proposed ? "pencil" : ""}`}>
                  {candidate.proposed ? "Proposed: " : ""}
                  {verdictLabels[shown.verdict]}
                  {shown.verdict === "amend" && shown.amendedText ? `: “${shown.amendedText}”` : ""}
                </p>
              )}
              {partial !== candidate.id && (
                <div className="slip-actions">
                  <button onClick={() => onRule(candidate, "accept")} aria-pressed={candidate.ruling?.verdict === "accept"}>
                    Carry forward
                  </button>
                  <button onClick={() => setPartial(candidate.id)} aria-pressed={candidate.ruling?.verdict === "amend"}>
                    In part…
                  </button>
                  <button onClick={() => onRule(candidate, "reject")} aria-pressed={candidate.ruling?.verdict === "reject"}>
                    Leave out
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PartialPicker({ quote, onCancel, onCarry }: { quote: string; onCancel: () => void; onCarry: (words: string) => void }) {
  const [words, setWords] = useState("");
  const capture = () => {
    const text = window.getSelection()?.toString().trim() ?? "";
    if (text && quote.includes(text)) setWords(text);
  };
  return (
    <div className="partial">
      <p className="partial-help">Select the words to carry forward.</p>
      <blockquote className="slip-quote selectable" onMouseUp={capture} onKeyUp={capture}>
        “{quote}”
      </blockquote>
      <div className="slip-actions">
        <button className="brass" disabled={!words} onClick={() => onCarry(words)}>
          {words ? `Carry “${words.length > 40 ? `${words.slice(0, 40)}…` : words}”` : "Carry the selected words"}
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function ClerkPaper({
  caseState,
  onSend,
  onConfirm,
  onDiscard,
  onSeal,
}: {
  caseState: CaseState;
  onSend: (text: string) => void;
  onConfirm: () => void;
  onDiscard: () => void;
  onSeal: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sealing, setSealing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const proposals = caseState.candidates.filter((candidate) => candidate.proposed).length;
  const unruled = caseState.candidates.filter((candidate) => !candidate.ruling).length;
  const busy = caseState.clerk.some((turn) => turn.status === "loading");
  const minutes = minutesOf(caseState);
  const ready = caseState.candidatesStatus === "ready";

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [caseState.clerk.length, busy]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy || !ready) return;
    onSend(text);
    setDraft("");
  };

  return (
    <aside className="paper clerk" aria-label="Conversation with the Clerk">
      <header className="paper-head">
        <span className="paper-portrait clerk" aria-hidden="true" />
        <div>
          <h2>The Clerk</h2>
          <p>Keeps the record and has no opinion. Tell it what to carry forward, in your own words.</p>
        </div>
      </header>
      <div className="paper-body" ref={bodyRef}>
        <div className="entry agent">
          <span className="entry-label">Clerk</span>
          <p>
            Chair, the points are on the table. You might say “carry the Nurse's and the Intern's points, leave out the rest”, or rule
            on each one directly.
          </p>
        </div>
        {caseState.clerk.map((turn) => (
          <div key={turn.id} className={`entry ${turn.speaker === "chair" ? "chair" : "agent"}`}>
            <span className="entry-label">{turn.speaker === "chair" ? "You" : "Clerk"}</span>
            <p className={turn.status === "loading" ? "streaming" : ""}>{turn.status === "loading" ? "Noting…" : turn.text}</p>
          </div>
        ))}
        {proposals > 0 && (
          <div className="proposal-bar">
            <p>
              {proposals} proposed {proposals === 1 ? "ruling" : "rulings"} pencilled in on the table.
            </p>
            <div className="slip-actions">
              <button className="brass" onClick={onConfirm}>
                Confirm {proposals === 1 ? "it" : "them"}
              </button>
              <button onClick={onDiscard}>Discard</button>
            </div>
          </div>
        )}
      </div>
      <footer className="paper-compose">
        <textarea
          rows={2}
          value={draft}
          disabled={!ready || busy}
          placeholder="Tell the Clerk what to carry forward…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="compose-row">
          <span className="compose-hint">{minutes.length} in the Minutes so far</span>
          <button className="brass" disabled={!draft.trim() || busy || !ready} onClick={submit}>
            Tell the Clerk
          </button>
        </div>
        <div className="seal-row">
          {sealing ? (
            <>
              <p>
                {unruled > 0 ? `${unruled} not ruled on will be left out. ` : ""}Seal the Minutes with {minutes.length}{" "}
                {minutes.length === 1 ? "point" : "points"}?
              </p>
              <div className="slip-actions">
                <button className="brass" onClick={onSeal}>
                  Seal the Minutes
                </button>
                <button onClick={() => setSealing(false)}>Not yet</button>
              </div>
            </>
          ) : (
            <button className="seal" disabled={!ready || proposals > 0} onClick={() => setSealing(true)}>
              Seal the Minutes and record my final plan
            </button>
          )}
        </div>
      </footer>
    </aside>
  );
}
