import type { Glance as GlanceData, GlanceLab } from "../../shared/studyTypes";

/** Results print exactly as recorded (1.49 stays 1.49). */
const format = (value: number) => String(value);

/**
 * A tiny trend line for 2–3 results: earlier points muted, the latest in the accent, a native tooltip per point.
 * No colour judges the value (up is not marked good or bad): that is the Chair's reading, not the chart's.
 */
function Sparkline({ lab }: { lab: GlanceLab }) {
  const width = 132;
  const height = 38;
  const padX = 7;
  const padY = 7;
  const values = lab.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index: number) => padX + (index * (width - padX * 2)) / Math.max(1, lab.points.length - 1);
  const y = (value: number) => (max === min ? height / 2 : padY + ((max - value) * (height - padY * 2)) / span);
  const path = lab.points.map((point, index) => `${index ? "L" : "M"} ${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${lab.label} trend`}>
      <path d={path} className="spark-line" />
      {lab.points.map((point, index) => {
        const latest = index === lab.points.length - 1;
        return (
          <g key={point.when}>
            {/* a larger invisible target than the dot, so the tooltip is easy to reach */}
            <circle cx={x(index)} cy={y(point.value)} r={10} className="spark-hit">
              <title>{`${point.when}: ${format(point.value)} ${lab.unit}${point.alt !== undefined && lab.altUnit ? ` (${format(point.alt)} ${lab.altUnit})` : ""}`}</title>
            </circle>
            <circle cx={x(index)} cy={y(point.value)} r={4} className={`spark-dot ${latest ? "latest" : ""}`} />
          </g>
        );
      })}
    </svg>
  );
}

function LabTile({ lab }: { lab: GlanceLab }) {
  const latest = lab.points[lab.points.length - 1];
  const series = lab.points.length > 1;
  return (
    <li className="lab-tile">
      <div className="lab-head">
        <span className="lab-label">{lab.label}</span>
        <span className="lab-when">{latest.when}</span>
      </div>
      <div className="lab-value">
        <strong>{format(latest.value)}</strong> <span className="lab-unit">{lab.unit}</span>
        {latest.alt !== undefined && lab.altUnit && lab.altUnit !== lab.unit && (
          <span className="lab-alt">
            {format(latest.alt)} {lab.altUnit}
          </span>
        )}
      </div>
      {series && (
        <div className="lab-trend">
          <Sparkline lab={lab} />
          <span className="lab-series">
            {lab.points.map((point) => format(point.value)).join(" → ")}
            <small>
              {lab.points[0].when} → {latest.when}
            </small>
          </span>
        </div>
      )}
      {lab.note && <p className="lab-note">{lab.note}</p>}
    </li>
  );
}

export function Glance({ glance }: { glance: GlanceData }) {
  return (
    <div className="glance">
      <ul className="glance-facts">
        {glance.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
      {glance.labs.length > 0 && (
        <>
          <h3 className="glance-heading">Results</h3>
          <ul className="lab-tiles">
            {glance.labs.map((lab) => (
              <LabTile key={lab.label} lab={lab} />
            ))}
          </ul>
          <p className="glance-units">Each result is shown in the units on the record, with the other common unit beside it.</p>
        </>
      )}
    </div>
  );
}
