export function MetricCard({
  eyebrow,
  value,
  label,
  accent = "gold",
}: {
  eyebrow?: string;
  value: string;
  label: string;
  accent?: "gold" | "red" | "green" | "navy";
}) {
  return (
    <article className={`metric-card metric-card--${accent}`}>
      {eyebrow && <span className="metric-card__eyebrow">{eyebrow}</span>}
      <strong className="metric-card__value">{value}</strong>
      <p className="metric-card__label">{label}</p>
    </article>
  );
}
