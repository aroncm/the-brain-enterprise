import type { PitchingReplayEntry, PitchingAuditWindow, PitchingAuditSummaryPayload, PreventableRunsOpportunityRow } from "../types";
import { MLB_TEAM_IDS } from "./constants";
import { statusLabel, statusRank, clamp } from "./format";

export function teamLogoUrl(abbr: string): string | null {
  const id = MLB_TEAM_IDS[abbr];
  return id ? `https://www.mlbstatic.com/team-logos/${id}.svg` : null;
}

export function pitchCount(entry: PitchingReplayEntry): number {
  const state = entry.snapshot.starter_state;
  return state.official_pitch_count_in_game ?? state.pitch_count_in_game ?? state.replay_pitch_count_in_game ?? 0;
}

export function stuffScore(entry: PitchingReplayEntry): number {
  return Math.max(20, Math.min(100, Math.round(100 - (entry.snapshot.starter_state.degradation_score ?? 0) * 22)));
}

export function velocityDrop(entry: PitchingReplayEntry): number | null {
  const state = entry.snapshot.starter_state;
  if (state.velo_mean_5 == null || state.seasonal_velo_baseline == null) return null;
  return state.velo_mean_5 - state.seasonal_velo_baseline;
}

export function maxStatus(left: string, right: string): string {
  return statusRank(right) > statusRank(left) ? statusLabel(right) : statusLabel(left);
}

export function monotonicStatuses(entries: PitchingReplayEntry[]): string[] {
  let current = "STAY";
  return entries.map((entry) => {
    current = maxStatus(current, statusLabel(entry.recommendation.status));
    return current;
  });
}

export function signalClass(status: string): string {
  return statusLabel(status).toLowerCase().replace(/\s+/g, "_");
}

export function auditWindows(summary: PitchingAuditSummaryPayload | null): PitchingAuditWindow[] {
  if (!summary) return [];
  return [
    ...(summary.missed_hook_windows ?? []),
    ...(summary.delayed_change_windows ?? []),
    ...(summary.high_leverage_holdouts ?? []),
    ...(summary.justified_stay_windows ?? []),
  ];
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function looseNumber(source: unknown, keys: string[]): number | null {
  const sourceRecord = record(source);
  for (const key of keys) {
    const value = num(sourceRecord[key]);
    if (value != null) return value;
  }
  return null;
}

export function scaledPercent(value: number | null | undefined, scale = 1): number {
  if (value == null || !Number.isFinite(value) || scale <= 0) return 0;
  return clamp(value / scale);
}

export function opportunityForPitch(
  entry: PitchingReplayEntry | null,
  opportunities: PreventableRunsOpportunityRow[],
  selectedGameId: string | null,
): PreventableRunsOpportunityRow | null {
  if (!entry || !selectedGameId) return null;
  const gameRows = opportunities.filter((row) => row.gameId === selectedGameId);
  if (gameRows.length === 0) return null;
  const pitcherRows = gameRows.filter((row) => {
    if (row.pitcherId && String(row.pitcherId) === String(entry.snapshot.pitcher_id)) return true;
    return row.pitcherName === entry.snapshot.pitcher_name;
  });
  const rows = pitcherRows.length ? pitcherRows : gameRows;
  const currentPitch = pitchCount(entry);
  return rows
    .slice()
    .sort((left, right) => {
      const ld = left.pitchCount == null ? Infinity : Math.abs(left.pitchCount - currentPitch);
      const rd = right.pitchCount == null ? Infinity : Math.abs(right.pitchCount - currentPitch);
      return ld - rd;
    })[0] ?? null;
}

export function preventableRunsForPitch(entry: PitchingReplayEntry | null, opportunity: PreventableRunsOpportunityRow | null): number | null {
  if (!entry) return null;
  return (
    opportunity?.projectedPreventableRuns ??
    opportunity?.decisionDelta ??
    looseNumber(entry.recommendation, [
      "projectedPreventableRuns", "projected_preventable_runs",
      "preventableRuns", "preventable_runs",
      "calibratedPreventableRuns", "calibrated_preventable_runs",
      "projectedRunsSaved", "projected_runs_saved",
      "estimatedRunsSaved", "estimated_runs_saved",
    ])
  );
}

export function matrixCellLabel(starterAbove: boolean, penAbove: boolean): "Standard" | "Tandem" | "Push" | "Workload" {
  if (starterAbove && penAbove) return "Standard";
  if (!starterAbove && penAbove) return "Tandem";
  if (starterAbove && !penAbove) return "Push";
  return "Workload";
}

export function matrixCellForWindow(window: PitchingAuditWindow): "Standard" | "Tandem" | "Push" | "Workload" {
  const starter = record(window.starter);
  const candidate = record(window.top_candidate);
  const starterAbove = (num(starter.degradation_score) ?? 2) < 1.15;
  const penAbove = Math.max(num(candidate.net_option_score) ?? 0, num(candidate.direct_matchup_fit) ?? 0) >= 0.45;
  return matrixCellLabel(starterAbove, penAbove);
}

export function baseStateFlags(baseState: string | null | undefined) {
  const value = String(baseState || "").toUpperCase();
  if (/^[01]{3}$/.test(value)) {
    return { first: value[0] === "1", second: value[1] === "1", third: value[2] === "1" };
  }
  return {
    first: value.includes("1") || value.includes("FIRST"),
    second: value.includes("2") || value.includes("SECOND"),
    third: value.includes("3") || value.includes("THIRD"),
  };
}
