import { statusLabel } from "../lib/format";

export function StatusBadge({ status, size = "md" }: { status: string | null | undefined; size?: "sm" | "md" }) {
  const label = statusLabel(status);
  const cls = label.toLowerCase().replace(/\s+/g, "-");
  return <span className={`status-badge status-badge--${cls} status-badge--${size}`}>{label}</span>;
}
