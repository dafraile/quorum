import { Bookmark, ChevronLeft, ChevronRight, Pencil, Square, Trash2, Volume2, X } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cardBackArt, negativeAgentId, negativePanelLabel, studyAgentById } from "../../shared/studyRoster";
import type { AgentKey, OpeningStyle, Verdict } from "../../shared/studyTypes";
import { Glance } from "./Glance";
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

/** The panel in seating order. The patient is not a card: they have their own pane. */
const panelOrder: AgentKey[] = ["intern", "oldNurse", "biblioRat", "contrarian", "patientAdvocate", "oldGeezer"];

const seatName = (seat: Seat, slot: CaseSlot) =>
  seat === "floor" ? "The Floor" : seat === "patient" ? slot.case.patientLabel : studyAgentById(seat).name;

export const listNames = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** He, she or they for the case's (fictional) patient, from the title on the record. */
export const patientPronouns = (label: string) =>
  /^(Ms|Mrs|Miss)\b/.test(label)
    ? { subject: "she", object: "her", reflexive: "herself" }
    : /^Mr\b/.test(label)
      ? { subject: "he", object: "him", reflexive: "himself" }
      : { subject: "they", object: "them", reflexive: "themself" };

const bulletPattern = /^[•\-*]\s+/;

/** Plain text of a reply, for highlighting, reading aloud and quoting. */
export const plainReply = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim().replace(bulletPattern, ""))
    .filter(Boolean)
    .join(" ");

/** Marks the Chair's kept words inside a panel member's text. */
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

/** A reply written as "• " points renders as a list with the first (key) point in bold; anything else as paragraphs. */
function ReplyText({ text, pinned, streaming }: { text: string; pinned: string[]; streaming?: boolean }) {
  const wholeKept = pinned.some((quote) => quote === text || quote === plainReply(text));
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: ReactNode[] = [];
  let points: string[] = [];
  const flush = () => {
    if (!points.length) return;
    blocks.push(
      <ul className="reply-points" key={`ul-${blocks.length}`}>
        {points.map((point, index) => (
          <li key={index}>{withPins(point, pinned)}</li>
        ))}
      </ul>,
    );
    points = [];
  };
  for (const line of lines) {
    if (bulletPattern.test(line)) points.push(line.replace(bulletPattern, ""));
    else {
      flush();
      blocks.push(<p key={`p-${blocks.length}`}>{withPins(line, pinned)}</p>);
    }
  }
  flush();
  return <div className={`reply-text ${streaming ? "streaming" : ""} ${wholeKept ? "kept-all" : ""}`}>{blocks.length ? blocks : " "}</div>;
}

/** Reads a reply aloud with the browser's own voice (nothing is sent anywhere). */
function SpeakButton({ text, onListen }: { text: string; onListen?: () => void }) {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  useEffect(
    () => () => {
      if (speaking && supported) window.speechSynthesis.cancel();
    },
    [speaking, supported],
  );
  if (!supported) return null;
  const toggle = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(plainReply(text));
    const voices = synth.getVoices();
    const voice = voices.find((item) => /en[-_](AU|GB)/i.test(item.lang)) ?? voices.find((item) => item.lang.startsWith("en"));
    if (voice) utterance.voice = voice;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
    onListen?.();
  };
  return (
    <button className="reply-action" onClick={toggle} aria-label={speaking ? "Stop reading aloud" : "Read aloud"}>
      {speaking ? <Square size={12} /> : <Volume2 size={13} />} {speaking ? "Stop" : "Listen"}
    </button>
  );
}

function KeepButton({ onKeep, kept }: { onKeep: () => void; kept: boolean }) {
  return (
    <button className={`reply-action keep ${kept ? "kept" : ""}`} onClick={onKeep} disabled={kept} title="Keep this point for the synthesis">
      <Bookmark size={13} /> {kept ? "Kept" : "Keep"}
    </button>
  );
}

/** Keeps track of words the Chair selects inside a scrolling body, to offer "Keep these words". */
const useSelectionKeep = (bodyRef: React.RefObject<HTMLDivElement | null>) => {
  const [selection, setSelection] = useState<{ sourceId: string; agentId: AgentKey; text: string; x: number; y: number }>();
  const capture = () => {
    const current = window.getSelection();
    const text = (current?.toString() ?? "").replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
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
  return { selection, setSelection, capture };
};

function KeepFloat({
  selection,
  onPin,
  clear,
}: {
  selection: { sourceId: string; agentId: AgentKey; text: string; x: number; y: number };
  onPin: (sourceId: string, agentId: AgentKey, quote: string) => void;
  clear: () => void;
}) {
  return (
    <button
      className="pin-float"
      style={{ left: selection.x, top: selection.y }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        onPin(selection.sourceId, selection.agentId, selection.text);
        window.getSelection()?.removeAllRanges();
        clear();
      }}
    >
      <Bookmark size={14} /> Keep these words
    </button>
  );
}

// ================================================================ the table

type TableProps = {
  slot: CaseSlot;
  caseState: CaseState;
  style: OpeningStyle;
  /** Which window is open over the table: a panel member's card turned over, or the Floor. */
  open?: AgentKey | "floor";
  seen: Partial<Record<AgentKey, number>>;
  onOpen: (seat: AgentKey | "floor") => void;
  onTurn: (seat: AgentKey) => void;
  children?: ReactNode;
};

type Placed = { seat: AgentKey; x: number; y: number; h: number; z: number; depth: number; front: boolean; rimX: number; rimY: number };

export function Table({ slot, caseState, style, open, seen, onOpen, onTurn, children }: TableProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 640 });

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const seats = panelOrder;
  const focused = caseState.focus === "floor" || caseState.focus === "patient" ? undefined : caseState.focus;
  const focusIndex = Math.max(0, focused ? seats.indexOf(focused) : 0);
  const floorFocused = caseState.focus === "floor";

  const { w, h } = size;
  const cx = w / 2;
  const cy = h * 0.36;
  const rx = Math.min(w * 0.4, 460);
  const ry = Math.min(rx * 0.3, h * 0.17);
  const baseH = Math.min(h * 0.47, 370, w * 0.42);

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

  const turn = (delta: number) => onTurn(seats[(focusIndex + delta + seats.length) % seats.length]);

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

  const unread = (seat: AgentKey) =>
    caseState.lines.filter((line) => line.speaker === seat && line.status === "done" && Date.parse(line.at) > (seen[seat] ?? 0)).length;

  return (
    <div className={`table-stage ${open ? "window-open" : ""}`} ref={stageRef}>
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
        onClick={() => onOpen("floor")}
        aria-pressed={open === "floor"}
      >
        <span>The Floor</span>
        <small>ask everyone</small>
      </button>

      {placed.map((item, index) => (
        <SeatCard
          key={item.seat}
          item={item}
          dealIndex={index}
          slot={slot}
          caseState={caseState}
          style={style}
          lifted={open === item.seat}
          unread={open === item.seat ? 0 : unread(item.seat)}
          onOpen={() => onOpen(item.seat)}
        />
      ))}

      <button className="turn-button left" onClick={() => turn(-1)} aria-label="Turn the table left">
        <ChevronLeft size={22} />
      </button>
      <button className="turn-button right" onClick={() => turn(1)} aria-label="Turn the table right">
        <ChevronRight size={22} />
      </button>

      {children}
    </div>
  );
}

function SeatCard({
  item,
  dealIndex,
  slot,
  caseState,
  style,
  lifted,
  unread,
  onOpen,
}: {
  item: Placed;
  dealIndex: number;
  slot: CaseSlot;
  caseState: CaseState;
  style: OpeningStyle;
  lifted: boolean;
  unread: number;
  onOpen: () => void;
}) {
  const { seat } = item;
  const agent = studyAgentById(seat);
  const opening = caseState.openings[seat];
  const withdrawn = seat === "patientAdvocate" && Boolean(caseState.advocateWithdrawnAt);
  const faceDown = !opening || opening.status === "loading" || withdrawn;
  const speaking = isSpeaking(caseState, seat);
  const pins = caseState.pins.filter((pin) => pin.agentId === seat).length;
  const debated = caseState.round >= 2 && Boolean(debateLineFor(caseState, seat)?.text);
  const showHook = item.front && !lifted && style === "hook" && opening?.status === "ready" && opening.hook && !opening.heardAt && caseState.round === 1;
  const width = item.h * 0.69;
  const pronoun = patientPronouns(slot.case.patientLabel);

  return (
    <button
      className={`seat-card ${item.front ? "front" : ""} ${item.depth < 0.4 ? "far" : ""} ${agent.negative ? "negative" : ""} ${speaking ? "speaking" : ""} ${
        withdrawn ? "withdrawn" : ""
      } ${lifted ? "lifted" : ""}`}
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
      onClick={onOpen}
      aria-label={`${agent.name}${agent.negative ? `. ${negativePanelLabel}` : ""}. Open the conversation`}
      aria-pressed={lifted}
    >
      <span className={`card-flip ${faceDown ? "down" : ""}`} style={{ "--deal": `${dealIndex * 120}ms` } as CSSProperties}>
        <span className="card-face front-face">
          <img src={agent.art} alt="" draggable={false} />
        </span>
        <span className="card-face back-face">
          <img src={cardBackArt} alt="" draggable={false} />
          {withdrawn && (
            <span className="withdrawn-note">
              Withdrawn. {slot.case.patientLabel} speaks for {pronoun.reflexive} now.
            </span>
          )}
          {opening?.status === "error" && !withdrawn && <span className="withdrawn-note">Could not take a seat. Open to retry.</span>}
        </span>
      </span>

      <span className="seat-plate">
        <span className="seat-name">{agent.shortName}</span>
        {agent.negative && <span className="negative-ribbon">{negativePanelLabel}</span>}
      </span>

      {unread > 0 ? (
        <span className="seat-unread" aria-label={`${unread} new`}>
          {unread}
        </span>
      ) : (
        pins > 0 && (
          <span className="seat-pins" aria-label={`${pins} kept`}>
            <Bookmark size={11} />
            {pins}
          </span>
        )
      )}
      {debated && !item.front && <span className="seat-debated" aria-hidden="true" />}
      {showHook && <span className="hook-slip">{opening!.hook}</span>}
      {item.front && !lifted && !faceDown && <span className="seat-open-hint">Click to talk</span>}
    </button>
  );
}

// ================================================================ a panel member's card, turned over: their conversation

type WindowProps = {
  slot: CaseSlot;
  caseState: CaseState;
  style: OpeningStyle;
  onAsk: (seat: Seat, text: string) => void;
  onHear: (agentId: AgentKey) => void;
  onPin: (sourceId: string, agentId: AgentKey, quote: string) => void;
  onRetryLine: (lineId: string) => void;
  onRetryOpening: (agentId: AgentKey) => void;
  onOpen: (seat: AgentKey | "floor") => void;
  onClose: () => void;
  onListen: (lineId: string, agentId: AgentKey) => void;
};

/** Lines that belong on one panel member's card: their own words and what was put to them. */
const cardEntries = (caseState: CaseState, agentId: AgentKey): Line[] => {
  const lines = caseState.lines;
  const answered = new Set(lines.filter((line) => line.speaker === agentId && line.motionId).map((line) => line.motionId));
  return lines.filter(
    (line) =>
      (line.speaker === agentId && line.kind !== "hook-reply") ||
      (line.speaker === "chair" && line.to === agentId) ||
      (line.speaker === "chair" && line.to === "floor" && answered.has(line.motionId)) ||
      (line.kind === "patient-motion" && answered.has(line.id)),
  );
};

function Composer({
  placeholder,
  disabled,
  hint,
  action,
  onSend,
}: {
  placeholder: string;
  disabled: boolean;
  hint: string;
  action: string;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft("");
  };
  return (
    <footer className="paper-compose">
      <textarea
        rows={2}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="compose-row">
        <span className="compose-hint">{hint}</span>
        <button className="brass" disabled={disabled || !draft.trim()} onClick={submit}>
          {action}
        </button>
      </div>
    </footer>
  );
}

export function CardWindow({ agentId, ...props }: WindowProps & { agentId: AgentKey }) {
  const { slot, caseState, style } = props;
  const agent = studyAgentById(agentId);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { selection, setSelection, capture } = useSelectionKeep(bodyRef);
  const left = questionsLeft(caseState);
  const withdrawn = agentId === "patientAdvocate" && Boolean(caseState.advocateWithdrawnAt);
  const pinned = caseState.pins.filter((pin) => pin.agentId === agentId).map((pin) => pin.quote);
  const canAsk = !withdrawn && caseState.round < 3 && left > 0;
  const entries = cardEntries(caseState, agentId);
  const opening = caseState.openings[agentId];
  const lastText = caseState.lines[caseState.lines.length - 1]?.text.length ?? 0;
  const pronoun = patientPronouns(slot.case.patientLabel);

  useEffect(() => setSelection(undefined), [agentId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [agentId, entries.length, lastText]);

  return (
    <section className={`card-window ${agent.negative ? "negative" : ""}`} key={agentId} aria-label={`Conversation with ${agent.name}`}>
      <header className="card-window-head">
        <img className="paper-portrait" src={agent.art} alt="" />
        <div>
          <h2>{agent.name}</h2>
          <p>{agent.stance}</p>
        </div>
        <button className="icon card-window-close" onClick={props.onClose} aria-label="Turn the card back">
          <X size={18} />
        </button>
      </header>
      {agent.negative && <p className="negative-banner">{negativePanelLabel}</p>}

      <div className="paper-body" ref={bodyRef} onMouseUp={capture} onKeyUp={capture}>
        {opening && (
          <OpeningEntry
            agentId={agentId}
            opening={opening}
            style={style}
            pinned={pinned}
            heardLine={caseState.lines.find((line) => line.kind === "hook-reply" && line.speaker === agentId)}
            canHear={caseState.round === 1}
            onHear={() => props.onHear(agentId)}
            onRetry={() => props.onRetryOpening(agentId)}
            onPinAll={(sourceId, quote) => props.onPin(sourceId, agentId, quote)}
            onListen={(lineId) => props.onListen(lineId, agentId)}
          />
        )}
        {entries.map((line) => (
          <LineEntry
            key={line.id}
            line={line}
            slot={slot}
            pinned={pinned}
            onPinAll={(quote) => props.onPin(line.id, agentId, quote)}
            onRetry={() => props.onRetryLine(line.id)}
            onOpen={props.onOpen}
            onListen={() => props.onListen(line.id, agentId)}
          />
        ))}
        {selection && <KeepFloat selection={selection} onPin={props.onPin} clear={() => setSelection(undefined)} />}
      </div>

      {caseState.round < 3 && (
        <Composer
          placeholder={
            withdrawn
              ? `The Advocate has withdrawn: ${slot.case.patientLabel} speaks for ${pronoun.reflexive}.`
              : left <= 0
                ? `No questions left this round. ${caseState.round === 1 ? "Call the debate" : "Call the synthesis"} when you are ready.`
                : `Ask the ${agent.shortName}…`
          }
          disabled={!canAsk}
          hint={`${left} of ${roundBudget[caseState.round as 1 | 2]} questions left this round`}
          action={`Ask the ${agent.shortName}`}
          onSend={(text) => props.onAsk(agentId, text)}
        />
      )}
    </section>
  );
}

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
  onListen,
}: {
  agentId: AgentKey;
  opening: NonNullable<CaseState["openings"][AgentKey]>;
  style: OpeningStyle;
  pinned: string[];
  heardLine?: Line;
  canHear: boolean;
  onHear: () => void;
  onRetry: () => void;
  onPinAll: (sourceId: string, quote: string) => void;
  onListen: (lineId: string) => void;
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
        <span className="entry-label">Opening</span>
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
            <div data-pin-source={heardLine.id} data-pin-agent={agentId}>
              <ReplyText text={heardLine.text} pinned={pinned} streaming={heardLine.status === "streaming"} />
            </div>
            {heardLine.status === "done" && (
              <div className="reply-actions">
                <KeepButton kept={pinned.includes(plainReply(heardLine.text))} onKeep={() => onPinAll(heardLine.id, plainReply(heardLine.text))} />
                <SpeakButton text={heardLine.text} onListen={() => onListen(heardLine.id)} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="entry opening">
      <span className="entry-label">Opening</span>
      {opening.keyPoints.length > 0 && (
        <ul className="key-points" aria-label="Key points">
          {opening.keyPoints.slice(0, 3).map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}
      <p data-pin-source={`open-${agentId}`} data-pin-agent={agentId}>
        {withPins(opening.answer, pinned)}
      </p>
      <div className="reply-actions">
        <KeepButton kept={pinned.includes(opening.answer)} onKeep={() => onPinAll(`open-${agentId}`, opening.answer)} />
        <SpeakButton text={opening.answer} onListen={() => onListen(`open-${agentId}`)} />
      </div>
    </div>
  );
}

function LineEntry({
  line,
  slot,
  pinned,
  onPinAll,
  onRetry,
  onOpen,
  onListen,
}: {
  line: Line;
  slot: CaseSlot;
  pinned: string[];
  onPinAll: (quote: string) => void;
  onRetry: () => void;
  onOpen: (seat: AgentKey | "floor") => void;
  onListen: () => void;
}) {
  const roundTag = line.round > 1 ? <span className="entry-round">{roundNames[line.round]}</span> : null;

  if (line.speaker === "chair") {
    return (
      <div className="entry chair">
        <span className="entry-label">
          You{line.to === "floor" ? ", to the whole Floor" : ""} {roundTag}
        </span>
        <p>{line.text}</p>
      </div>
    );
  }

  if (line.speaker === "patient") {
    return (
      <div className="entry patient motion">
        <span className="entry-label">{slot.case.patientLabel}, put to the Floor</span>
        <p>{line.text}</p>
      </div>
    );
  }

  return (
    <div className={`entry agent ${line.kind === "debate" ? "debate" : ""}`}>
      <span className="entry-label">
        {line.kind === "debate" ? "In the debate" : studyAgentById(line.speaker).shortName} {line.kind !== "debate" && roundTag}
      </span>
      {line.status === "error" ? (
        <p className="entry-error">
          No answer: {line.error}{" "}
          <button className="link" onClick={onRetry}>
            Ask again
          </button>
        </p>
      ) : (
        <div data-pin-source={line.id} data-pin-agent={line.speaker}>
          {line.text ? (
            <ReplyText text={line.text} pinned={pinned} streaming={line.status === "streaming"} />
          ) : (
            <p className="streaming">{line.kind === "debate" ? "Reading the proceedings…" : " "}</p>
          )}
        </div>
      )}
      {line.stances && line.stances.length > 0 && (
        <ul className="stances">
          {line.stances.map((stance, index) => (
            <li key={index} className={stance.stance}>
              <button className="link" onClick={() => onOpen(stance.agentId)}>
                {stance.stance === "challenges" ? "Challenges" : "Backs"} {studyAgentById(stance.agentId).shortName}
              </button>
              : {stance.point}
            </li>
          ))}
        </ul>
      )}
      {line.status === "done" && line.text && (
        <div className="reply-actions">
          <KeepButton kept={pinned.includes(plainReply(line.text))} onKeep={() => onPinAll(plainReply(line.text))} />
          <SpeakButton text={line.text} onListen={onListen} />
        </div>
      )}
    </div>
  );
}

// ================================================================ the Floor: one question to everyone, and who said what

const firstPoint = (text: string) => {
  const first = text.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  const plain = first.replace(bulletPattern, "");
  return plain.length > 170 ? `${plain.slice(0, 167)}…` : plain;
};

export function FloorWindow(props: WindowProps) {
  const { slot, caseState } = props;
  const bodyRef = useRef<HTMLDivElement>(null);
  const left = questionsLeft(caseState);
  const panel = activeAgents(caseState);
  const lines = caseState.lines;
  const motions = lines.filter(
    (line) => (line.speaker === "chair" && line.to === "floor") || (line.kind === "patient-motion" && lines.some((reply) => reply.motionId === line.id)),
  );
  const debate = lines.filter((line) => line.kind === "debate");
  const lastText = lines[lines.length - 1]?.text.length ?? 0;

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [motions.length, debate.length, lastText]);

  const row = (line: Line) => {
    const agent = studyAgentById(line.speaker as AgentKey);
    return (
      <li key={line.id}>
        <button className={`floor-row ${agent.negative ? "negative" : ""}`} onClick={() => props.onOpen(agent.id as AgentKey)}>
          <img src={agent.art} alt="" />
          <span className="floor-row-who">{agent.shortName}</span>
          <span className={`floor-row-text ${line.status === "streaming" ? "streaming" : ""}`}>
            {line.status === "error" ? "No answer: open the card to ask again." : line.text ? firstPoint(line.text) : "…"}
          </span>
          <ChevronRight size={16} className="floor-row-go" />
        </button>
        {line.stances && line.stances.length > 0 && (
          <ul className="stances compact">
            {line.stances.map((stance, index) => (
              <li key={index} className={stance.stance}>
                {stance.stance === "challenges" ? "Challenges" : "Backs"} {studyAgentById(stance.agentId).shortName}
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <section className="card-window floor-window" aria-label="The Floor">
      <header className="card-window-head">
        <span className="paper-portrait floor" aria-hidden="true" />
        <div>
          <h2>The Floor</h2>
          <p>One question to everyone. Each member answers on their own card: open a card to read the whole reply.</p>
        </div>
        <button className="icon card-window-close" onClick={props.onClose} aria-label="Close the Floor">
          <X size={18} />
        </button>
      </header>
      <div className="paper-body" ref={bodyRef}>
        {motions.length === 0 && debate.length === 0 && (
          <p className="paper-empty">
            Nothing has been put to the Floor yet. Ask something here and every member answers in their own voice. It counts as one
            question.
          </p>
        )}
        {motions.map((motion) => {
          const id = motion.kind === "patient-motion" ? motion.id : motion.motionId;
          const replies = lines.filter((line) => line.motionId === id && line.speaker !== "chair");
          return (
            <div className="floor-motion" key={motion.id}>
              <p className="floor-question">
                <span className="entry-label">
                  {motion.speaker === "patient" ? `${slot.case.patientLabel}'s point, put to the Floor` : "You asked the Floor"}
                  {motion.round > 1 ? `, ${roundNames[motion.round].toLowerCase()}` : ""}
                </span>
                {motion.text}
              </p>
              <ul className="floor-rows">
                {replies.map(row)}
              </ul>
            </div>
          );
        })}
        {debate.length > 0 && (
          <div className="floor-motion debate">
            <p className="floor-question">
              <span className="entry-label">The debate</span>
              Each member has read round 1 and argues with the others. On the table, red dashed threads are challenges and brass threads
              are support.
            </p>
            <ul className="floor-rows">
              {debate.map(row)}
            </ul>
          </div>
        )}
      </div>
      {caseState.round < 3 && (
        <Composer
          placeholder={left <= 0 ? "No questions left this round." : "Ask the whole Floor…"}
          disabled={left <= 0 || panel.length === 0}
          hint={`Counts as one question. ${left} of ${roundBudget[caseState.round as 1 | 2]} left this round`}
          action="Ask everyone"
          onSend={(text) => props.onAsk("floor", text)}
        />
      )}
    </section>
  );
}

// ================================================================ the patient: their own pane, not a card

export function PatientPane({
  slot,
  caseState,
  onAsk,
  onRetryLine,
  onPutPatientMotion,
  onNotePatientMotion,
}: {
  slot: CaseSlot;
  caseState: CaseState;
  onAsk: (seat: Seat, text: string) => void;
  onRetryLine: (lineId: string) => void;
  onPutPatientMotion: () => void;
  onNotePatientMotion: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const label = slot.case.patientLabel;
  const pronoun = patientPronouns(label);
  const lines = caseState.lines.filter((line) => line.to === "patient" || line.speaker === "patient");
  const lastText = lines[lines.length - 1]?.text.length ?? 0;
  const pending = caseState.pendingPatientMotion?.lineId;

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [lines.length, lastText, pending]);

  return (
    <aside className="patient-pane" aria-label={`Consultation with ${label}`}>
      <header className="patient-pane-head">
        <span className={`patient-medallion ${slot.case.portrait ? "portrait" : ""}`} aria-hidden="true">
          {slot.case.portrait ? <img src={slot.case.portrait} alt="" draggable={false} /> : label.replace(/^(Mr|Ms|Mrs|Miss|Dr)\s+/, "").slice(0, 1)}
        </span>
        <div>
          <h2>{label}</h2>
          {slot.case.patientIntro && <p className="patient-intro">{slot.case.patientIntro}</p>}
          <p className="patient-status">
            Consultation paused while the panel sits. {pronoun.subject[0].toUpperCase() + pronoun.subject.slice(1)} is still with you; questions to{" "}
            {pronoun.object} are free.
          </p>
        </div>
      </header>
      {slot.case.glance && (
        <details className="pane-glance">
          <summary>{label} at a glance</summary>
          <Glance glance={slot.case.glance} />
        </details>
      )}
      <div className="paper-body patient-body" ref={bodyRef}>
        {lines.length === 0 && (
          <p className="paper-empty">
            Talk to {label} as you would in the consulting room. {pronoun.subject[0].toUpperCase() + pronoun.subject.slice(1)} answers
            only from what {pronoun.subject} knows, can hear the panel, and may raise things {pronoun.reflexive}.
          </p>
        )}
        {lines.map((line) =>
          line.speaker === "chair" ? (
            <div key={line.id} className="bubble chair">
              <p>{line.text}</p>
            </div>
          ) : (
            <div key={line.id} className={`bubble patient ${line.kind === "patient-motion" ? "raised" : ""} ${pending === line.id ? "pending" : ""}`}>
              {line.kind === "patient-motion" && <span className="bubble-label">{label} raises a point</span>}
              {line.status === "error" ? (
                <p className="entry-error">
                  No answer: {line.error}{" "}
                  <button className="link" onClick={() => onRetryLine(line.id)}>
                    Ask again
                  </button>
                </p>
              ) : (
                <p className={line.status === "streaming" ? "streaming" : ""}>{line.text || "…"}</p>
              )}
              {pending === line.id && (
                <div className="slip-actions">
                  <button className="brass" onClick={onPutPatientMotion}>
                    Put it to the panel
                  </button>
                  <button onClick={onNotePatientMotion}>Note it and carry on</button>
                </div>
              )}
              {line.kind === "patient-motion" && pending !== line.id && (
                <span className="bubble-note">
                  {caseState.lines.some((reply) => reply.motionId === line.id) ? "You put this to the panel." : "Noted."}
                </span>
              )}
            </div>
          ),
        )}
      </div>
      {caseState.round < 3 && (
        <Composer
          placeholder={`Ask ${label}…`}
          disabled={false}
          hint="Free: does not use a question"
          action={`Ask ${label}`}
          onSend={(text) => onAsk("patient", text)}
        />
      )}
    </aside>
  );
}

/** Dyadic cases: the record at a glance stays beside the table. */
export function RecordPane({ slot, onOpenRecord }: { slot: CaseSlot; onOpenRecord: () => void }) {
  return (
    <aside className="patient-pane record-pane" aria-label={`${slot.case.patientLabel} at a glance`}>
      <header className="patient-pane-head">
        <span className="patient-medallion" aria-hidden="true">
          {slot.case.patientLabel.replace(/^(Mr|Ms|Mrs|Miss|Dr)\s+/, "").slice(0, 1)}
        </span>
        <div>
          <h2>{slot.case.patientLabel}</h2>
          <p>Not in the room: you and the panel only.</p>
        </div>
      </header>
      <div className="paper-body">
        {slot.case.glance && <Glance glance={slot.case.glance} />}
        <button className="open-record" onClick={onOpenRecord}>
          Open the full record
        </button>
      </div>
    </aside>
  );
}

// ================================================================ kept points (carried to the synthesis)

export function PinTray({
  caseState,
  onUnpin,
  onEdit,
}: {
  caseState: CaseState;
  onUnpin: (pin: Pin) => void;
  onEdit: (pin: Pin, wording: string | undefined) => void;
}) {
  const count = caseState.pins.length;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState("");
  const previous = useRef(count);
  const hovering = useRef(false);
  const closeTimer = useRef<number | undefined>(undefined);

  // Show the tray briefly whenever something new is kept, so a mistake is easy to take back; it closes
  // again on its own unless the Chair is using it.
  useEffect(() => {
    if (count > previous.current) {
      setOpen(true);
      window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(() => {
        if (!hovering.current) setOpen(false);
      }, 5000);
    }
    previous.current = count;
  }, [count]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (editing) window.clearTimeout(closeTimer.current);
  }, [editing]);

  const save = (pin: Pin) => {
    const text = draft.trim();
    onEdit(pin, text && text !== pin.quote ? text : undefined);
    setEditing(undefined);
  };

  return (
    <div
      className={`pin-tray ${open ? "open" : ""}`}
      onMouseEnter={() => {
        hovering.current = true;
        window.clearTimeout(closeTimer.current);
      }}
      onMouseLeave={() => {
        hovering.current = false;
      }}
    >
      <button
        className="pin-tray-toggle"
        onClick={() => {
          window.clearTimeout(closeTimer.current);
          setOpen(!open);
        }}
        aria-expanded={open}
      >
        <Bookmark size={15} /> Kept <strong>{count}</strong>
      </button>
      {open && (
        <div className="pin-tray-list" role="region" aria-label="Carrying forward">
          <div className="pin-tray-head">
            <span>Kept for the synthesis</span>
            <button className="icon" onClick={() => setOpen(false)} aria-label="Close">
              <X size={15} />
            </button>
          </div>
          {count === 0 ? (
            <p>Select words in any panel member's reply, or press Keep under it, to take a point into the synthesis.</p>
          ) : (
            <ul>
              {caseState.pins.map((pin) => (
                <li key={pin.id}>
                  <span className="pin-who">
                    {studyAgentById(pin.agentId).shortName}
                    {pin.wording && <em> · in your words</em>}
                  </span>
                  {editing === pin.id ? (
                    <div className="pin-edit">
                      <textarea
                        rows={3}
                        value={draft}
                        autoFocus
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            save(pin);
                          }
                          if (event.key === "Escape") setEditing(undefined);
                        }}
                      />
                      <span className="pin-source">Their words stay on the record: “{pin.quote}”</span>
                      <div className="pin-actions">
                        <button className="brass" onClick={() => save(pin)}>
                          Save
                        </button>
                        <button onClick={() => setEditing(undefined)}>Cancel</button>
                        {pin.wording && (
                          <button
                            onClick={() => {
                              onEdit(pin, undefined);
                              setEditing(undefined);
                            }}
                          >
                            Use their words
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className={`pin-quote ${pin.wording ? "reworded" : ""}`}>{pin.wording ?? `“${pin.quote}”`}</span>
                      {pin.wording && <span className="pin-source">From: “{pin.quote}”</span>}
                      <div className="pin-actions">
                        <button
                          onClick={() => {
                            setEditing(pin.id);
                            setDraft(pin.wording ?? pin.quote);
                          }}
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button onClick={() => onUnpin(pin)}>
                          <Trash2 size={13} /> Remove
                        </button>
                      </div>
                    </>
                  )}
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
  const panel = panelOrder;

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
                <span>{listNames(candidate.agentIds.map((id) => studyAgentById(id).shortName))}</span>
                {candidate.origin === "pin" && <span className="slip-pinned">you kept this</span>}
                {negative && <span className="slip-negative">{negativePanelLabel}</span>}
              </div>
              {candidate.summary && <p className="slip-summary">{candidate.summary}</p>}
              {candidate.wording && <p className="slip-wording">In your words: “{candidate.wording}”</p>}
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
                  {candidate.wording ? (
                    <button
                      onClick={() => onRule(candidate, "amend", candidate.wording)}
                      aria-pressed={candidate.ruling?.verdict === "amend" && candidate.ruling.amendedText === candidate.wording}
                    >
                      Carry in my words
                    </button>
                  ) : (
                    <button onClick={() => onRule(candidate, "accept")} aria-pressed={candidate.ruling?.verdict === "accept"}>
                      Carry forward
                    </button>
                  )}
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
    const text = (window.getSelection()?.toString() ?? "").trim().replace(/^[“"]+|[”"]+$/g, "").trim();
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
  const sealed = Boolean(caseState.minutesSealedAt);
  const ready = caseState.candidatesStatus === "ready" && !sealed;

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [caseState.clerk.length, busy, sealed, caseState.summary?.status]);

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
        {sealed && (
          <div className="entry agent">
            <span className="entry-label">Clerk</span>
            <p>
              {caseState.summary?.status === "ready"
                ? `The Minutes are sealed with ${minutes.length} ${minutes.length === 1 ? "point" : "points"}. My summary is on the table: check it says only what you carried forward, then take it into your final plan.`
                : caseState.summary?.status === "error"
                  ? "I could not write the summary. Try again on the table, or reopen the rulings."
                  : "The Minutes are sealed. I am writing them up for your plan…"}
            </p>
          </div>
        )}
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
          {sealed ? (
            <p className="seal-done">Sealed. Read the Clerk's summary on the table.</p>
          ) : sealing ? (
            <>
              <p>
                {unruled > 0 ? `${unruled} not ruled on will be left out. ` : ""}Seal the Minutes with {minutes.length}{" "}
                {minutes.length === 1 ? "point" : "points"}? The Clerk will summarise them for your final plan.
              </p>
              <div className="slip-actions">
                <button
                  className="brass"
                  onClick={() => {
                    setSealing(false);
                    onSeal();
                  }}
                >
                  Seal the Minutes
                </button>
                <button onClick={() => setSealing(false)}>Not yet</button>
              </div>
            </>
          ) : (
            <button className="seal" disabled={!ready || proposals > 0} onClick={() => setSealing(true)}>
              Seal the Minutes
            </button>
          )}
        </div>
      </footer>
    </aside>
  );
}
