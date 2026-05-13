import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiConfigurationError,
  fetchEnterpriseGames,
  fetchPitcherProfiles,
  fetchPitchingAuditSummary,
  fetchPitchingRecap,
  fetchPitchingRecapSettings,
  fetchPitchingReplay,
  fetchPreventableRunsOpportunities,
  fetchRunSavingBoard,
  getConfiguredApiBase,
  sendPitchingRecapEmail,
  savePitchingRecapSettings,
} from "./api";
import type {
  AuditRow,
  BullpenOption,
  EnterpriseGameSummary,
  PitcherProfile,
  PitcherProfilesPayload,
  PitcherDecision,
  PitchingAuditSummaryPayload,
  PitchingAuditWindow,
  PitchingGameRecap,
  PitchingRecapPitcher,
  PitchingRecapSettings,
  PitchingReplayEntry,
  PitchingReplayResponse,
  PreventableRunsOpportunityRow,
  PreventableRunsOpportunitiesPayload,
  RunSavingBoardPayload,
  TripleAConversionCandidate,
} from "./types";

type LoadState = "loading" | "ready" | "error" | "missing-config";
type Workflow = "command" | "audit" | "allocation" | "roster" | "briefings";
type Team = { abbr: string; name: string; club: string; division: string };
type MatrixCell = "standard" | "tandem" | "push" | "workload";

const UNAVAILABLE = "Unavailable";
const LOADING_VALUE = "Awaiting data";

const MLB_TEAM_IDS: Record<string, number> = {
  ARI: 109,
  ATL: 144,
  BAL: 110,
  BOS: 111,
  CHC: 112,
  CWS: 145,
  CIN: 113,
  CLE: 114,
  COL: 115,
  DET: 116,
  HOU: 117,
  KC: 118,
  LAA: 108,
  LAD: 119,
  MIA: 146,
  MIL: 158,
  MIN: 142,
  NYM: 121,
  NYY: 147,
  OAK: 133,
  PHI: 143,
  PIT: 134,
  SD: 135,
  SEA: 136,
  SF: 137,
  STL: 138,
  TB: 139,
  TEX: 140,
  TOR: 141,
  WSH: 120,
};

const MLB_TEAMS: Team[] = [
  { abbr: "ARI", name: "Arizona Diamondbacks", club: "Diamondbacks", division: "NL West" },
  { abbr: "ATL", name: "Atlanta Braves", club: "Braves", division: "NL East" },
  { abbr: "BAL", name: "Baltimore Orioles", club: "Orioles", division: "AL East" },
  { abbr: "BOS", name: "Boston Red Sox", club: "Red Sox", division: "AL East" },
  { abbr: "CHC", name: "Chicago Cubs", club: "Cubs", division: "NL Central" },
  { abbr: "CWS", name: "Chicago White Sox", club: "White Sox", division: "AL Central" },
  { abbr: "CIN", name: "Cincinnati Reds", club: "Reds", division: "NL Central" },
  { abbr: "CLE", name: "Cleveland Guardians", club: "Guardians", division: "AL Central" },
  { abbr: "COL", name: "Colorado Rockies", club: "Rockies", division: "NL West" },
  { abbr: "DET", name: "Detroit Tigers", club: "Tigers", division: "AL Central" },
  { abbr: "HOU", name: "Houston Astros", club: "Astros", division: "AL West" },
  { abbr: "KC", name: "Kansas City Royals", club: "Royals", division: "AL Central" },
  { abbr: "LAA", name: "Los Angeles Angels", club: "Angels", division: "AL West" },
  { abbr: "LAD", name: "Los Angeles Dodgers", club: "Dodgers", division: "NL West" },
  { abbr: "MIA", name: "Miami Marlins", club: "Marlins", division: "NL East" },
  { abbr: "MIL", name: "Milwaukee Brewers", club: "Brewers", division: "NL Central" },
  { abbr: "MIN", name: "Minnesota Twins", club: "Twins", division: "AL Central" },
  { abbr: "NYM", name: "New York Mets", club: "Mets", division: "NL East" },
  { abbr: "NYY", name: "New York Yankees", club: "Yankees", division: "AL East" },
  { abbr: "OAK", name: "Athletics", club: "Athletics", division: "AL West" },
  { abbr: "PHI", name: "Philadelphia Phillies", club: "Phillies", division: "NL East" },
  { abbr: "PIT", name: "Pittsburgh Pirates", club: "Pirates", division: "NL Central" },
  { abbr: "SD", name: "San Diego Padres", club: "Padres", division: "NL West" },
  { abbr: "SEA", name: "Seattle Mariners", club: "Mariners", division: "AL West" },
  { abbr: "SF", name: "San Francisco Giants", club: "Giants", division: "NL West" },
  { abbr: "STL", name: "St. Louis Cardinals", club: "Cardinals", division: "NL Central" },
  { abbr: "TB", name: "Tampa Bay Rays", club: "Rays", division: "AL East" },
  { abbr: "TEX", name: "Texas Rangers", club: "Rangers", division: "AL West" },
  { abbr: "TOR", name: "Toronto Blue Jays", club: "Blue Jays", division: "AL East" },
  { abbr: "WSH", name: "Washington Nationals", club: "Nationals", division: "NL East" },
];

const WORKFLOWS: Array<{ id: Workflow; label: string; question: string }> = [
  { id: "command", label: "Command Center", question: "Where did we have opportunities to prevent runs?" },
  { id: "audit", label: "Game Audit", question: "What happened pitch by pitch?" },
  { id: "allocation", label: "Pitcher Allocation", question: "How should we deploy the staff?" },
  { id: "roster", label: "Roster Construction", question: "What staff gaps should we solve?" },
  { id: "briefings", label: "Briefings", question: "Who receives postgame intelligence?" },
];

const PITCH_TYPE_NAMES: Record<string, string> = {
  FA: "Fastball",
  FF: "Four-Seam Fastball",
  FT: "Two-Seam Fastball",
  SI: "Sinker",
  FC: "Cutter",
  SL: "Slider",
  ST: "Sweeper",
  CU: "Curveball",
  KC: "Knuckle Curve",
  CH: "Changeup",
  FS: "Splitter",
  FO: "Forkball",
  KN: "Knuckleball",
};

function sum(values: Array<number | null | undefined>): number {
  return values.reduce((total, value) => total + (value ?? 0), 0);
}

function avg(values: Array<number | null | undefined>): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) return null;
  return numbers.reduce((total, value) => total + value, 0) / numbers.length;
}

function fmtNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return UNAVAILABLE;
  return value.toFixed(digits);
}

function fmtRuns(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return UNAVAILABLE;
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return UNAVAILABLE;
  return `${Math.round(value * 100)}%`;
}

function fmtRate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return UNAVAILABLE;
  return `${Math.round(value * 100)}%`;
}

function fmtSigned(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return UNAVAILABLE;
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function scaledPercent(value: number | null | undefined, scale = 1): number {
  if (value == null || !Number.isFinite(value) || scale <= 0) return 0;
  return clamp(value / scale);
}

function ordinal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "unknown";
  const integer = Math.trunc(value);
  const suffix = integer % 100 >= 11 && integer % 100 <= 13 ? "th" : integer % 10 === 1 ? "st" : integer % 10 === 2 ? "nd" : integer % 10 === 3 ? "rd" : "th";
  return `${integer}${suffix}`;
}

function halfInningLabel(half: string | null | undefined, inning: number | null | undefined): string {
  const normalizedHalf = String(half || "").toLowerCase() === "top" ? "top" : String(half || "").toLowerCase() === "bottom" ? "bottom" : "half";
  return `${normalizedHalf} of the ${ordinal(inning)}`;
}

function baseStateLabel(baseState: string | null | undefined): string {
  const value = String(baseState || "").trim();
  const labels: Record<string, string> = {
    "000": "Bases empty",
    "100": "Man on first",
    "010": "Man on second",
    "001": "Man on third",
    "110": "Men on first and second",
    "101": "Men on first and third",
    "011": "Men on second and third",
    "111": "Bases loaded",
  };
  return labels[value] ?? "Base state unavailable";
}

function outsLabel(outs: number | null | undefined): string {
  if (outs == null || !Number.isFinite(outs)) return "outs unavailable";
  return `${outs} ${outs === 1 ? "out" : "outs"}`;
}

function normalize(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function featureLabel(value: string | null | undefined): string {
  if (!value) return "Review reason";
  const labels: Record<string, string> = {
    base_traffic: "Runners on base",
    leverage: "Important game state",
    leverage_index: "Important game state",
    leveraged_production_degradation: "Stuff slipping in leverage",
    pitch_count_norm: "Workload building",
    pitch_count_pressure: "Workload building",
    times_through_order_pressure: "Lineup seeing him again",
    tto: "Lineup seeing him again",
    inning_norm: "Later-game exposure",
    inning_pressure: "Later-game exposure",
    degradation_score: "Stuff degradation",
    normalized_degradation: "Stuff degradation",
    decay_velocity: "Decline accelerating",
    decay_acceleration: "Decline accelerating",
    batter_quality: "Dangerous hitters due",
    inning_pitcher_penalty: "History in this inning",
    tto_pitcher_penalty: "History third time through",
  };
  return labels[value] ?? normalize(value);
}

function formatDateText(value: string | null | undefined): string {
  if (!value) return "Date unavailable";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function pitchName(value: string | null | undefined): string {
  if (!value) return "Pitch";
  return PITCH_TYPE_NAMES[value.toUpperCase()] ?? normalize(value);
}

function teamLogoUrl(abbr: string): string | null {
  const id = MLB_TEAM_IDS[abbr];
  return id ? `https://www.mlbstatic.com/team-logos/${id}.svg` : null;
}

function pitchCount(entry: PitchingReplayEntry): number {
  const state = entry.snapshot.starter_state;
  return state.official_pitch_count_in_game ?? state.pitch_count_in_game ?? state.replay_pitch_count_in_game ?? 0;
}

function stuffScore(entry: PitchingReplayEntry): number {
  return Math.max(20, Math.min(100, Math.round(100 - (entry.snapshot.starter_state.degradation_score ?? 0) * 22)));
}

function velocityDrop(entry: PitchingReplayEntry): number | null {
  const state = entry.snapshot.starter_state;
  if (state.velo_mean_5 == null || state.seasonal_velo_baseline == null) return null;
  return state.velo_mean_5 - state.seasonal_velo_baseline;
}

function scoreForEntry(entry: PitchingReplayEntry, replay: PitchingReplayResponse): string {
  return `${replay.game.away_team} ${entry.snapshot.away_score ?? "—"} - ${entry.snapshot.home_score ?? "—"} ${replay.game.home_team}`;
}

function gameSituationLabel(entry: PitchingReplayEntry): string {
  return `${halfInningLabel(entry.snapshot.half, entry.snapshot.inning)} · ${outsLabel(entry.snapshot.outs)} · ${baseStateLabel(entry.snapshot.base_state)}`;
}

function statusLabel(status: string | null | undefined): string {
  return String(status || "STAY").replace(/_/g, " ").toUpperCase();
}

function statusRank(status: string | null | undefined): number {
  const label = statusLabel(status);
  if (label === "DISTRESS") return 4;
  if (label === "PULL NOW") return 3;
  if (label === "PREP") return 2;
  if (label === "WATCH") return 1;
  return 0;
}

function maxStatus(left: string, right: string): string {
  return statusRank(right) > statusRank(left) ? statusLabel(right) : statusLabel(left);
}

function signalClass(status: string): string {
  return statusLabel(status).toLowerCase().replace(/\s+/g, "_");
}

function monotonicStatuses(entries: PitchingReplayEntry[]): string[] {
  let current = "STAY";
  return entries.map((entry) => {
    current = maxStatus(current, statusLabel(entry.recommendation.status));
    return current;
  });
}

function baseStateFlags(baseState: string | null | undefined) {
  const value = String(baseState || "").toUpperCase();
  if (/^[01]{3}$/.test(value)) {
    return { first: value[0] === "1", second: value[1] === "1", third: value[2] === "1" };
  }
  return {
    first: value.includes("1") || value.includes("FIRST") || value.includes("1B"),
    second: value.includes("2") || value.includes("SECOND") || value.includes("2B"),
    third: value.includes("3") || value.includes("THIRD") || value.includes("3B"),
  };
}

function auditWindows(summary: PitchingAuditSummaryPayload | null): PitchingAuditWindow[] {
  if (!summary) return [];
  return [
    ...(summary.missed_hook_windows ?? []),
    ...(summary.delayed_change_windows ?? []),
    ...(summary.high_leverage_holdouts ?? []),
    ...(summary.justified_stay_windows ?? []),
  ];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function looseNumber(source: unknown, keys: string[]): number | null {
  const sourceRecord = record(source);
  for (const key of keys) {
    const value = num(sourceRecord[key]);
    if (value != null) return value;
  }
  return null;
}

function featureCategory(feature: string): "Stuff" | "Command and Contact" | "Decision Context" | "Relief Alternative" {
  const key = feature.toLowerCase();
  if (key.includes("relief") || key.includes("bullpen") || key.includes("candidate") || key.includes("option")) return "Relief Alternative";
  if (key.includes("leverage") || key.includes("inning") || key.includes("tto") || key.includes("base") || key.includes("pitch_count") || key.includes("batter")) return "Decision Context";
  if (key.includes("command") || key.includes("zone") || key.includes("strike") || key.includes("contact") || key.includes("location") || key.includes("chase")) return "Command and Contact";
  return "Stuff";
}

function categoryContributorLabel(feature: string): string {
  return `${featureCategory(feature)}: ${featureLabel(feature)}`;
}

function opportunityForPitch(
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
      const leftDistance = left.pitchCount == null ? Number.POSITIVE_INFINITY : Math.abs(left.pitchCount - currentPitch);
      const rightDistance = right.pitchCount == null ? Number.POSITIVE_INFINITY : Math.abs(right.pitchCount - currentPitch);
      return leftDistance - rightDistance;
    })[0] ?? null;
}

function preventableRunsForPitch(entry: PitchingReplayEntry | null, opportunity: PreventableRunsOpportunityRow | null): number | null {
  if (!entry) return null;
  return (
    opportunity?.projectedPreventableRuns ??
    opportunity?.decisionDelta ??
    looseNumber(entry.recommendation, [
      "projectedPreventableRuns",
      "projected_preventable_runs",
      "preventableRuns",
      "preventable_runs",
      "calibratedPreventableRuns",
      "calibrated_preventable_runs",
      "projectedRunsSaved",
      "projected_runs_saved",
      "estimatedRunsSaved",
      "estimated_runs_saved",
    ])
  );
}

function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function teamCsv(value: string): string[] {
  return parseCsvList(value).map((item) => item.toUpperCase());
}

function actionPointCopy(pitcher: PitchingRecapPitcher | null): string {
  if (!pitcher) return "No starter action point was generated for this game.";
  if (pitcher.first_pull_now_inning != null) {
    return `Pull Now triggered in the ${ordinal(pitcher.first_pull_now_inning)} at pitch ${pitcher.first_pull_now_pitch_count ?? "—"}.`;
  }
  if (pitcher.first_alert_inning != null) {
    return `${statusLabel(pitcher.first_alert_status)} triggered in the ${ordinal(pitcher.first_alert_inning)} at pitch ${pitcher.first_alert_pitch_count ?? "—"}.`;
  }
  return "No model action point was generated for this starter.";
}

function exitAndDamageCopy(pitcher: PitchingRecapPitcher | null): string {
  if (!pitcher) return "Actual exit timing and scoring are unavailable.";
  const exit =
    pitcher.actual_exit_inning == null
      ? "Actual pull timing unavailable"
      : `Starter was pulled in the ${ordinal(pitcher.actual_exit_inning)} at pitch ${pitcher.actual_exit_pitch_count ?? "—"}`;
  const runs =
    pitcher.runs_allowed_after_signal == null
      ? "runs after the model signal unavailable"
      : `${pitcher.runs_allowed_after_signal} run${pitcher.runs_allowed_after_signal === 1 ? "" : "s"} scored after the model signal`;
  const pitchesAfter = looseNumber(pitcher, ["pitches_after_signal", "pitchesAfterSignal"]);
  const battersAfter = looseNumber(pitcher, ["batters_after_signal", "battersAfterSignal"]);
  const hold =
    pitchesAfter != null || battersAfter != null
      ? ` Manager held him ${pitchesAfter != null ? `${pitchesAfter} pitch${pitchesAfter === 1 ? "" : "es"}` : ""}${pitchesAfter != null && battersAfter != null ? " / " : ""}${battersAfter != null ? `${battersAfter} batter${battersAfter === 1 ? "" : "s"}` : ""} after the signal.`
      : "";
  return `${exit}; ${runs}.${hold}`;
}

function pullWindowMetrics(entry: PitchingReplayEntry | null): { stuff: string; decay: string; degradation: string } {
  if (!entry) {
    return { stuff: UNAVAILABLE, decay: UNAVAILABLE, degradation: UNAVAILABLE };
  }
  const state = entry.snapshot.starter_state;
  const decay = (state.inning_decay_factor ?? 0) + (state.tto_decay_factor ?? 0);
  return {
    stuff: `${stuffScore(entry)}/100`,
    decay: fmtNumber(decay, 2),
    degradation: fmtNumber(state.enhanced_degradation_score ?? state.degradation_score, 2),
  };
}

function relieverRssLabel(pitcher: PitchingRecapPitcher): string {
  if (pitcher.rss_score == null) return UNAVAILABLE;
  return `${statusLabel(pitcher.rss_label)} ${fmtNumber(pitcher.rss_score, 2)}`;
}

function relieverRssTimingCopy(pitcher: PitchingRecapPitcher): string {
  if (pitcher.first_alert_inning == null) {
    return pitcher.rss_score == null
      ? "No RSS score was returned for this appearance."
      : "RSS was measured for the appearance; pitch-level trigger timing was not reconstructed.";
  }
  return `${statusLabel(pitcher.first_alert_status)} in the ${ordinal(pitcher.first_alert_inning)} at pitch ${pitcher.first_alert_pitch_count ?? "—"}.`;
}

function relieverOutcomeCopy(pitcher: PitchingRecapPitcher): string {
  const runs = pitcher.runs_allowed_total == null ? "runs unavailable" : `${pitcher.runs_allowed_total} R`;
  const innings = pitcher.innings_pitched == null ? "IP unavailable" : `${fmtNumber(pitcher.innings_pitched, 1)} IP`;
  const exit =
    pitcher.actual_exit_inning == null
      ? "exit timing unavailable"
      : `exited in the ${ordinal(pitcher.actual_exit_inning)} at pitch ${pitcher.actual_exit_pitch_count ?? "—"}`;
  const after =
    pitcher.runs_allowed_after_first_alert == null
      ? "Runs after RSS trigger unavailable because pitch-level timing is unavailable."
      : `${pitcher.runs_allowed_after_first_alert} run${pitcher.runs_allowed_after_first_alert === 1 ? "" : "s"} after RSS trigger.`;
  return `${runs} in ${innings}; ${exit}. ${after}`;
}

function entryEventLabel(
  selected: PitchingReplayEntry,
  previous: PitchingReplayEntry | null,
  displayStatus: string,
  previousStatus: string,
  replay: PitchingReplayResponse,
): { title: string; detail: string; tone: "neutral" | "gold" | "bad" } {
  const scoreChanged =
    previous != null &&
    (selected.snapshot.home_score !== previous.snapshot.home_score || selected.snapshot.away_score !== previous.snapshot.away_score);
  const signalAdvanced = previous != null && statusRank(displayStatus) > statusRank(previousStatus);
  if (scoreChanged) {
    return {
      title: "Score changed",
      detail: `The game moved to ${scoreForEntry(selected, replay)} after this sequence.`,
      tone: "bad",
    };
  }
  if (signalAdvanced) {
    return {
      title: `Signal advanced to ${displayStatus}`,
      detail: `The model moved up because the combined mound evidence and game context crossed the ${displayStatus.toLowerCase()} threshold.`,
      tone: statusRank(displayStatus) >= statusRank("PULL NOW") ? "bad" : "gold",
    };
  }
  return {
    title: "Current pitch window",
    detail: `${selected.snapshot.pitcher_name} at pitch ${pitchCount(selected)} in the ${halfInningLabel(selected.snapshot.half, selected.snapshot.inning)}.`,
    tone: "neutral",
  };
}

function matrixCellForDecision(decision: PitcherDecision, bestOption: BullpenOption | null): MatrixCell {
  const lateStuff = avg(decision.stuffCurve.slice(-2));
  const starterAbove = (lateStuff ?? 50) >= 55 && (decision.cliffProbability ?? 0.5) < 0.6;
  const penAbove = (bestOption?.netOptionScore ?? bestOption?.matchupFit ?? 0) >= 0.45;
  if (starterAbove && penAbove) return "standard";
  if (!starterAbove && penAbove) return "tandem";
  if (starterAbove && !penAbove) return "push";
  return "workload";
}

function matrixCellForWindow(window: PitchingAuditWindow): MatrixCell {
  const starter = record(window.starter);
  const candidate = record(window.top_candidate);
  const starterAbove = (num(starter.degradation_score) ?? 2) < 1.15;
  const penAbove = Math.max(num(candidate.net_option_score) ?? 0, num(candidate.direct_matchup_fit) ?? 0) >= 0.45;
  if (starterAbove && penAbove) return "standard";
  if (!starterAbove && penAbove) return "tandem";
  if (starterAbove && !penAbove) return "push";
  return "workload";
}

function auditSeverity(row: AuditRow): number {
  if (row.timing === "Late") return 4;
  if (row.timing === "Held") return 3;
  if (row.timing === "Early") return 2;
  return 1;
}

function gameLabel(game: EnterpriseGameSummary | null): string {
  if (!game) return "Select game";
  return `${game.away_team} @ ${game.home_team} · ${game.date}`;
}

function selectedTeamPitchers(recap: PitchingGameRecap | null, team: Team) {
  return recap?.starters.filter((pitcher) => pitcher.team === team.abbr) ?? [];
}

function teamPitcherRecapCopy(pitcher: PitchingRecapPitcher | null): string {
  if (!pitcher) return "No pitcher-specific recap has been generated for this club yet.";
  const firstAction =
    pitcher.first_pull_now_inning != null
      ? `Pull Now in the ${ordinal(pitcher.first_pull_now_inning)} at pitch ${pitcher.first_pull_now_pitch_count ?? "—"}`
      : pitcher.first_alert_inning != null
        ? `${statusLabel(pitcher.first_alert_status)} in the ${ordinal(pitcher.first_alert_inning)} at pitch ${pitcher.first_alert_pitch_count ?? "—"}`
        : "No clear action point";
  const result =
    pitcher.runs_allowed_after_signal == null
      ? "post-signal scoring unavailable"
      : `${pitcher.runs_allowed_after_signal} run${pitcher.runs_allowed_after_signal === 1 ? "" : "s"} after the signal`;
  const exit =
    pitcher.actual_exit_inning == null
      ? "exit timing unavailable"
      : `exited in the ${ordinal(pitcher.actual_exit_inning)} at pitch ${pitcher.actual_exit_pitch_count ?? "—"}`;
  return `${firstAction}; ${exit}; ${result}.`;
}

function TeamLogo({ abbr }: { abbr: string }) {
  const src = teamLogoUrl(abbr);
  return <span className="team-logo">{src ? <img src={src} alt={`${abbr} logo`} /> : abbr}</span>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function KPI({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "good" | "bad" | "gold" }) {
  return (
    <article className={`kpi kpi--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function SourceTag({ label, source }: { label: string; source: "official" | "model" | "rule" | "unavailable" }) {
  return <span className={`source-tag source-tag--${source}`}>{label}</span>;
}

function GaugeMetric({
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
    <div className={`evidence-gauge evidence-gauge--${tone}`}>
      <div className="evidence-gauge-head">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      {percent != null ? (
        <div className="gauge-track" aria-hidden="true">
          <i style={{ width: `${width}%` }} />
        </div>
      ) : null}
      {detail ? <em>{detail}</em> : null}
    </div>
  );
}

function TrendSparkline({ label, value, detail, points }: { label: string; value: string; detail?: string; points: Array<number | null | undefined> }) {
  const numbers = points.filter((point): point is number => typeof point === "number" && Number.isFinite(point));
  if (numbers.length < 2) {
    return <GaugeMetric label={label} value={value} detail={detail ?? "Trend unavailable"} />;
  }
  const width = 180;
  const height = 46;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const range = Math.max(0.01, max - min);
  const path = numbers
    .map((point, index) => {
      const x = (index / Math.max(1, numbers.length - 1)) * width;
      const y = height - ((point - min) / range) * (height - 8) - 4;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="sparkline-card">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail ? <em>{detail}</em> : null}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} trend`}>
        <path className="sparkline-baseline" d={`M0 ${height - 4} H${width}`} />
        <path className="sparkline-path" d={path} />
      </svg>
    </div>
  );
}

function MiniCurve({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="small-muted">Trajectory unavailable</span>;
  const width = 220;
  const height = 72;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - ((value - 20) / 80) * height;
      return `${x},${Math.max(5, Math.min(height - 5, y))}`;
    })
    .join(" ");
  return (
    <svg className="mini-curve" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stuff trajectory">
      <path d={`M0 ${height * 0.5} H${width}`} />
      <polyline points={points} />
    </svg>
  );
}

function BasesAndOuts({ baseState, outs }: { baseState: string | null | undefined; outs: number | null | undefined }) {
  const bases = baseStateFlags(baseState);
  return (
    <div className="bases-outs">
      <div className="outs">
        {[0, 1, 2].map((index) => (
          <span key={index} className={(outs ?? 0) > index ? "filled" : ""} />
        ))}
      </div>
      <div className="bases">
        <i className={bases.second ? "filled second" : "second"} />
        <i className={bases.third ? "filled third" : "third"} />
        <i className={bases.first ? "filled first" : "first"} />
      </div>
    </div>
  );
}

function PitchPlot({ entries, selectedIndex }: { entries: PitchingReplayEntry[]; selectedIndex: number }) {
  const plotted = entries.slice(0, selectedIndex + 1).slice(-80);
  return (
    <div className="strike-zone-card">
      <div className="plate-zone">
        <div className="zone-box" />
        {plotted.map((entry, index) => {
          const px = typeof entry.snapshot.px === "number" ? entry.snapshot.px : 0;
          const pz = typeof entry.snapshot.pz === "number" ? entry.snapshot.pz : 2.5;
          const left = Math.max(7, Math.min(93, 50 + px * 18));
          const top = Math.max(7, Math.min(93, 84 - pz * 19));
          const selected = index === plotted.length - 1;
          return (
            <span
              key={`${entry.snapshot.pitch_id}-${index}`}
              className={selected ? "pitch-dot selected" : "pitch-dot"}
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              {selected ? pitchCount(entry) : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function SignalTimeline({
  entries,
  statuses,
  selectedIndex,
  onSelect,
}: {
  entries: PitchingReplayEntry[];
  statuses: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="signal-timeline" aria-label="Pitch-by-pitch signal timeline">
      {entries.map((entry, index) => {
        const status = statuses[index] ?? statusLabel(entry.recommendation.status);
        const selected = index === selectedIndex;
        return (
          <button
            key={`${entry.snapshot.pitch_id}-${index}`}
            type="button"
            className={`timeline-segment timeline-${signalClass(status)}${selected ? " selected" : ""}`}
            title={`Pitch ${pitchCount(entry)} · ${status}`}
            aria-label={`Pitch ${pitchCount(entry)} signal ${status}`}
            onClick={() => onSelect(index)}
          />
        );
      })}
    </div>
  );
}

function Header({
  team,
  workflow,
  loadState,
  onRefresh,
  onTeamChange,
  onWorkflowChange,
}: {
  team: Team;
  workflow: Workflow;
  loadState: LoadState;
  onRefresh: () => void;
  onTeamChange: (team: Team) => void;
  onWorkflowChange: (workflow: Workflow) => void;
}) {
  return (
    <header className="app-header">
      <div className="brand-panel">
        <p className="eyebrow">Baseball brAIn · Professional Operational Intelligence</p>
        <h1>Baseball brAIn</h1>
        <p>Pitcher Intelligence — every pitch, every pitcher, every situation.</p>
      </div>
      <div className="controls-panel">
        <div className="status-pill">
          <i className={loadState === "ready" ? "ready" : "pending"} />
          {loadState === "ready" ? "Data ready" : loadState === "loading" ? "Loading" : "Needs attention"}
        </div>
        <label>
          MLB club
          <select
            value={team.abbr}
            onChange={(event) => {
              const next = MLB_TEAMS.find((item) => item.abbr === event.target.value);
              if (next) onTeamChange(next);
            }}
          >
            {MLB_TEAMS.map((item) => (
              <option key={item.abbr} value={item.abbr}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <nav className="workflow-nav" aria-label="Primary workflows">
        {WORKFLOWS.map((item) => (
          <button key={item.id} type="button" className={workflow === item.id ? "active" : ""} onClick={() => onWorkflowChange(item.id)}>
            <strong>{item.label}</strong>
            <span>{item.question}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}

function useRunSavingBoard({ league, team, limit }: { league: "mlb" | "triple_a"; team?: string; limit?: number }) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [payload, setPayload] = useState<RunSavingBoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    setError(null);
    try {
      const data = await fetchRunSavingBoard({ league, team, limit });
      setPayload(data);
      setLoadState("ready");
    } catch (caught) {
      if (caught instanceof ApiConfigurationError) {
        setLoadState("missing-config");
      } else {
        setError(caught instanceof Error ? caught.message : String(caught));
        setLoadState("error");
      }
    }
  }, [league, team, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return { loadState, payload, error, reload: load };
}

function usePreventableRunsOpportunities({ season, team, limit }: { season: string; team: string; limit: number }) {
  const [payload, setPayload] = useState<PreventableRunsOpportunitiesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPreventableRunsOpportunities({ season, team, limit });
      setPayload(data);
    } catch (caught) {
      setPayload(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [season, team, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return { payload, error, loading, reload: load };
}

type CalibratedGameOpportunity = {
  row: PreventableRunsOpportunityRow;
  windowCount: number;
  pitcherCount: number;
};

function CalibratedOpportunityRow({
  opportunity,
  onOpenGameAudit,
}: {
  opportunity: CalibratedGameOpportunity;
  onOpenGameAudit: (gameId: string) => void;
}) {
  const { row, windowCount, pitcherCount } = opportunity;
  const topDrivers = (row.topFeatures ?? [])
    .filter((feature) => typeof feature.contribution === "number" && feature.contribution > 0)
    .slice(0, 3);
  const half = row.half ? normalize(row.half) : "Half unavailable";
  const context = `${row.inning ?? "—"}${row.inning === 1 ? "st" : row.inning === 2 ? "nd" : row.inning === 3 ? "rd" : "th"} inning · ${half} · ${row.outs ?? "—"} out · Bases ${row.baseState ?? "—"}`;
  const priority = Math.round((row.calibratedPreventableSignal ?? row.projectedDamageProbability ?? 0) * 100);
  const reviewLevel = priority >= 95 ? "Immediate review" : priority >= 85 ? "High priority" : "Review";

  return (
    <button type="button" className="calibrated-row" onClick={() => row.gameId && onOpenGameAudit(row.gameId)}>
      <div>
        <strong>{row.team || "Team"} vs {row.opponent || "Opponent"}</strong>
        <span>{formatDateText(row.gameDate)} · {windowCount} flagged situation{windowCount === 1 ? "" : "s"} · {pitcherCount} pitcher{pitcherCount === 1 ? "" : "s"}</span>
      </div>
      <div>
        <strong>{row.pitcherName}</strong>
        <span>Best review point: {context}, pitch {row.pitchCount ?? "—"}</span>
      </div>
      <div>
        <strong>{reviewLevel}</strong>
        <span>Priority score {priority}/100 · leverage {fmtNumber(row.leverageIndex, 2)}</span>
      </div>
      <div>
        <strong>{fmtPct(row.projectedDamageProbability)} damage risk</strong>
        <span>Comparable situations: {fmtRuns(row.projectedPreventableRuns)} run band</span>
      </div>
      <div className="driver-list">
        {topDrivers.length === 0 ? (
          <span className="driver-chip">Drivers unavailable</span>
        ) : (
          topDrivers.map((feature) => (
            <span key={feature.feature} className="driver-chip">
              {featureLabel(feature.feature)}
            </span>
          ))
        )}
      </div>
    </button>
  );
}

function calibratedGameKey(row: PreventableRunsOpportunityRow): string {
  return row.gameId || [row.gameDate ?? "date", row.team ?? "team", row.opponent ?? "opponent"].join("|");
}

function calibratedPriorityValue(row: PreventableRunsOpportunityRow): number {
  return row.calibratedPreventableSignal ?? row.projectedDamageProbability ?? row.projectedPreventableRuns ?? 0;
}

function groupCalibratedOpportunitiesByGame(rows: PreventableRunsOpportunityRow[]): CalibratedGameOpportunity[] {
  const grouped = new Map<string, { best: PreventableRunsOpportunityRow; windows: PreventableRunsOpportunityRow[] }>();
  for (const row of rows) {
    const key = calibratedGameKey(row);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { best: row, windows: [row] });
      continue;
    }
    existing.windows.push(row);
    if (calibratedPriorityValue(row) > calibratedPriorityValue(existing.best)) {
      existing.best = row;
    }
  }
  return Array.from(grouped.values())
    .map((group) => ({
      row: group.best,
      windowCount: group.windows.length,
      pitcherCount: new Set(group.windows.map((row) => row.pitcherId || row.pitcherName).filter(Boolean)).size,
    }))
    .sort((a, b) => calibratedPriorityValue(b.row) - calibratedPriorityValue(a.row));
}

function CommandCenter({
  team,
  payload,
  preventableRuns,
  preventableRunsError,
  preventableRunsLoading,
  profiles,
  audits,
  auditSummary,
  bullpenOptions,
  onOpenAudit,
  onOpenGameAudit,
}: {
  team: Team;
  payload: RunSavingBoardPayload;
  preventableRuns: PreventableRunsOpportunitiesPayload | null;
  preventableRunsError: string | null;
  preventableRunsLoading: boolean;
  profiles: PitcherProfile[];
  audits: AuditRow[];
  auditSummary: PitchingAuditSummaryPayload | null;
  bullpenOptions: BullpenOption[];
  onOpenAudit: () => void;
  onOpenGameAudit: (gameId: string) => void;
}) {
  const seasonRuns = sum(profiles.map((profile) => profile.projectedRunsSaved));
  const boardRuns = sum(payload.decisions.map((decision) => decision.projectedRunsSaved));
  const calibratedSummary = preventableRuns?.summary ?? null;
  const calibratedRows = preventableRuns?.rows ?? [];
  const calibratedRuns =
    calibratedSummary?.totalProjectedPreventableRuns ?? sum(calibratedRows.map((row) => row.projectedPreventableRuns));
  const displayedRuns = calibratedSummary || calibratedRows.length > 0 ? calibratedRuns : seasonRuns || boardRuns;
  const windows = auditWindows(auditSummary);
  const bestOption = bullpenOptions.slice().sort((a, b) => (b.netOptionScore ?? -Infinity) - (a.netOptionScore ?? -Infinity))[0] ?? null;
  const decisionMatrix = payload.decisions.reduce(
    (counts, decision) => {
      counts[matrixCellForDecision(decision, bestOption)] += 1;
      return counts;
    },
    { standard: 0, tandem: 0, push: 0, workload: 0 },
  );
  const auditMatrix = windows.reduce(
    (counts, window) => {
      counts[matrixCellForWindow(window)] += 1;
      return counts;
    },
    { standard: 0, tandem: 0, push: 0, workload: 0 },
  );
  const [matrixFilter, setMatrixFilter] = useState<MatrixCell | "all">("all");
  const boardRows = audits.map((row) => ({
    id: row.id,
    game: row.game,
    pitcher: row.pitcher || row.decision,
    recommended: row.recommendedDecision || row.decision,
    actual: row.actualDecision || UNAVAILABLE,
    alternative: row.bestAlternative || UNAVAILABLE,
    detail: row.inning || row.timing,
    runs: row.projectedRunsSaved ?? row.modelImpliedRunsSaved ?? null,
    severity: auditSeverity(row),
    cell: null as MatrixCell | null,
  }));
  const windowRows = windows.map((window, index) => {
    const starter = record(window.starter);
    const candidate = record(window.top_candidate);
    const cell = matrixCellForWindow(window);
    return {
      id: `${String(window.game_id ?? window.game_pk ?? "window")}-${index}`,
      game: `${String(window.game_date ?? window.matchup ?? window.game_id ?? "Game")}`,
      pitcher: String(window.pitcher_name ?? starter.pitcher_name ?? window.pitcher ?? "Pitcher"),
      recommended: statusLabel(String(window.status ?? "Decision")),
      actual: String(window.actual_outcome ?? window.note ?? "Observed decision pending"),
      alternative: String(candidate.player_name ?? UNAVAILABLE),
      detail: String(window.inning ?? "Inning unavailable"),
      runs: num(window.projected_runs_saved) ?? num(window.estimated_runs_saved),
      severity: cell === "tandem" ? 4 : cell === "workload" ? 3 : 2,
      cell,
    };
  });
  const opportunityRows = (matrixFilter === "all" ? [...boardRows, ...windowRows] : windowRows.filter((row) => row.cell === matrixFilter))
    .sort((a, b) => (b.runs ?? -Infinity) - (a.runs ?? -Infinity) || b.severity - a.severity)
    .slice(0, 8);
  const topProfile = profiles.slice().sort((a, b) => (b.projectedRunsSaved ?? -Infinity) - (a.projectedRunsSaved ?? -Infinity))[0] ?? null;
  const topCalibratedGames = groupCalibratedOpportunitiesByGame(calibratedRows).slice(0, 6);

  return (
    <section className="workflow">
      <div className="page-lead">
        <div>
          <p className="eyebrow">{team.name}</p>
          <h2>Run prevention opportunity, distilled.</h2>
          <p>
            Start here. This page summarizes where the model found defensible chances to reduce runs, then routes each case into a game audit or allocation review.
          </p>
        </div>
        <TeamLogo abbr={team.abbr} />
      </div>

      <div className="kpi-row">
        <KPI label="Preventable Run Exposure" value={fmtRuns(displayedRuns)} detail="Season-to-date estimate of where better staff deployment may have reduced scoring." tone="gold" />
        <KPI label="Games to Review" value={String(topCalibratedGames.length || opportunityRows.length)} detail="Highest-priority games for pitching staff and front-office review." tone="bad" />
        <KPI label="Tandem Opportunities" value={String(auditMatrix.tandem || decisionMatrix.tandem)} detail="Cases where the starter was fading and a relief path deserved review." tone="bad" />
        <KPI label="Pitchers Covered" value={String(profiles.length)} detail={`${payload.summary.sourceGameCount ?? 0} games included in the current evidence set.`} />
      </div>

      <article className="panel calibrated-panel">
        <div className="panel-title horizontal">
          <div>
            <p className="eyebrow">Run Prevention Review Queue</p>
            <h3>Start with these games.</h3>
            <p>
              One row per game. Each row identifies the point where the club had the clearest opportunity to reconsider pitcher usage, then opens the pitch-level audit.
            </p>
          </div>
          <SourceTag label={preventableRuns?.status === "available" ? "Evidence ready" : preventableRunsLoading ? "Loading evidence" : "Evidence unavailable"} source={preventableRuns?.status === "available" ? "model" : "unavailable"} />
        </div>
        {preventableRunsLoading ? (
          <EmptyState title="Loading review queue" detail="Retrieving the current staff-deployment opportunity set." />
        ) : preventableRunsError ? (
          <EmptyState title="Review queue unavailable" detail={preventableRunsError} />
        ) : topCalibratedGames.length === 0 ? (
          <EmptyState title="No games returned" detail="The evidence source is reachable, but no game-level review rows matched this club and season." />
        ) : (
          <>
            <div className="calibrated-metrics">
              <KPI
                label="Reviewed Situations"
                value={String(calibratedSummary?.windowCount ?? preventableRuns?.rowCount ?? topCalibratedGames.length)}
                detail="Pitch-level situations screened for staff-deployment opportunity."
              />
              <KPI
                label="Avg Scoring Risk"
                value={fmtPct(calibratedSummary?.avgProjectedDamageProbability)}
                detail="Average risk that a flagged situation led to additional scoring."
                tone="bad"
              />
              <KPI
                label="Actual Damage Rate"
                value={fmtPct(calibratedSummary?.damageRate)}
                detail={`${calibratedSummary?.missedHookDamageCount ?? 0} flagged situations were followed by scoring damage.`}
              />
            </div>
            <div className="calibrated-list">
              {topCalibratedGames.map((opportunity) => (
                <CalibratedOpportunityRow
                  key={calibratedGameKey(opportunity.row)}
                  opportunity={opportunity}
                  onOpenGameAudit={onOpenGameAudit}
                />
              ))}
            </div>
          </>
        )}
      </article>

      <div className="two-column">
        <article className="panel matrix-panel">
          <div className="panel-title">
            <p className="eyebrow">Deployment Matrix</p>
            <h3>Where staff decisions become run-prevention opportunities.</h3>
          </div>
          <div className="matrix-grid">
            <button type="button" onClick={() => setMatrixFilter("standard")} className="matrix-cell">
              <span>Above-average starter · above-average pen</span>
              <strong>Standard usage</strong>
              <em>{auditMatrix.standard || decisionMatrix.standard} cases</em>
            </button>
            <button type="button" onClick={() => setMatrixFilter("tandem")} className="matrix-cell target">
              <span>Below-average starter · above-average pen</span>
              <strong>Tandem opportunity</strong>
              <em>{auditMatrix.tandem || decisionMatrix.tandem} cases</em>
            </button>
            <button type="button" onClick={() => setMatrixFilter("push")} className="matrix-cell">
              <span>Above-average starter · thin pen</span>
              <strong>Push the starter</strong>
              <em>{auditMatrix.push || decisionMatrix.push} cases</em>
            </button>
            <button type="button" onClick={() => setMatrixFilter("workload")} className="matrix-cell">
              <span>Below-average starter · thin pen</span>
              <strong>Workload management</strong>
              <em>{auditMatrix.workload || decisionMatrix.workload} cases</em>
            </button>
          </div>
          <button type="button" className="text-button" onClick={() => setMatrixFilter("all")}>
            Show all opportunity cases
          </button>
        </article>

        <article className="panel insight-panel">
          <p className="eyebrow">What to do first</p>
          <h3>{topProfile ? `Start with ${topProfile.pitcher}` : "Start with finalized game audits"}</h3>
          <p>
            {topProfile
              ? `${topProfile.pitcher} carries ${fmtRuns(topProfile.projectedRunsSaved)} preventable runs across ${topProfile.appearances} appearances. Use the game log to determine whether this is repeat late-start decay, bullpen constraint, or roster fit.`
              : "Once pitcher profiles are available, this card will identify the first staff member to review."}
          </p>
          <div className="source-row">
            <SourceTag label="Pitch facts" source="official" />
            <SourceTag label="Degradation model" source="model" />
            <SourceTag label="Availability" source="rule" />
          </div>
        </article>
      </div>

      <article className="panel">
        <div className="panel-title horizontal">
          <div>
            <p className="eyebrow">Opportunity List</p>
            <h3>Highest-priority windows to audit.</h3>
          </div>
          <button type="button" onClick={onOpenAudit}>
            Open Game Audit
          </button>
        </div>
        {opportunityRows.length === 0 ? (
          <EmptyState title="No audit cases returned" detail="The board has no finalized audit rows for the selected club yet." />
        ) : (
          <div className="opportunity-table">
            <div className="table-head">
              <span>Game / Pitcher</span>
              <span>Model Window</span>
              <span>Actual Move</span>
              <span>Best Alternative</span>
              <span>Preventable Runs</span>
            </div>
            {opportunityRows.map((row) => (
              <button key={row.id} type="button" className="table-row" onClick={onOpenAudit}>
                <span>
                  <strong>{row.pitcher}</strong>
                  <em>{row.game}</em>
                </span>
                <span>
                  <strong>{row.recommended}</strong>
                  <em>{row.detail}</em>
                </span>
                <span>
                  <strong>{row.actual}</strong>
                  <em>{row.cell ? normalize(row.cell) : "Board audit row"}</em>
                </span>
                <span>{row.alternative}</span>
                <span className="runs">{fmtRuns(row.runs)}</span>
              </button>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

function GameAudit({
  team,
  games,
  selectedGameId,
  onGameChange,
  replay,
  recap,
  preventableRows,
}: {
  team: Team;
  games: EnterpriseGameSummary[];
  selectedGameId: string | null;
  onGameChange: (id: string) => void;
  replay: PitchingReplayResponse | null;
  recap: PitchingGameRecap | null;
  preventableRows: PreventableRunsOpportunityRow[];
}) {
  const [pitchIndex, setPitchIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const entries = useMemo(
    () => (replay?.entries ?? []).filter((entry) => entry.snapshot.fielding_team === team.abbr).sort((a, b) => pitchCount(a) - pitchCount(b)),
    [replay, team.abbr],
  );
  const selectedIndex = Math.min(pitchIndex, Math.max(0, entries.length - 1));
  const displayStatuses = useMemo(() => monotonicStatuses(entries), [entries]);
  const selected = entries[selectedIndex] ?? null;
  const displayStatus = selected ? displayStatuses[selectedIndex] ?? statusLabel(selected.recommendation.status) : "STAY";
  const previous = selectedIndex > 0 ? entries[selectedIndex - 1] ?? null : null;
  const previousStatus = selectedIndex > 0 ? displayStatuses[selectedIndex - 1] ?? "STAY" : "STAY";
  const selectedGame = games.find((game) => game.game_id === selectedGameId) ?? games[0] ?? null;
  const teamPitchers = selectedTeamPitchers(recap, team);
  const teamStarters = teamPitchers.filter((pitcher) => statusLabel(pitcher.role) !== "RELIEVER");
  const teamRelievers = teamPitchers.filter((pitcher) => statusLabel(pitcher.role) === "RELIEVER");
  const keyPitcher = teamStarters.find((pitcher) => pitcher.first_pull_now_inning != null || pitcher.first_alert_inning != null) ?? teamStarters[0] ?? teamPitchers[0] ?? null;
  const pullIndex = displayStatuses.findIndex((status) => statusRank(status) >= statusRank("PULL NOW"));
  const pullEntry = pullIndex >= 0 ? entries[pullIndex] ?? null : null;
  const pullMetrics = pullWindowMetrics(pullEntry);
  const pullBestCandidate = pullEntry?.top_candidates?.find((candidate) => candidate.available) ?? pullEntry?.top_candidates?.[0] ?? null;
  const pullDecisionDelta = pullEntry?.recommendation.decision_delta ?? selected?.recommendation.decision_delta ?? null;
  const hasWatchSignal = statusRank(displayStatus) >= statusRank("WATCH");
  const bestCandidate = selected?.top_candidates?.find((candidate) => candidate.available) ?? selected?.top_candidates?.[0] ?? null;
  const selectedState = selected?.snapshot.starter_state ?? null;
  const selectedOpportunity = opportunityForPitch(selected, preventableRows, selectedGameId);
  const selectedPreventableRuns = preventableRunsForPitch(selected, selectedOpportunity);
  const eventLabel = selected && replay ? entryEventLabel(selected, previous, displayStatus, previousStatus, replay) : null;
  const degradationPressure = selectedState?.normalized_degradation_score ?? scaledPercent(selectedState?.enhanced_degradation_score ?? selectedState?.degradation_score, 3);
  const commandPressure = Math.max(
    scaledPercent(selectedState?.zone_miss_distance_10, 0.8),
    scaledPercent(selectedState?.location_dispersion_10, 1.4),
    scaledPercent(selectedState?.ball_rate_10, 1),
  );
  const stuffPressure = Math.max(
    scaledPercent(Math.abs(selected ? velocityDrop(selected) ?? 0 : 0), 4),
    scaledPercent(Math.abs(selectedState?.spin_slope_5 ?? 0), 250),
    scaledPercent(Math.abs(selectedState?.pitch_mix_drift_10 ?? 0), 1),
  );
  const decayPressure = scaledPercent((selectedState?.inning_decay_factor ?? 0) + (selectedState?.tto_decay_factor ?? 0), 3);
  const topComponents = Object.entries(selectedState?.component_contributions ?? {})
    .sort((a, b) => Math.abs(b[1] ?? 0) - Math.abs(a[1] ?? 0))
    .slice(0, 5);
  const velocityTrend = [
    selectedState?.seasonal_velo_baseline,
    selectedState?.velo_mean_15,
    selectedState?.velo_mean_10,
    selectedState?.velo_mean_5,
    selected?.snapshot.release_speed,
  ];
  const spinTrend = [
    selectedState?.seasonal_spin_baseline,
    selectedState?.spin_mean_15,
    selectedState?.spin_mean_10,
    selectedState?.spin_mean_5,
  ];
  const reliefOptions = selected?.top_candidates?.slice(0, 3) ?? [];

  useEffect(() => {
    setPitchIndex(0);
    setAutoplay(false);
    setEmailStatus(null);
  }, [selectedGameId]);

  useEffect(() => {
    if (!autoplay || entries.length <= 1) return;
    const interval = window.setInterval(() => {
      setPitchIndex((current) => {
        const next = Math.min(entries.length - 1, current + 1);
        if (next === current) window.clearInterval(interval);
        return next;
      });
    }, 850);
    return () => window.clearInterval(interval);
  }, [autoplay, entries.length]);

  useEffect(() => {
    if (selectedIndex >= entries.length - 1) setAutoplay(false);
  }, [entries.length, selectedIndex]);

  async function handleSendRecapEmail() {
    if (!selectedGameId) return;
    setEmailStatus("Sending briefing...");
    try {
      const response = await sendPitchingRecapEmail({ game_id: selectedGameId, team: team.abbr, send: true }, "mlb");
      const recipients = response.sent_to?.length ? response.sent_to.join(", ") : response.recipients?.join(", ");
      setEmailStatus(response.sent ? `Briefing sent${recipients ? ` to ${recipients}` : ""}.` : "Briefing generated, but no email was sent.");
    } catch (caught) {
      setEmailStatus(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <section className="workflow">
      <div className="page-lead compact">
        <div>
          <p className="eyebrow">Game Audit</p>
          <h2>Observed decision, model window, and pitch-level evidence.</h2>
          <p>Use this page when a club asks, “Show me exactly where we should have acted and what happened after.”</p>
        </div>
        <label className="game-select">
          Game
          <select value={selectedGameId ?? ""} onChange={(event) => onGameChange(event.target.value)}>
            {games.map((game) => (
              <option key={game.game_id} value={game.game_id}>
                {gameLabel(game)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!selectedGameId || !replay || !selected ? (
        <EmptyState title="No replay loaded" detail="Select a completed game with finalized pitch-level replay detail." />
      ) : (
        <>
          <article className="panel replay-panel">
            <div className={`signal-banner signal-${signalClass(displayStatus)}`}>
              <strong>{displayStatus}</strong>
            </div>
            {eventLabel ? (
              <div className={`event-callout event-callout--${eventLabel.tone}`}>
                <strong>{eventLabel.title}</strong>
                <span>{eventLabel.detail}</span>
              </div>
            ) : null}

            <div className="replay-layout">
              <aside className="situation-card">
                <TeamLogo abbr={team.abbr} />
                <h3>{selected.snapshot.pitcher_name}</h3>
                <BasesAndOuts baseState={selected.snapshot.base_state} outs={selected.snapshot.outs} />
                <div className="situation-list">
                  <span>Situation <strong>{halfInningLabel(selected.snapshot.half, selected.snapshot.inning)}</strong></span>
                  <span>Bases <strong>{baseStateLabel(selected.snapshot.base_state)}</strong></span>
                  <span>Outs <strong>{outsLabel(selected.snapshot.outs)}</strong></span>
                  <span>Pitch count <strong>{pitchCount(selected)}</strong></span>
                  <span>Times through order <strong>{selected.snapshot.starter_state.times_through_order}</strong></span>
                  <span>Score <strong>{scoreForEntry(selected, replay)}</strong></span>
                </div>
              </aside>

              <PitchPlot entries={entries} selectedIndex={selectedIndex} />

              <aside className="model-synthesis-card">
                <p className="eyebrow">Decision Read</p>
                <div className="decision-score-row">
                  <div className="degradation-ring" style={{ "--ring": `${Math.round(clamp(degradationPressure) * 100)}%` } as CSSProperties}>
                    <strong>{fmtNumber(selected.snapshot.starter_state.enhanced_degradation_score ?? selected.snapshot.starter_state.degradation_score, 2)}</strong>
                    <span>degradation</span>
                  </div>
                  <div>
                    <span>Preventable Runs</span>
                    <strong>{fmtRuns(selectedPreventableRuns)}</strong>
                    <em>{selectedOpportunity ? "Calibrated opportunity model" : "Not attached to this pitch window"}</em>
                  </div>
                </div>
                <div className="decision-gauge-grid">
                  <GaugeMetric label="Stuff pressure" value={fmtPct(stuffPressure)} percent={stuffPressure} tone="bad" />
                  <GaugeMetric label="Command pressure" value={fmtPct(commandPressure)} percent={commandPressure} tone="warn" />
                  <GaugeMetric label="Decay pressure" value={fmtPct(decayPressure)} percent={decayPressure} tone="gold" />
                  <GaugeMetric label="Leverage" value={fmtNumber(selected.snapshot.leverage_index, 2)} percent={scaledPercent(selected.snapshot.leverage_index, 3)} tone="gold" />
                </div>
                <div className="decision-delta">
                  <strong>{hasWatchSignal ? "Relief decision delta" : "Relief context unlocks at WATCH"}</strong>
                  {hasWatchSignal ? (
                    <p>
                      {bestCandidate?.player_name || "Best alternative"} changes the next-batter pocket by{" "}
                      <b>{fmtSigned(selected.recommendation.decision_delta, 2)}</b> runs versus staying with the starter.
                    </p>
                  ) : (
                    <p>Before WATCH, the replay stays focused on pitcher evidence. Bullpen alternatives are shown once the first action signal appears.</p>
                  )}
                </div>
                <div className="source-row">
                  <SourceTag label="Official pitch facts" source="official" />
                  <SourceTag label="Model degradation" source="model" />
                </div>
              </aside>
            </div>

            <SignalTimeline entries={entries} statuses={displayStatuses} selectedIndex={selectedIndex} onSelect={setPitchIndex} />
            <div className="pitch-controls">
              <button type="button" onClick={() => setPitchIndex(Math.max(0, pitchIndex - 1))}>Previous</button>
              <input
                type="range"
                min={0}
                max={Math.max(0, entries.length - 1)}
                value={Math.min(pitchIndex, Math.max(0, entries.length - 1))}
                onChange={(event) => setPitchIndex(Number(event.target.value))}
              />
              <button type="button" className={autoplay ? "active" : ""} onClick={() => setAutoplay((current) => !current)}>
                {autoplay ? "Pause" : "Autoplay"}
              </button>
              <button type="button" onClick={() => setPitchIndex(Math.min(entries.length - 1, pitchIndex + 1))}>Next</button>
              <button type="button" disabled={pullIndex < 0} onClick={() => setPitchIndex(pullIndex >= 0 ? pullIndex : pitchIndex)}>Jump to Pull Now</button>
            </div>
          </article>

          <article className="panel evidence-panel">
            <div className="panel-title">
              <p className="eyebrow">Supporting Model Detail</p>
              <h3>Why the signal moved.</h3>
              <p>The headline read above is built from these tracked inputs. Missing values are shown as unavailable rather than estimated.</p>
            </div>
            <div className="evidence-grid">
              <section>
                <h4>Stuff</h4>
                <TrendSparkline
                  label="Fastball velocity"
                  value={`${fmtNumber(selected.snapshot.release_speed ?? selectedState?.velo_mean_5, 1)} mph`}
                  detail={`Baseline ${fmtNumber(selectedState?.seasonal_velo_baseline, 1)} · trend ${fmtSigned(selectedState?.velo_slope_5, 2)} mph`}
                  points={velocityTrend}
                />
                <TrendSparkline
                  label="Fastball spin"
                  value={`${fmtNumber(selectedState?.spin_mean_5, 0)} rpm`}
                  detail={`Baseline ${fmtNumber(selectedState?.seasonal_spin_baseline, 0)} · trend ${fmtSigned(selectedState?.spin_slope_5, 0)} rpm`}
                  points={spinTrend}
                />
                <GaugeMetric label="Swinging-strike rate" value={fmtRate(selectedState?.whiff_rate_15)} detail={`Opponent-adjusted change ${fmtSigned(selectedState?.opponent_adjusted_whiff_drop, 2)}`} percent={selectedState?.whiff_rate_15 ?? undefined} tone="gold" />
                <GaugeMetric label="Pitch mix drift" value={fmtNumber(selectedState?.pitch_mix_drift_10, 2)} detail="How far recent pitch selection has moved from expected mix." percent={scaledPercent(selectedState?.pitch_mix_drift_10, 1)} tone="warn" />
              </section>
              <section>
                <h4>Command and Contact</h4>
                <GaugeMetric label="Strike rate" value={fmtRate(selectedState?.strike_rate_10)} detail="Last 10 pitches." percent={selectedState?.strike_rate_10 ?? undefined} tone="good" />
                <GaugeMetric label="Called-strike rate" value={fmtRate(selectedState?.called_strike_rate_15)} detail="Called strikes over the recent command window." percent={selectedState?.called_strike_rate_15 ?? undefined} tone="good" />
                <GaugeMetric label="Chase rate proxy" value={fmtRate(selectedState?.chase_proxy_rate_15)} detail="Hitters expanding against him." percent={selectedState?.chase_proxy_rate_15 ?? undefined} tone="good" />
                <GaugeMetric label="Hard contact" value={fmtRate(selectedState?.hard_contact_rate_15)} detail="Recent contact-quality pressure." percent={selectedState?.hard_contact_rate_15 ?? undefined} tone="bad" />
                <GaugeMetric label="Zone miss" value={`${fmtNumber(selectedState?.zone_miss_distance_10, 2)} ft`} detail={`5-pitch window ${fmtNumber(selectedState?.zone_miss_distance_5, 2)} ft.`} percent={scaledPercent(selectedState?.zone_miss_distance_10, 0.8)} tone="warn" />
                <GaugeMetric label="Command spread" value={fmtNumber(selectedState?.location_dispersion_10, 2)} detail={`5-pitch spread ${fmtNumber(selectedState?.location_dispersion_5, 2)}.`} percent={scaledPercent(selectedState?.location_dispersion_10, 1.4)} tone="warn" />
              </section>
              <section>
                <h4>Decision Context</h4>
                <GaugeMetric label="Game leverage" value={fmtNumber(selected.snapshot.leverage_index, 2)} detail={selected.snapshot.leverage_index >= 1.5 ? "High-value game state." : "Lower leverage window."} percent={scaledPercent(selected.snapshot.leverage_index, 3)} tone="gold" />
                <GaugeMetric label="Normalized degradation" value={fmtRate(selectedState?.normalized_degradation_score)} detail="Normalized against comparable MLB windows." percent={selectedState?.normalized_degradation_score ?? undefined} tone="bad" />
                <GaugeMetric label="Enhanced degradation" value={fmtNumber(selectedState?.enhanced_degradation_score, 2)} detail="Weighted model read after feature normalization." percent={scaledPercent(selectedState?.enhanced_degradation_score, 3)} tone="bad" />
                <GaugeMetric label="League percentile" value={fmtRate(selectedState?.empirical_degradation_percentile)} detail={`${selectedState?.empirical_degradation_sample_count ?? "—"} comparable windows.`} percent={selectedState?.empirical_degradation_percentile ?? undefined} tone="gold" />
                <GaugeMetric label="Pitcher history percentile" value={fmtRate(selectedState?.pitcher_empirical_degradation_percentile)} detail={`${selectedState?.pitcher_empirical_degradation_sample_count ?? "—"} pitcher windows.`} percent={selectedState?.pitcher_empirical_degradation_percentile ?? undefined} tone="gold" />
                <GaugeMetric label="Decay pressure" value={`${fmtNumber(selectedState?.inning_decay_factor, 2)} inning · ${fmtNumber(selectedState?.tto_decay_factor, 2)} TTO`} detail={`${selectedState?.official_batters_faced_in_game ?? selectedState?.batters_faced_in_game ?? "—"} batters faced.`} percent={scaledPercent((selectedState?.inning_decay_factor ?? 0) + (selectedState?.tto_decay_factor ?? 0), 3)} tone="warn" />
              </section>
              {hasWatchSignal ? (
                <section>
                  <h4>Relief Alternatives</h4>
                  {reliefOptions.length === 0 ? (
                    <GaugeMetric label="Bullpen options" value={UNAVAILABLE} detail="No relief alternatives were attached to this pitch window." />
                  ) : (
                    reliefOptions.map((candidate) => (
                      <GaugeMetric
                        key={candidate.player_id}
                        label={candidate.player_name}
                        value={candidate.available ? "Available" : "Not available"}
                        detail={`Net option ${fmtNumber(candidate.net_option_score, 2)} · usage cost ${fmtNumber(candidate.usage_cost, 2)} · matchup ${fmtNumber(candidate.direct_matchup_fit, 2)}`}
                        percent={scaledPercent(candidate.net_option_score, 1)}
                        tone={candidate.available ? "good" : "neutral"}
                      />
                    ))
                  )}
                </section>
              ) : null}
            </div>
            {topComponents.length > 0 ? (
              <div className="component-strip">
                <span>Top model contributors</span>
                {topComponents.map(([key, value]) => (
                  <em key={key}>{categoryContributorLabel(key)} {fmtSigned(value, 2)}</em>
                ))}
              </div>
            ) : null}
          </article>

          {teamRelievers.length > 0 ? (
            <article className="panel rss-panel">
              <div className="panel-title horizontal">
                <div>
                  <p className="eyebrow">Reliever Stress Signal</p>
                  <h3>Bullpen outcomes from the same game.</h3>
                  <p>Relievers are reported from the finalized recap payload. Pitch-level RSS replay views will require reliever-state replay entries from the backend.</p>
                </div>
                <SourceTag label="Finalized recap RSS" source="model" />
              </div>
              <div className="rss-table">
                {teamRelievers.map((pitcher) => (
                  <div key={pitcher.pitcher_id || pitcher.pitcher_name} className="rss-row">
                    <div>
                      <strong>{pitcher.pitcher_name}</strong>
                      <span>{fmtNumber(pitcher.innings_pitched, 1)} IP · {pitcher.pitch_count ?? "—"} pitches · {pitcher.runs_allowed_total ?? "—"} R</span>
                    </div>
                    <div>
                      <strong>{relieverRssLabel(pitcher)}</strong>
                      <span>{relieverRssTimingCopy(pitcher)}</span>
                    </div>
                    <div>
                      <strong>Outcome</strong>
                      <span>{relieverOutcomeCopy(pitcher)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          <article className="panel counterfactual-panel">
            <p className="eyebrow">Decision Outcome</p>
            <h3>What happened after the model action point.</h3>
            <div className="counterfactual-grid">
              <div>
                <strong>Pull Now summary</strong>
                <p>{actionPointCopy(keyPitcher)}</p>
                <ul className="mini-metric-list">
                  <li>Stuff <b>{pullMetrics.stuff}</b></li>
                  <li>Decay <b>{pullMetrics.decay}</b></li>
                  <li>Degradation <b>{pullMetrics.degradation}</b></li>
                </ul>
              </div>
              <div>
                <strong>Decision delta</strong>
                <p>
                  {pullBestCandidate
                    ? `${pullBestCandidate.player_name} was the best recorded relief alternative at the model action point.${pullDecisionDelta == null ? "" : ` The model estimated a ${fmtSigned(pullDecisionDelta, 2)} run delta versus staying with the starter.`}`
                    : "No relief alternative was attached to the model action point, so the bullpen counterfactual is unavailable for this game."}
                </p>
              </div>
              <div>
                <strong>Actual result</strong>
                <p>{exitAndDamageCopy(keyPitcher)}</p>
              </div>
            </div>
          </article>

          <article className="panel recap-panel">
            <div className="panel-title horizontal">
              <div>
                <p className="eyebrow">Game Briefing</p>
                <h3>Email-ready recap.</h3>
                <p>Same delivery path as the existing pitching recaps, with this enterprise view summarizing the staff-deployment opportunity first.</p>
              </div>
              <button type="button" onClick={handleSendRecapEmail}>
                Send briefing
              </button>
            </div>
            <div className="recap-briefing">
              <div>
                <strong>{team.abbr} pitching summary</strong>
                <p>{teamPitcherRecapCopy(keyPitcher)}</p>
              </div>
              <div>
                <strong>What to review</strong>
                <p>{keyPitcher?.missed_hook ? "The model flagged a possible earlier move; use the replay to review the bullpen alternative and game context." : "Review whether the staff decision matched the available bullpen path and game leverage."}</p>
              </div>
              <div>
                <strong>Delivery status</strong>
                <p>{emailStatus ?? "Use Send briefing to deliver through the configured recap email route for this game and team."}</p>
              </div>
            </div>
          </article>
        </>
      )}
    </section>
  );
}

function PitcherAllocation({ profiles, bullpenOptions }: { profiles: PitcherProfile[]; bullpenOptions: BullpenOption[] }) {
  const [mode, setMode] = useState<"starters" | "relievers">("starters");
  const starterProfiles = profiles.slice().sort((a, b) => (b.projectedRunsSaved ?? -Infinity) - (a.projectedRunsSaved ?? -Infinity));
  const relieverProfiles = profiles
    .filter((profile) => profile.appearances >= 8 || (avg(profile.gameLog.map((game) => game.maxPitchCount)) ?? 99) <= 45)
    .sort((a, b) => (b.pitchWindows ?? 0) - (a.pitchWindows ?? 0));

  return (
    <section className="workflow">
      <div className="page-lead compact">
        <div>
          <p className="eyebrow">Pitcher Allocation</p>
          <h2>Who should carry which innings and situations?</h2>
          <p>Starter decay and relief stress are shown together so a club can separate “pull him” from “we need a better alternative.”</p>
        </div>
        <div className="toggle">
          <button type="button" className={mode === "starters" ? "active" : ""} onClick={() => setMode("starters")}>Starters</button>
          <button type="button" className={mode === "relievers" ? "active" : ""} onClick={() => setMode("relievers")}>Relievers</button>
        </div>
      </div>

      {mode === "starters" ? (
        <div className="profile-board">
          {starterProfiles.slice(0, 12).map((profile) => (
            <article key={profile.pitcherId || profile.pitcher} className="profile-card">
              <div>
                <p className="eyebrow">{profile.team}</p>
                <h3>{profile.pitcher}</h3>
                <p>{profile.appearances} appearances · {profile.pitchWindows} model windows</p>
              </div>
              <div className="profile-stats">
                <span>Preventable Runs <strong>{fmtRuns(profile.projectedRunsSaved)}</strong></span>
                <span>Pull Now Games <strong>{profile.pullNowGames}</strong></span>
                <span>Avg Degradation <strong>{fmtNumber(profile.avgDegradation, 2)}</strong></span>
                <span>Max Degradation <strong>{fmtNumber(profile.maxDegradation, 2)}</strong></span>
              </div>
              <MiniCurve values={profile.gameLog.flatMap((game) => game.stuffCurve).slice(-12)} />
              <p className="recommendation-copy">
                {profile.pullNowGames > 2
                  ? "Review repeat late-game exposure and define a firmer hook window."
                  : profile.projectedRunsSaved != null && profile.projectedRunsSaved > 0
                    ? "Audit the specific games driving preventable-run concentration."
                    : "No clear allocation change is indicated from current profile evidence."}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="two-column">
          <article className="panel">
            <div className="panel-title">
              <p className="eyebrow">Current Relief Alternatives</p>
              <h3>Arms attached to active model windows.</h3>
            </div>
            {bullpenOptions.length === 0 ? (
              <EmptyState title="No current alternatives" detail="No active decision window returned a named relief alternative." />
            ) : (
              <div className="compact-list">
                {bullpenOptions.map((option) => (
                  <div key={option.id} className="compact-row">
                    <strong>{option.name}</strong>
                    <span>{option.availability}</span>
                    <span>RSS {fmtNumber(option.rss, 2)}</span>
                    <span>Usage {fmtNumber(option.usageCost, 2)}</span>
                    <span>Net {fmtNumber(option.netOptionScore, 2)}</span>
                  </div>
                ))}
              </div>
            )}
          </article>
          <article className="panel">
            <div className="panel-title">
              <p className="eyebrow">Short-Window Profiles</p>
              <h3>Possible multi-inning relief capacity.</h3>
            </div>
            {relieverProfiles.length === 0 ? (
              <EmptyState title="No short-window profiles" detail="Relief-profile classification will remain unavailable until the role source is explicit." />
            ) : (
              <div className="compact-list">
                {relieverProfiles.slice(0, 10).map((profile) => (
                  <div key={profile.pitcherId || profile.pitcher} className="compact-row">
                    <strong>{profile.pitcher}</strong>
                    <span>{profile.appearances} app</span>
                    <span>{profile.pitchWindows} windows</span>
                    <span>Avg deg {fmtNumber(profile.avgDegradation, 2)}</span>
                    <span>{fmtRuns(profile.projectedRunsSaved)}</span>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      )}
    </section>
  );
}

function RosterConstruction({
  team,
  profiles,
  auditSummary,
  candidates,
}: {
  team: Team;
  profiles: PitcherProfile[];
  auditSummary: PitchingAuditSummaryPayload | null;
  candidates: TripleAConversionCandidate[];
}) {
  const windows = auditWindows(auditSummary);
  const tandem = windows.filter((window) => matrixCellForWindow(window) === "tandem").length;
  const workload = windows.filter((window) => matrixCellForWindow(window) === "workload").length;
  const repeatDecay = profiles.filter((profile) => profile.pullNowGames >= 2).length;
  const teamCandidates = candidates.filter((candidate) => candidate.parentClub.toLowerCase().includes(team.club.toLowerCase()) || candidate.parentClub.toLowerCase().includes(team.abbr.toLowerCase()));
  const visibleCandidates = (teamCandidates.length > 0 ? teamCandidates : candidates).slice(0, 8);

  return (
    <section className="workflow">
      <div className="page-lead">
        <div>
          <p className="eyebrow">Roster Construction</p>
          <h2>Turn repeated allocation stress into roster actions.</h2>
          <p>This view translates the audit into staff-building questions: who needs protection, who needs support, and which internal arms could change the answer.</p>
        </div>
      </div>

      <div className="kpi-row">
        <KPI label="Tandem Need" value={String(tandem)} detail="Starter decay with a better relief alternative." tone="bad" />
        <KPI label="Workload Constraint" value={String(workload)} detail="Starter and relief alternative both below target." tone="gold" />
        <KPI label="Repeat Decay Profiles" value={String(repeatDecay)} detail="Pitchers with multiple Pull Now games." />
        <KPI label="Triple-A Candidates" value={String(visibleCandidates.length)} detail="Potential internal relief conversion pool." />
      </div>

      <div className="roster-actions">
        <article className="panel">
          <p className="eyebrow">Staff-Building Questions</p>
          <h3>What the front office should investigate.</h3>
          <ul className="action-list">
            <li><strong>Protect cliff droppers.</strong><span>Define firmer starter windows for pitchers with repeated Pull Now games.</span></li>
            <li><strong>Add bridge capacity.</strong><span>If tandem and workload cells repeat, the club needs a reliable 2-inning relief answer.</span></li>
            <li><strong>Convert selectively.</strong><span>Use Triple-A short-window quality plus decay risk to identify stretch-run relief candidates.</span></li>
            <li><strong>Do not overclaim.</strong><span>Role and day-of availability remain rule-based unless club-confirmed data is supplied.</span></li>
          </ul>
        </article>

        <article className="panel">
          <p className="eyebrow">Triple-A Conversion Candidates</p>
          <h3>Internal arms worth reviewing.</h3>
          {visibleCandidates.length === 0 ? (
            <EmptyState title="No candidates returned" detail="Triple-A candidates will populate when the API returns conversion data." />
          ) : (
            <div className="candidate-list">
              {visibleCandidates.map((candidate) => (
                <div key={candidate.id} className="candidate-card">
                  <strong>{candidate.pitcher}</strong>
                  <span>{candidate.affiliate} · {candidate.parentClub}</span>
                  <em>{candidate.currentRole} → {candidate.recommendedRole}</em>
                  <div>
                    <span>Conversion {candidate.reliefConversionScore}</span>
                    <span>Mirage risk {fmtPct(candidate.mirageRisk)}</span>
                    <span>{fmtRuns(candidate.projectedRunsSaved)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function BriefingSettings({
  team,
  settings,
  status,
  onSave,
}: {
  team: Team;
  settings: PitchingRecapSettings | null;
  status: string | null;
  onSave: (patch: Partial<PitchingRecapSettings>) => Promise<void>;
}) {
  const [recapTeamsText, setRecapTeamsText] = useState("");
  const [autoTeamsText, setAutoTeamsText] = useState("");
  const [finalizedTeamsText, setFinalizedTeamsText] = useState("");
  const [recipientsText, setRecipientsText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRecapTeamsText((settings?.recap_teams ?? []).join(", "));
    setAutoTeamsText((settings?.auto_email_teams ?? []).join(", "));
    setFinalizedTeamsText((settings?.finalized_email_teams ?? []).join(", "));
    setRecipientsText((settings?.team_recipients?.[team.abbr] ?? []).join(", "));
  }, [settings, team.abbr]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        recap_teams: teamCsv(recapTeamsText),
        auto_email_teams: teamCsv(autoTeamsText),
        finalized_email_teams: teamCsv(finalizedTeamsText),
        team_recipients: {
          ...(settings?.team_recipients ?? {}),
          [team.abbr]: parseCsvList(recipientsText),
        },
      });
    } catch {
      // Parent state carries the visible error message.
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="workflow">
      <div className="page-lead compact">
        <div>
          <p className="eyebrow">Enterprise Briefings</p>
          <h2>Postgame recap delivery settings.</h2>
          <p>Manage which clubs receive enterprise pitcher-intelligence emails and who receives them. SMTP credentials remain managed in the shared secure backend config.</p>
        </div>
        <button type="button" onClick={handleSave} disabled={!settings || saving}>
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>

      <div className="briefing-settings-grid">
        <article className="panel">
          <p className="eyebrow">Delivery Status</p>
          <h3>{settings?.shared_email_configured ? "Email provider configured" : "Email provider needs attention"}</h3>
          <div className="settings-status-list">
            <span>Provider <strong>{settings?.email_provider ? settings.email_provider.toUpperCase() : UNAVAILABLE}</strong></span>
            <span>Selected club <strong>{team.name}</strong></span>
            <span>Auto-send for club <strong>{settings?.auto_email_teams?.includes(team.abbr) ? "Enabled" : "Disabled"}</strong></span>
            <span>Wait for full replay <strong>{settings?.finalized_email_teams?.includes(team.abbr) ? "Enabled" : "Disabled"}</strong></span>
          </div>
          {status ? <p className="settings-status-message">{status}</p> : null}
        </article>

        <article className="panel settings-form">
          <p className="eyebrow">Team Scope</p>
          <label>
            Enterprise recap teams
            <input value={recapTeamsText} onChange={(event) => setRecapTeamsText(event.target.value)} placeholder="ATL, LAD, NYY" />
            <span>Teams visible in the recap workflow.</span>
          </label>
          <label>
            Automatic email teams
            <input value={autoTeamsText} onChange={(event) => setAutoTeamsText(event.target.value)} placeholder="ATL, LAD" />
            <span>Teams checked for postgame auto-send.</span>
          </label>
          <label>
            Finalized replay teams
            <input value={finalizedTeamsText} onChange={(event) => setFinalizedTeamsText(event.target.value)} placeholder="ATL, LAD" />
            <span>Teams whose emails wait for canonical replay detail before delivery.</span>
          </label>
        </article>

        <article className="panel settings-form">
          <p className="eyebrow">Recipients</p>
          <h3>{team.abbr} recipients</h3>
          <label>
            Recipient emails
            <textarea value={recipientsText} onChange={(event) => setRecipientsText(event.target.value)} placeholder="ops@example.com, pitching@example.com" />
            <span>Comma-separated list for the selected club.</span>
          </label>
          <div className="recipient-preview">
            {parseCsvList(recipientsText).length === 0 ? (
              <span>No recipients configured for {team.abbr}.</span>
            ) : (
              parseCsvList(recipientsText).map((recipient) => <em key={recipient}>{recipient}</em>)
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

export default function App() {
  const [selectedTeamAbbr, setSelectedTeamAbbr] = useState("ATL");
  const [workflow, setWorkflow] = useState<Workflow>("command");
  const [season, setSeason] = useState("2026");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [games, setGames] = useState<EnterpriseGameSummary[]>([]);
  const [profilesPayload, setProfilesPayload] = useState<PitcherProfilesPayload | null>(null);
  const [auditSummary, setAuditSummary] = useState<PitchingAuditSummaryPayload | null>(null);
  const [replay, setReplay] = useState<PitchingReplayResponse | null>(null);
  const [recap, setRecap] = useState<PitchingGameRecap | null>(null);
  const [recapSettings, setRecapSettings] = useState<PitchingRecapSettings | null>(null);
  const [recapSettingsStatus, setRecapSettingsStatus] = useState<string | null>(null);

  const selectedTeam = MLB_TEAMS.find((team) => team.abbr === selectedTeamAbbr) ?? MLB_TEAMS[0];
  const { loadState, payload, error, reload } = useRunSavingBoard({ league: "mlb", team: selectedTeam.abbr, limit: 50 });
  const { payload: tripleAPayload, reload: reloadTripleA } = useRunSavingBoard({ league: "triple_a", limit: 50 });
  const {
    payload: preventableRuns,
    error: preventableRunsError,
    loading: preventableRunsLoading,
    reload: reloadPreventableRuns,
  } = usePreventableRunsOpportunities({ season, team: selectedTeam.abbr, limit: 5000 });
  const apiBase = getConfiguredApiBase();

  const loadRecapSettings = useCallback(async () => {
    try {
      const settings = await fetchPitchingRecapSettings("mlb");
      setRecapSettings(settings);
      setRecapSettingsStatus(null);
    } catch (caught) {
      setRecapSettings(null);
      setRecapSettingsStatus(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void loadRecapSettings();
  }, [loadRecapSettings]);

  async function handleSaveRecapSettings(patch: Partial<PitchingRecapSettings>) {
    setRecapSettingsStatus("Saving settings...");
    try {
      const settings = await savePitchingRecapSettings(patch, "mlb");
      setRecapSettings(settings);
      setRecapSettingsStatus("Settings saved.");
    } catch (caught) {
      setRecapSettingsStatus(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadClubContext() {
      try {
        const [gamePayload, profilePayload, auditPayload] = await Promise.all([
          fetchEnterpriseGames({ league: "mlb", team: selectedTeam.abbr, limit: 300 }),
          fetchPitcherProfiles({ league: "mlb", team: selectedTeam.abbr, year: season, limit: 750 }),
          fetchPitchingAuditSummary({ league: "mlb", team: selectedTeam.abbr, year: season, limit: 750 }),
        ]);
        if (cancelled) return;
        setGames(gamePayload.games);
        setProfilesPayload(profilePayload);
        setAuditSummary(auditPayload);
        setSelectedGameId((current) => {
          if (current && gamePayload.games.some((game) => game.game_id === current)) return current;
          return gamePayload.games[0]?.game_id ?? null;
        });
      } catch {
        if (!cancelled) {
          setGames([]);
          setProfilesPayload(null);
          setAuditSummary(null);
        }
      }
    }
    void loadClubContext();
    return () => {
      cancelled = true;
    };
  }, [selectedTeam.abbr, season]);

  useEffect(() => {
    if (!selectedGameId) {
      setReplay(null);
      setRecap(null);
      return;
    }
    let cancelled = false;
    async function loadGameContext() {
      try {
        const [replayPayload, recapPayload] = await Promise.all([
          fetchPitchingReplay(selectedGameId, "mlb"),
          fetchPitchingRecap(selectedGameId, "mlb"),
        ]);
        if (cancelled) return;
        setReplay(replayPayload);
        setRecap(recapPayload);
      } catch {
        if (!cancelled) {
          setReplay(null);
          setRecap(null);
        }
      }
    }
    void loadGameContext();
    return () => {
      cancelled = true;
    };
  }, [selectedGameId]);

  const profiles = profilesPayload?.profiles ?? [];
  const audits = payload?.audits ?? [];
  const bullpenOptions = payload?.bullpenOptions ?? [];
  const tripleA = tripleAPayload?.tripleAConversionCandidates ?? payload?.tripleAConversionCandidates ?? [];

  function refreshAll() {
    void reload();
    void reloadTripleA();
    void reloadPreventableRuns();
    void loadRecapSettings();
  }

  return (
    <main className="app-shell">
      <Header
        team={selectedTeam}
        workflow={workflow}
        loadState={loadState}
        onRefresh={refreshAll}
        onTeamChange={(team) => {
          setSelectedTeamAbbr(team.abbr);
          setWorkflow("command");
        }}
        onWorkflowChange={setWorkflow}
      />

      <div className="season-row">
        <span>{selectedTeam.name}</span>
        <label>
          Season
          <select value={season} onChange={(event) => setSeason(event.target.value)}>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
          </select>
        </label>
      </div>

      {loadState === "loading" && <EmptyState title="Loading club intelligence" detail={`Retrieving ${selectedTeam.club} pitching evidence from ${apiBase}.`} />}
      {loadState === "missing-config" && <EmptyState title="API source not configured" detail="Set VITE_BASEBALL_BRAIN_API_BASE in the frontend environment." />}
      {loadState === "error" && <EmptyState title="API source unavailable" detail={error ?? "The Baseball brAIn API did not respond."} />}

      {loadState === "ready" && payload && workflow === "command" && (
        <CommandCenter
          team={selectedTeam}
          payload={payload}
          preventableRuns={preventableRuns}
          preventableRunsError={preventableRunsError}
          preventableRunsLoading={preventableRunsLoading}
          profiles={profiles}
          audits={audits}
          auditSummary={auditSummary}
          bullpenOptions={bullpenOptions}
          onOpenAudit={() => setWorkflow("audit")}
          onOpenGameAudit={(gameId) => {
            setSelectedGameId(gameId);
            setWorkflow("audit");
          }}
        />
      )}

      {loadState === "ready" && workflow === "audit" && (
        <GameAudit
          team={selectedTeam}
          games={games}
          selectedGameId={selectedGameId}
          onGameChange={setSelectedGameId}
          replay={replay}
          recap={recap}
          preventableRows={preventableRuns?.rows ?? []}
        />
      )}

      {loadState === "ready" && workflow === "allocation" && (
        <PitcherAllocation profiles={profiles} bullpenOptions={bullpenOptions} />
      )}

      {loadState === "ready" && workflow === "roster" && (
        <RosterConstruction team={selectedTeam} profiles={profiles} auditSummary={auditSummary} candidates={tripleA} />
      )}

      {loadState === "ready" && workflow === "briefings" && (
        <BriefingSettings
          team={selectedTeam}
          settings={recapSettings}
          status={recapSettingsStatus}
          onSave={handleSaveRecapSettings}
        />
      )}

      <footer className="app-footer">
        <span>Source: {apiBase || UNAVAILABLE}</span>
        <span>Generated: {payload?.summary.generatedAt ?? LOADING_VALUE}</span>
        <span>Confidential · Baseball brAIn, Inc.</span>
      </footer>
    </main>
  );
}
