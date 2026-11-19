import { useEffect, useLayoutEffect, useState } from "react";

export type TourStep = { target: string; title: string; body: string };

type Rect = { top: number; left: number; width: number; height: number };

/**
 * A short guided tour: dims the screen, lights up one part at a time and says what it is for.
 * Steps whose target is not on the screen are skipped. Esc or "Skip" ends it.
 */
export function Tour({ steps, onDone }: { steps: TourStep[]; onDone: (completed: boolean, reached: number) => void }) {
  const available = steps.filter((step) => document.querySelector(step.target));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect>();
  const step = available[index];

  useLayoutEffect(() => {
    if (!step) return;
    const measure = () => {
      const element = document.querySelector(step.target);
      if (!element) return setRect(undefined);
      const box = element.getBoundingClientRect();
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
    };
    measure();
    window.addEventListener("resize", measure);
    const timer = window.setInterval(measure, 400);
    return () => {
      window.removeEventListener("resize", measure);
      window.clearInterval(timer);
    };
  }, [step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDone(false, index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, onDone]);

  useEffect(() => {
    if (!available.length) onDone(true, 0);
  }, [available.length, onDone]);

  if (!step) return null;

  const pad = 8;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const cardW = Math.min(360, viewportW - 32);
  const spot = rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : { top: viewportH / 2, left: viewportW / 2, width: 0, height: 0 };
  // Put the card beside the lit area where it fits: below, above, then to the side.
  const below = spot.top + spot.height + 14;
  const above = spot.top - 14;
  const cardH = 190;
  let top = below + cardH < viewportH ? below : above - cardH > 0 ? above - cardH : Math.max(16, viewportH / 2 - cardH / 2);
  let left = Math.min(Math.max(16, spot.left + spot.width / 2 - cardW / 2), viewportW - cardW - 16);
  if (spot.height > viewportH * 0.6) {
    // A tall target: put the card beside it if there is room, otherwise inside it near the top.
    top = Math.max(16, spot.top + 24);
    if (spot.left + spot.width + 16 + cardW < viewportW - 16) left = spot.left + spot.width + 16;
    else if (spot.left - 16 - cardW > 16) left = spot.left - 16 - cardW;
    else left = Math.min(Math.max(16, spot.left + 24), viewportW - cardW - 16);
  }
  const last = index === available.length - 1;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="How this works">
      <div className="tour-spot" style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }} />
      <div className="tour-card" style={{ top, left, width: cardW }}>
        <span className="tour-count">
          {index + 1} of {available.length}
        </span>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="link" onClick={() => onDone(false, index + 1)}>
            Skip
          </button>
          <span>
            {index > 0 && <button onClick={() => setIndex(index - 1)}>Back</button>}
            <button className="brass" autoFocus onClick={() => (last ? onDone(true, index + 1) : setIndex(index + 1))}>
              {last ? "Start" : "Next"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
