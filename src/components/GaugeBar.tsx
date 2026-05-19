import { clamp } from "../lib/format";

export function GaugeBar({
  label,
  value,
  detail,
  percent,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  percent?: number;
  tone?: "neutral" | "good" | "warn" | "bad" | "gold";
}) {
  const width = percent == null ? 0 : Math.round(clamp(percent) * 100);
  return (
    <div className={`gauge-bar gauge-bar--${tone}`}>
      <div className="gauge-bar__head">
        <span className="gauge-bar__label">{label}</span>
        <strong className="gauge-bar__value">{value}</strong>
      </div>
      {percent != null && (
        <div className="gauge-bar__track">
          <div className="gauge-bar__fill" style={{ width: `${width}%` }} />
        </div>
      )}
      {detail && <p className="gauge-bar__detail">{detail}</p>}
    </div>
  );
}
