import { PITCH_TYPE_NAMES, UNAVAILABLE } from "./constants";

export function fmtNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return UNAVAILABLE;
  return value.toFixed(digits);
}

export function fmtRuns(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return UNAVAILABLE;
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return UNAVAILABLE;
  return `${Math.round(value * 100)}%`;
}

export function fmtSigned(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return UNAVAILABLE;
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function ordinal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "unknown";
  const integer = Math.trunc(value);
  const suffix = integer % 100 >= 11 && integer % 100 <= 13 ? "th" : integer % 10 === 1 ? "st" : integer % 10 === 2 ? "nd" : integer % 10 === 3 ? "rd" : "th";
  return `${integer}${suffix}`;
}

export function halfInningLabel(half: string | null | undefined, inning: number | null | undefined): string {
  const normalizedHalf = String(half || "").toLowerCase() === "top" ? "Top" : String(half || "").toLowerCase() === "bottom" ? "Bot" : "Half";
  return `${normalizedHalf} ${ordinal(inning)}`;
}

export function baseStateLabel(baseState: string | null | undefined): string {
  const value = String(baseState || "").trim();
  const labels: Record<string, string> = {
    "000": "Bases empty", "100": "Man on 1st", "010": "Man on 2nd",
    "001": "Man on 3rd", "110": "1st and 2nd", "101": "1st and 3rd",
    "011": "2nd and 3rd", "111": "Bases loaded",
  };
  return labels[value] ?? "Bases unavailable";
}

export function outsLabel(outs: number | null | undefined): string {
  if (outs == null || !Number.isFinite(outs)) return "— outs";
  return `${outs} out${outs === 1 ? "" : "s"}`;
}

export function normalize(value: string | null | undefined): string {
  if (!value) return "";
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export function pitchName(value: string | null | undefined): string {
  if (!value) return "Pitch";
  return PITCH_TYPE_NAMES[value.toUpperCase()] ?? normalize(value);
}

export function formatDateText(value: string | null | undefined): string {
  if (!value) return "Date unavailable";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function statusLabel(status: string | null | undefined): string {
  return String(status || "STAY").replace(/_/g, " ").toUpperCase();
}

export function statusRank(status: string | null | undefined): number {
  const label = statusLabel(status);
  if (label === "DISTRESS") return 4;
  if (label === "PULL NOW") return 3;
  if (label === "PREP") return 2;
  if (label === "WATCH") return 1;
  return 0;
}

export function featureLabel(value: string | null | undefined): string {
  if (!value) return "Review reason";
  const labels: Record<string, string> = {
    base_traffic: "Runners on base",
    leverage: "High-leverage state",
    leverage_index: "High-leverage state",
    leveraged_production_degradation: "Stuff slipping under pressure",
    pitch_count_norm: "Workload building",
    pitch_count_pressure: "Workload building",
    times_through_order_pressure: "Third time through order",
    tto: "Third time through order",
    inning_norm: "Late-game exposure",
    inning_pressure: "Late-game exposure",
    degradation_score: "Stuff decline",
    normalized_degradation: "Stuff decline",
    decay_velocity: "Decline accelerating",
    decay_acceleration: "Decline accelerating",
    batter_quality: "Dangerous hitters due",
    inning_pitcher_penalty: "Inning history",
    tto_pitcher_penalty: "TTO penalty",
  };
  return labels[value] ?? normalize(value);
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function sum(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, v) => total + (v ?? 0), 0);
}

export function avg(values: Array<number | null | undefined>): number | null {
  const numbers = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (numbers.length === 0) return null;
  return numbers.reduce((t, v) => t + v, 0) / numbers.length;
}
