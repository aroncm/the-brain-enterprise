import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiConfigurationError,
  fetchEnterpriseGames,
  fetchPitcherProfiles,
  fetchPitchingAuditSummary,
  fetchPitchingRecap,
  fetchPitchingRecapSettings,
  fetchPitchingReplay,
  fetchRunSavingBoard,
  getConfiguredApiBase,
  savePitchingRecapSettings,
  sendPitchingRecapEmail,
} from "./api";
import type {
  AuditRow,
  BullpenOption,
  EnterpriseGameSummary,
  PitcherProfile,
  PitcherProfilesPayload,
  PitcherDecision,
  PitchingGameRecap,
  PitchingAuditSummaryPayload,
  PitchingAuditWindow,
  PitchingRecapSettings,
  PitchingReplayEntry,
  PitchingReplayResponse,
  RunSavingBoardPayload,
  TripleAConversionCandidate,
} from "./types";

type LoadState = "loading" | "ready" | "error" | "missing-config";
type ActiveModule = "overview" | "replay" | "pitchers" | "bullpen" | "matrix" | "audit" | "recaps" | "triple-a";

type Team = {
  abbr: string;
  name: string;
  club: string;
  division: string;
};

const AWAITING = "Awaiting calibrated value";
const UNAVAILABLE = "Unavailable";

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

const PITCH_TYPE_NAMES: Record<string, string> = {
  FA: "Fastball",
  FF: "Four-Seam Fastball",
  FT: "Two-Seam Fastball",
  SI: "Sinker",
  FC: "Cutter",
  SL: "Slider",
  ST: "Sweeper",
  SV: "Slurve",
  CU: "Curveball",
  KC: "Knuckle Curve",
  CS: "Slow Curve",
  CH: "Changeup",
  FS: "Splitter",
  FO: "Forkball",
  KN: "Knuckleball",
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

const MODULES: Array<{ id: ActiveModule; label: string; short: string }> = [
  { id: "overview", label: "Club Overview", short: "Overview" },
  { id: "replay", label: "Pitch-by-Pitch Intelligence", short: "Replay" },
  { id: "pitchers", label: "Pitcher Profiles", short: "Pitchers" },
  { id: "bullpen", label: "Relief Alternatives", short: "Bullpen" },
  { id: "matrix", label: "Deployment Matrix", short: "Matrix" },
  { id: "audit", label: "Postgame Audit", short: "Audit" },
  { id: "recaps", label: "Game Recaps & Email", short: "Recaps" },
  { id: "triple-a", label: "Triple-A Pipeline", short: "Triple-A" },
];

function formatRuns(value: number | null | undefined): string {
  if (value == null) return AWAITING;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function formatScore(value: number | null | undefined, digits = 2): string {
  if (value == null) return AWAITING;
  return value.toFixed(digits);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return AWAITING;
  return `${Math.round(value * 100)}%`;
}

function normalizeReason(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Today";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function sum(values: Array<number | null | undefined>): number {
  return values.reduce((total, value) => total + (value ?? 0), 0);
}

function average(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return numeric.reduce((total, value) => total + value, 0) / numeric.length;
}

function lastAverage(values: number[], count = 2): number | null {
  if (values.length === 0) return null;
  return average(values.slice(Math.max(0, values.length - count)));
}

function statusRank(status: string | null | undefined): number {
  const normalized = String(status || "STAY").toUpperCase();
  return { STAY: 1, WATCH: 2, PREP: 3, PULL_NOW: 4 }[normalized as "STAY" | "WATCH" | "PREP" | "PULL_NOW"] ?? 1;
}

function statusLabel(status: string | null | undefined): string {
  return String(status || "STAY").replace(/_/g, " ").toUpperCase();
}

function pitchTypeName(value: string | null | undefined): string {
  if (!value) return "Pitch";
  const normalized = value.trim().toUpperCase();
  return PITCH_TYPE_NAMES[normalized] ?? normalizeReason(value);
}

function teamLogoUrl(abbr: string): string | null {
  const teamId = MLB_TEAM_IDS[abbr];
  return teamId ? `https://www.mlbstatic.com/team-logos/${teamId}.svg` : null;
}

function TeamLogo({ abbr, className = "" }: { abbr: string; className?: string }) {
  const logo = teamLogoUrl(abbr);
  return (
    <span className={`team-logo ${className}`}>
      {logo ? <img src={logo} alt={`${abbr} logo`} /> : <span>{abbr}</span>}
    </span>
  );
}

function baseOccupancy(baseState: string | null | undefined): { first: boolean; second: boolean; third: boolean } {
  const value = String(baseState || "").toUpperCase();
  if (!value || value === "EMPTY" || value === "---" || value === "NONE") {
    return { first: false, second: false, third: false };
  }
  if (/^[01]{3}$/.test(value)) {
    return { first: value[0] === "1", second: value[1] === "1", third: value[2] === "1" };
  }
  return {
    first: value.includes("1") || value.includes("FIRST") || value.includes("1B"),
    second: value.includes("2") || value.includes("SECOND") || value.includes("2B"),
    third: value.includes("3") || value.includes("THIRD") || value.includes("3B"),
  };
}

function BaseOutDisplay({ baseState, outs }: { baseState: string | null | undefined; outs: number | null | undefined }) {
  const bases = baseOccupancy(baseState);
  return (
    <div className="base-out-display">
      <div className="outs-visual" aria-label={`${outs ?? 0} outs`}>
        {[0, 1, 2].map((index) => (
          <span key={index} className={(outs ?? 0) > index ? "filled" : ""} />
        ))}
      </div>
      <div className="bases-visual" aria-label={`Base state ${baseState || "empty"}`}>
        <span className={bases.second ? "base base-second filled" : "base base-second"} />
        <span className={bases.third ? "base base-third filled" : "base base-third"} />
        <span className={bases.first ? "base base-first filled" : "base base-first"} />
      </div>
    </div>
  );
}

function pitchCountForEntry(entry: PitchingReplayEntry): number {
  const state = entry.snapshot.starter_state;
  return (
    state.official_pitch_count_in_game ??
    state.pitch_count_in_game ??
    state.replay_pitch_count_in_game ??
    0
  );
}

function stuffScoreFromEntry(entry: PitchingReplayEntry): number {
  const degradation = entry.snapshot.starter_state.degradation_score ?? 0;
  return Math.max(20, Math.min(100, Math.round(100 - degradation * 22)));
}

function velocityDrop(entry: PitchingReplayEntry): number | null {
  const state = entry.snapshot.starter_state;
  if (state.velo_mean_5 == null || state.seasonal_velo_baseline == null) return null;
  return state.velo_mean_5 - state.seasonal_velo_baseline;
}

function spinChange(entry: PitchingReplayEntry): number | null {
  const state = entry.snapshot.starter_state;
  if (state.spin_mean_5 == null || state.seasonal_spin_baseline == null) return null;
  return state.spin_mean_5 - state.seasonal_spin_baseline;
}

function stuffCurveForEntries(entries: PitchingReplayEntry[], throughIndex: number): number[] {
  const visible = entries.slice(0, throughIndex + 1);
  if (visible.length === 0) return [];
  const bucketSize = Math.max(1, Math.ceil(visible.length / 8));
  const buckets: number[] = [];
  for (let index = 0; index < visible.length; index += bucketSize) {
    const bucket = visible.slice(index, index + bucketSize).map(stuffScoreFromEntry);
    const value = average(bucket);
    if (value != null) buckets.push(Math.round(value));
  }
  return buckets;
}

function gameLabel(game: EnterpriseGameSummary | null): string {
  if (!game) return "Select game";
  return `${game.away_team} @ ${game.home_team} · ${game.date}`;
}

function FingerprintMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 52 52" fill="none" aria-hidden="true">
      <path
        d="M26 6c-8 0-14 6-14 14v6c0 8 3 14 8 19M26 6c8 0 14 6 14 14v8M26 14c-4 0-7 3-7 7v8c0 6 2 11 5 15M26 14c4 0 7 3 7 7v6M26 22v12M33 28v4c0 3-1 6-2 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      <p>{detail}</p>
    </div>
  );
}

function RunsValue({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="value value--awaiting">Awaiting calibrated value</span>;
  const sign = value > 0 ? "+" : "";
  const cls = value > 0 ? "positive" : value < 0 ? "negative" : "";
  return <span className={`value ${cls}`}>{`${sign}${value.toFixed(2)}`}</span>;
}

function MiniCurve({ values, compact = false }: { values: number[]; compact?: boolean }) {
  if (values.length < 2) {
    return (
      <EmptyState
        title="No trajectory yet"
        detail="A pitch-window curve will render once the feed returns enough pitch-level degradation values."
      />
    );
  }
  const width = 320;
  const height = compact ? 78 : 120;
  const max = 100;
  const min = 35;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - ((value - min) / (max - min)) * height;
      return `${x},${Math.max(6, Math.min(height - 6, y))}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mini-curve" role="img" aria-label="Pitch-window stuff trajectory">
      <path className="grid" d={`M0 ${height * 0.25} H${width}`} />
      <path className="grid" d={`M0 ${height * 0.55} H${width}`} />
      <path className="grid" d={`M0 ${height * 0.85} H${width}`} />
      <polyline points={points} />
      {values.map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width;
        const y = height - ((value - min) / (max - min)) * height;
        return <circle key={`${value}-${index}`} cx={x} cy={Math.max(6, Math.min(height - 6, y))} r={compact ? "2.5" : "3.5"} />;
      })}
    </svg>
  );
}

function ExecutiveHeader({
  summary,
  loadState,
  apiBase,
  team,
  onRefresh,
}: {
  summary: RunSavingBoardPayload["summary"] | undefined;
  loadState: LoadState;
  apiBase: string;
  team: Team;
  onRefresh: () => void;
}) {
  const readiness = (() => {
    if (loadState === "missing-config") return { dot: "readiness-dot--red", label: "Data source not connected" };
    if (loadState === "error") return { dot: "readiness-dot--red", label: "Data source unavailable" };
    if (loadState === "loading") return { dot: "readiness-dot--amber", label: "Loading club intelligence" };
    const decisions = summary?.decisionCount ?? 0;
    if (decisions === 0) return { dot: "readiness-dot--amber", label: "No active decisions for club" };
    return { dot: "", label: "Data ready" };
  })();

  return (
    <header className="executive-header">
      <div className="masthead">
        <p className="eyebrow">Baseball brAIn &nbsp;&middot;&nbsp; Professional Operational Intelligence</p>
        <h1>Baseball brAIn</h1>
        <p className="subtitle">Pitcher Intelligence — every pitch, every pitcher, every situation.</p>
        <span className="subtitle-rule" />
      </div>

      <div className="header-side">
        <FingerprintMark className="fingerprint" />
        <span className="readiness-chip">
          <span className={`readiness-dot ${readiness.dot}`} />
          {readiness.label}
        </span>
        <div className="slate-context">
          <span>{team.name}</span>
          <strong>{formatDate(summary?.generatedAt)}</strong>
          <span>MLB &middot; Club Pitcher Intelligence</span>
        </div>
        <button type="button" className="refresh-action" onClick={onRefresh}>
          Refresh club page
        </button>
        {apiBase ? null : <span className="mono api-note">No source configured</span>}
      </div>
    </header>
  );
}

function TeamNav({
  selectedTeam,
  activeModule,
  onTeamChange,
  onModuleChange,
}: {
  selectedTeam: Team;
  activeModule: ActiveModule;
  onTeamChange: (team: Team) => void;
  onModuleChange: (module: ActiveModule) => void;
}) {
  return (
    <section className="team-command">
      <div className="team-picker">
        <label htmlFor="team-select">MLB Club</label>
        <select
          id="team-select"
          value={selectedTeam.abbr}
          onChange={(event) => {
            const next = MLB_TEAMS.find((team) => team.abbr === event.target.value);
            if (next) onTeamChange(next);
          }}
        >
          {MLB_TEAMS.map((team) => (
            <option key={team.abbr} value={team.abbr}>
              {team.name} ({team.abbr})
            </option>
          ))}
        </select>
      </div>
      <div className="team-identity-card">
        <span>{selectedTeam.division}</span>
        <strong>{selectedTeam.name}</strong>
        <span>Team page · pitcher allocation intelligence</span>
      </div>
      <nav className="module-nav" aria-label="Run Saving Tool modules">
        {MODULES.map((module) => (
          <button
            key={module.id}
            type="button"
            className={activeModule === module.id ? "active" : ""}
            onClick={() => onModuleChange(module.id)}
          >
            <span>{module.short}</span>
            <small>{module.label}</small>
          </button>
        ))}
      </nav>
    </section>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function opportunityClass(rec: string): string {
  if (rec === "Hold starter" || rec === "Monitor only") return "opportunity-card--hold";
  if (rec === "Change pitcher") return "opportunity-card--change";
  return "opportunity-card--prep";
}

function starterRiskLabel(decision: PitcherDecision): string {
  const p = decision.cliffProbability;
  if (p == null) return AWAITING;
  if (p >= 0.66) return "Elevated";
  if (p >= 0.33) return "Watch";
  return "Contained";
}

function bestReliefName(options: BullpenOption[]): string | null {
  if (options.length === 0) return null;
  const ranked = [...options].sort((a, b) => {
    const av = a.netOptionScore ?? -Infinity;
    const bv = b.netOptionScore ?? -Infinity;
    return bv - av;
  });
  return ranked[0]?.name ?? null;
}

function auditCount(summary: PitchingAuditSummaryPayload | null, key: string): number {
  const counts = summary?.window_filtered_counts ?? {};
  const value = counts[`${key}_filtered`] ?? counts[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function profilePerGame(profile: PitcherProfile): number | null {
  if (!profile.appearances) return null;
  return (profile.projectedRunsSaved ?? 0) / profile.appearances;
}

function rankProfiles(profiles: PitcherProfile[], score: (profile: PitcherProfile) => number | null): PitcherProfile[] {
  return [...profiles].sort((a, b) => (score(b) ?? -Infinity) - (score(a) ?? -Infinity));
}

function rawNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function rawRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function overviewAuditWindows(summary: PitchingAuditSummaryPayload | null): PitchingAuditWindow[] {
  if (!summary) return [];
  return [
    ...(summary.missed_hook_windows ?? []),
    ...(summary.delayed_change_windows ?? []),
    ...(summary.high_leverage_holdouts ?? []),
    ...(summary.justified_stay_windows ?? []),
  ];
}

function auditWindowMatrixKey(row: PitchingAuditWindow): "standard" | "tandem" | "push" | "workload" {
  const starter = rawRecord(row.starter);
  const candidate = rawRecord(row.top_candidate);
  const degradation = rawNumber(starter.degradation_score);
  const starterAbove = degradation == null ? false : degradation < 1.15;
  const optionScore = rawNumber(candidate.net_option_score);
  const matchupFit = rawNumber(candidate.direct_matchup_fit);
  const bullpenAbove = Math.max(optionScore ?? -Infinity, matchupFit ?? -Infinity) >= 0.45;
  if (bullpenAbove && starterAbove) return "standard";
  if (bullpenAbove && !starterAbove) return "tandem";
  if (!bullpenAbove && starterAbove) return "push";
  return "workload";
}

function seasonMatrixCounts(summary: PitchingAuditSummaryPayload | null): Record<"standard" | "tandem" | "push" | "workload", number> {
  return overviewAuditWindows(summary).reduce(
    (counts, row) => {
      counts[auditWindowMatrixKey(row)] += 1;
      return counts;
    },
    { standard: 0, tandem: 0, push: 0, workload: 0 },
  );
}

function OpportunityCard({ decision, reliefName }: { decision: PitcherDecision; reliefName: string | null }) {
  const confidence = decision.trajectoryConfidence;
  const starterRisk = starterRiskLabel(decision);
  return (
    <article className={`opportunity-card ${opportunityClass(decision.recommendation)}`}>
      <div className="opportunity-left">
        <div className="opportunity-matchup">
          <span>{decision.team}</span>
          <span className="dot" />
          <span>vs {decision.opponent}</span>
          <span className="dot" />
          <span>{decision.inning}</span>
        </div>
        <div className="opportunity-pitcher">
          <h3>{decision.pitcher}</h3>
          <div className="role">{decision.role}</div>
        </div>
        <p className="opportunity-situation">
          {decision.batterPocket ? `Situation: ${decision.batterPocket}.` : "Situation detail pending from live feed."}
        </p>
        {decision.topReasons.length > 0 && (
          <div className="opportunity-reasons">
            {decision.topReasons.slice(0, 4).map((reason) => (
              <span key={reason}>{normalizeReason(reason)}</span>
            ))}
          </div>
        )}
      </div>

      <div className="opportunity-right">
        <div className="recommended-move">
          <p className="eyebrow">Recommended Staff Move</p>
          <div className="move-value">{decision.recommendation}</div>
          {decision.recommendationReason && <p className="move-reason">{decision.recommendationReason}</p>}
        </div>
        <div className="opportunity-metrics">
          <div className="metric-cell">
            <span className="label">Projected Preventable Runs</span>
            <RunsValue value={decision.projectedRunsSaved} />
            {decision.modelImpliedRunsSaved != null && (
              <span className="detail">Raw model {formatRuns(decision.modelImpliedRunsSaved)}</span>
            )}
          </div>
          <div className="metric-cell">
            <span className="label">Decision Confidence</span>
            <span className="value">{formatPercent(confidence)}</span>
          </div>
          <div className="metric-cell">
            <span className="label">Starter Risk</span>
            <span className="value text-value">{starterRisk}</span>
          </div>
          <div className="metric-cell">
            <span className="label">Best Relief Alternative</span>
            <span className={`value ${reliefName ? "text-value" : "value--awaiting"}`}>
              {reliefName ?? "Awaiting calibrated value"}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function MetricBar({
  label,
  value,
  suffix = "",
  max,
  inverse = false,
  percent = false,
}: {
  label: string;
  value: number | null | undefined;
  suffix?: string;
  max: number;
  inverse?: boolean;
  percent?: boolean;
}) {
  const normalized = value == null ? 0 : inverse ? Math.abs(Math.min(0, value)) / Math.abs(max) : Math.abs(value) / Math.abs(max);
  const width = Math.max(4, Math.min(100, normalized * 100));
  const display = value == null ? "—" : percent ? `${Math.round(value * 100)}%` : `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
  return (
    <div className="metric-bar">
      <div>
        <span>{label}</span>
        <strong>{display}</strong>
      </div>
      <i style={{ width: `${width}%` }} />
    </div>
  );
}

function GameRecapSummary({ recap, team }: { recap: PitchingGameRecap; team: Team }) {
  const teamPitchers = recap.starters.filter((pitcher) => pitcher.team === team.abbr);
  const firstOpportunity = teamPitchers.find((pitcher) => pitcher.first_pull_now_inning != null || pitcher.first_alert_inning != null);
  const finalScore = `${recap.away_team} ${recap.final_away_score ?? "—"} · ${recap.home_team} ${recap.final_home_score ?? "—"}`;
  return (
    <section className="game-recap-panel">
      <div className="section-heading section-heading--compact">
        <div>
          <p className="eyebrow">Game Recap</p>
          <h2>What happened, where the opportunity was, and the result.</h2>
        </div>
      </div>
      <div className="recap-summary-grid">
        <StatCard label="Final Score" value={finalScore} detail={`${recap.away_team} @ ${recap.home_team}`} />
        <StatCard
          label="Change Opportunity"
          value={firstOpportunity ? `${firstOpportunity.pitcher_name}` : "None"}
          detail={
            firstOpportunity?.first_pull_now_inning != null
              ? `Pull Now in inning ${firstOpportunity.first_pull_now_inning}, pitch ${firstOpportunity.first_pull_now_pitch_count}.`
              : firstOpportunity
                ? `First alert in inning ${firstOpportunity.first_alert_inning}, pitch ${firstOpportunity.first_alert_pitch_count}.`
                : "No team pitcher reached an action threshold."
          }
        />
        <StatCard
          label="Runs After Signal"
          value={firstOpportunity?.runs_allowed_after_signal == null ? "—" : String(firstOpportunity.runs_allowed_after_signal)}
          detail={firstOpportunity?.missed_hook ? "Signal was not acted on immediately." : "Result after the first model action point."}
        />
      </div>
      <div className="recap-table">
        {teamPitchers.map((pitcher) => (
          <div key={`${pitcher.pitcher_id}-${pitcher.role}`}>
            <strong>{pitcher.pitcher_name}</strong>
            <span>{pitcher.role || "Pitcher"}</span>
            <span>{pitcher.innings_pitched} IP · {pitcher.pitch_count} pitches</span>
            <span>{pitcher.role === "Reliever" ? pitcher.rss_label ?? "RSS unavailable" : statusLabel(pitcher.peak_status)}</span>
            <span>{pitcher.runs_allowed_after_signal == null ? "—" : `${pitcher.runs_allowed_after_signal} runs after signal`}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function OverviewModule({
  team,
  payload,
  decisions,
  bullpenOptions,
  audits,
  profilesPayload,
  auditSummary,
  onModuleChange,
}: {
  team: Team;
  payload: RunSavingBoardPayload;
  decisions: PitcherDecision[];
  bullpenOptions: BullpenOption[];
  audits: AuditRow[];
  profilesPayload: PitcherProfilesPayload | null;
  auditSummary: PitchingAuditSummaryPayload | null;
  onModuleChange: (module: ActiveModule) => void;
}) {
  const snapshotProjected = sum(decisions.map((decision) => decision.projectedRunsSaved));
  const profiles = profilesPayload?.profiles ?? [];
  const seasonProjected = sum(profiles.map((profile) => profile.projectedRunsSaved));
  const avgCliff = average(decisions.map((decision) => decision.cliffProbability));
  const bestRelief = bestReliefName(bullpenOptions);
  const bestOption = bullpenOptions.length > 0 ? [...bullpenOptions].sort((a, b) => (b.netOptionScore ?? -Infinity) - (a.netOptionScore ?? -Infinity))[0] : null;
  const missedHooks = auditCount(auditSummary, "missed_hook_windows");
  const delayedChanges = auditCount(auditSummary, "delayed_change_windows");
  const justifiedStays = auditCount(auditSummary, "justified_stay_windows");
  const highLeverageHolds = auditCount(auditSummary, "high_leverage_holdouts");
  const actionableCases = missedHooks + delayedChanges;
  const topOpportunity = rankProfiles(profiles, (profile) => profile.projectedRunsSaved)[0] ?? null;
  const topPerGame = rankProfiles(profiles, profilePerGame)[0] ?? null;
  const repeatPull = rankProfiles(profiles, (profile) => profile.pullNowGames)[0] ?? null;
  const opportunityShare =
    topOpportunity?.projectedRunsSaved != null && seasonProjected > 0
      ? topOpportunity.projectedRunsSaved / seasonProjected
      : null;
  const seasonMatrix = seasonMatrixCounts(auditSummary);
  const matrixBuckets = {
    standard: decisions.filter((decision) => matrixKey(decision, bestOption) === "standard"),
    tandem: decisions.filter((decision) => matrixKey(decision, bestOption) === "tandem"),
    push: decisions.filter((decision) => matrixKey(decision, bestOption) === "push"),
    workload: decisions.filter((decision) => matrixKey(decision, bestOption) === "workload"),
  };
  const clubInsights = [
    {
      label: "Largest Opportunity Concentration",
      title: topOpportunity ? topOpportunity.pitcher : "No pitcher concentration yet",
      detail: topOpportunity
        ? `${formatRuns(topOpportunity.projectedRunsSaved)} preventable runs across ${topOpportunity.appearances} appearances. ${opportunityShare == null ? "" : `${formatPercent(opportunityShare)} of the club preventable-run pool.`}`
        : "Pitcher profiles will populate after season replay artifacts are available.",
      action: "Use the pitcher profile game log to separate repeat late-start decay from one-off game context.",
    },
    {
      label: "Most Repeat Action Signals",
      title: repeatPull ? repeatPull.pitcher : "No repeated Pull Now profile",
      detail: repeatPull
        ? `${repeatPull.pullNowGames} Pull Now games and ${repeatPull.prepOrWatchGames} prep/watch games.`
        : "No pitcher has repeated action signals in the current profile set.",
      action: "Review whether these are usage-pattern issues, matchup issues, or normal starter workload tradeoffs.",
    },
    {
      label: "Audit Priority",
      title: `${actionableCases} actionable timing cases`,
      detail: `${missedHooks} missed hooks, ${delayedChanges} delayed changes, ${justifiedStays} justified stays, ${highLeverageHolds} high-leverage holdouts.`,
      action: "Start with missed hooks and delayed changes, then compare them against bullpen availability at the time.",
    },
    {
      label: "Strategic Edge Cell",
      title: `${seasonMatrix.tandem} tandem-mandatory candidates`,
      detail: "Season audit windows where starter degradation appears below-average while the recorded relief alternative clears the option-score threshold.",
      action: "These are the best drill-down cases for the deployment matrix and counterfactual review.",
    },
  ];

  return (
    <section className="module-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Club Overview</p>
          <h2>{team.club} pitcher intelligence board.</h2>
          <p className="lede">
            A club-scoped view of season-to-date allocation evidence, current priority windows, and the strategic edge cases where starter decay meets a better relief alternative.
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Season Preventable Runs" value={formatRuns(seasonProjected)} detail={`Club-level preventable-run opportunity across ${profilesPayload?.summary.gameCount ?? 0} covered games.`} />
        <StatCard label="Actionable Audit Cases" value={String(actionableCases)} detail={`${missedHooks} missed hooks plus ${delayedChanges} delayed changes.`} />
        <StatCard label="Pitchers Covered" value={String(profiles.length)} detail={`${profiles.reduce((total, profile) => total + profile.pitchWindows, 0)} pitch windows in season profiles.`} />
        <StatCard label="Largest Concentration" value={topOpportunity?.pitcher ?? "—"} detail={topOpportunity ? `${formatRuns(topOpportunity.projectedRunsSaved)} preventable runs.` : "No profile concentration yet."} />
      </div>

      <div className="club-insight-grid">
        {clubInsights.map((insight) => (
          <article className="club-insight-card" key={insight.label}>
            <p className="eyebrow">{insight.label}</p>
            <h3>{insight.title}</h3>
            <p>{insight.detail}</p>
            <strong>{insight.action}</strong>
          </article>
        ))}
      </div>

      <div className="overview-season-grid">
        <article className="brief-card">
          <p className="eyebrow">Season Rollup</p>
          <h3>Club-level diagnosis.</h3>
          <p>
            This overview should be read as a season-to-date allocation briefing. It combines all available profile windows and audit windows for this club, then highlights where a staff process review found defensible preventable-run risk.
          </p>
          <div className="brief-facts">
            <span>Games: {profilesPayload?.summary.gameCount ?? "—"}</span>
            <span>Pitcher profiles: {profiles.length}</span>
            <span>Calibration windows: {profilesPayload?.summary.calibrationWindowCount ?? payload.summary.calibrationWindowCount ?? "—"}</span>
            <span>Missed hooks: {missedHooks}</span>
          </div>
        </article>
        <article className="brief-card">
          <p className="eyebrow">Projected vs Raw Model</p>
          <h3>Calibration layer.</h3>
          <p>
            Raw model is the direct starter-vs-reliever next-window run impact. Projected Preventable Runs applies comparable historical calibration by status, degradation band, leverage band, inning band, and decision-delta band when enough samples exist. If no comparable bucket exists, projected equals model-implied.
          </p>
          <div className="brief-facts">
            <span>Board preventable runs: {formatRuns(snapshotProjected)}</span>
            <span>Board rows: {decisions.length}</span>
            <span>Top per-game: {topPerGame ? `${topPerGame.pitcher} ${formatRuns(profilePerGame(topPerGame))}` : "—"}</span>
            <span>Source games: {payload.summary.sourceGameCount ?? "—"}</span>
          </div>
        </article>
      </div>

      <div className="overview-matrix-card">
        <div className="section-heading section-heading--compact">
          <div>
            <p className="eyebrow eyebrow--navy">Deployment Matrix</p>
            <h2>Where the strategic edge is concentrated.</h2>
            <p className="lede">The top-right cell is the target: a hurting starter with an available relief upgrade. Counts below use the season audit summary; use the Matrix/Audit drill-down for case review.</p>
          </div>
          <div className="matrix-actions">
            <button type="button" className="refresh-action secondary-action" onClick={() => onModuleChange("matrix")}>Open Matrix</button>
            <button type="button" className="refresh-action secondary-action" onClick={() => onModuleChange("audit")}>Open Audit</button>
          </div>
        </div>
        <div className="overview-matrix-grid">
          <div className="overview-matrix-cell">
            <span>Above-average pen · Above-average starter</span>
            <strong>Standard usage</strong>
            <em>{seasonMatrix.standard} season cases · {matrixBuckets.standard.length} priority</em>
          </div>
          <div className="overview-matrix-cell target">
            <span>Above-average pen · Below-average starter</span>
            <strong>Tandem mandatory</strong>
            <em>{seasonMatrix.tandem} season cases · {matrixBuckets.tandem.length} priority</em>
          </div>
          <div className="overview-matrix-cell">
            <span>Below-average pen · Above-average starter</span>
            <strong>Push the starter</strong>
            <em>{seasonMatrix.push} season cases · {matrixBuckets.push.length} priority</em>
          </div>
          <div className="overview-matrix-cell">
            <span>Below-average pen · Below-average starter</span>
            <strong>Workload management</strong>
            <em>{seasonMatrix.workload} season cases · {matrixBuckets.workload.length} priority</em>
          </div>
        </div>
      </div>

      <div className="module-grid module-grid--wide-left">
        <div>
          <div className="section-heading section-heading--compact">
            <div>
              <p className="eyebrow eyebrow--navy">Primary Staff Moves</p>
              <h2>Priority opportunity snapshots.</h2>
              <p className="lede">These are the top-ranked model windows from the board feed. They are designed for action review, not as the full season aggregate.</p>
            </div>
          </div>
          {decisions.length === 0 ? (
            <EmptyState
              title={`No current ${team.club} pitcher decisions`}
              detail="When this club has an active pitcher window or postgame audit, it will appear here."
            />
          ) : (
            <div className="opportunity-list">
              {decisions.slice(0, 4).map((decision) => (
                <OpportunityCard key={decision.id} decision={decision} reliefName={bestRelief} />
              ))}
            </div>
          )}
        </div>

        <aside className="brief-card">
          <p className="eyebrow">Front Office Brief</p>
          <h3>How to read the board.</h3>
          <p>
            Use this page as the club summary: season evidence at the top, deployment matrix in the middle, and current/high-priority snapshots below. Use pitcher profiles to diagnose who creates repeat opportunities.
          </p>
          <div className="brief-facts">
            <span>Snapshots: {payload.summary.sourceSnapshotCount ?? "—"}</span>
            <span>Games: {payload.summary.sourceGameCount ?? "—"}</span>
            <span>Calibration windows: {payload.summary.calibrationWindowCount ?? payload.calibration?.windowCount ?? "—"}</span>
            <span>Audit rows: {audits.length}</span>
          </div>
        </aside>
      </div>
    </section>
  );
}

function ReplayModule({
  games,
  selectedGameId,
  onGameChange,
  replay,
  recap,
  team,
}: {
  games: EnterpriseGameSummary[];
  selectedGameId: string | null;
  onGameChange: (gameId: string) => void;
  replay: PitchingReplayResponse | null;
  recap: PitchingGameRecap | null;
  team: Team;
}) {
  const [pitchIndex, setPitchIndex] = useState(0);
  const teamEntries = useMemo(() => {
    const entries = replay?.entries ?? [];
    return entries
      .filter((entry) => entry.snapshot.fielding_team === team.abbr)
      .sort((a, b) => pitchCountForEntry(a) - pitchCountForEntry(b));
  }, [replay, team.abbr]);
  const selectedEntry = teamEntries[Math.min(pitchIndex, Math.max(0, teamEntries.length - 1))] ?? null;
  const selectedGame = games.find((game) => game.game_id === selectedGameId) ?? games[0] ?? null;
  const currentStatus = selectedEntry?.recommendation.status ?? "STAY";
  const selectedPitcher = selectedEntry?.snapshot.pitcher_name ?? recap?.starters.find((pitcher) => pitcher.team === team.abbr)?.pitcher_name ?? "Pitcher";
  const currentPitchCount = selectedEntry ? pitchCountForEntry(selectedEntry) : null;
  const pullEntry = teamEntries.find((entry) => String(entry.recommendation.status).toUpperCase() === "PULL_NOW");
  const pullPitchCount = pullEntry ? pitchCountForEntry(pullEntry) : null;
  const currentCurve = selectedEntry ? stuffCurveForEntries(teamEntries, Math.min(pitchIndex, teamEntries.length - 1)) : [];
  const bestCandidate = selectedEntry?.top_candidates?.find((candidate) => candidate.available) ?? selectedEntry?.top_candidates?.[0] ?? null;
  const decisionAction =
    String(currentStatus).toUpperCase() === "PULL_NOW"
      ? "Change pitcher now"
      : String(currentStatus).toUpperCase() === "PREP"
        ? "Have the best alternative hot"
        : String(currentStatus).toUpperCase() === "WATCH"
          ? "Monitor the next pocket"
          : "Stay with the pitcher";
  const scoreText = replay
    ? `${replay.game.away_team} ${selectedEntry?.snapshot.away_score ?? "—"} - ${selectedEntry?.snapshot.home_score ?? "—"} ${replay.game.home_team}`
    : "Score pending";

  return (
    <section className="module-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Pitch-by-Pitch Intelligence</p>
          <h2>Game-level replay with model context.</h2>
          <p className="lede">
            This is the enterprise version of Mound Signal: same game-level replay concept, with decay, degradation, relief alternative, and Preventable Runs context layered on top.
          </p>
        </div>
        <div className="game-picker">
          <label htmlFor="replay-game-select">Game</label>
          <select
            id="replay-game-select"
            value={selectedGameId ?? ""}
            onChange={(event) => onGameChange(event.target.value)}
          >
            {games.map((game) => (
              <option key={game.game_id} value={game.game_id}>
                {gameLabel(game)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!selectedGameId || !replay || !selectedEntry ? (
        <EmptyState
          title="No game-level replay loaded"
          detail="Select a game for this club. The replay requires finalized pitch-level artifacts from the existing Mound Signal backend."
        />
      ) : (
        <div className="game-replay-shell">
          <div className={`mound-signal-banner signal-${String(currentStatus).toLowerCase()}`}>
            <strong>{statusLabel(currentStatus)}</strong>
            <span>
              Pitch {currentPitchCount ?? "—"} · {selectedEntry.recommendation.top_reason_codes.slice(0, 4).map(normalizeReason).join(" · ") || "Model factors pending"}
            </span>
          </div>

          <div className="mound-replay-grid">
            <aside className="mound-situation-card">
              <div>
                <TeamLogo abbr={team.abbr} />
                <h3>{selectedPitcher}</h3>
                <p>{gameLabel(selectedGame)}</p>
              </div>
              <BaseOutDisplay baseState={selectedEntry.snapshot.base_state} outs={selectedEntry.snapshot.outs} />
              <div className="situation-grid">
                <span>Inning <strong>{selectedEntry.snapshot.half === "top" ? "▲" : "▼"}{selectedEntry.snapshot.inning}</strong></span>
                <span>Pitch # <strong>{currentPitchCount ?? "—"}</strong></span>
                <span>TTO <strong>{selectedEntry.snapshot.starter_state.times_through_order ?? "—"}</strong></span>
                <span>Leverage <strong>{formatScore(selectedEntry.snapshot.leverage_index, 2)}</strong></span>
              </div>
            </aside>

            <div className="pitch-tunnel-card">
              <div className="pitch-type-panel">
                <div>
                  <span>Type</span>
                  <strong>{pitchTypeName(selectedEntry.snapshot.pitch_type)}</strong>
                </div>
                <div>
                  <span>Velocity</span>
                  <b>{formatScore(selectedEntry.snapshot.release_speed ?? selectedEntry.snapshot.starter_state.velo_mean_5, 1)} mph</b>
                </div>
                <div>
                  <span>Pitch Count</span>
                  <b>P{currentPitchCount ?? "—"}</b>
                </div>
              </div>
              <div className="zone-card">
                <div className="strike-zone">
                  {teamEntries.map((entry, index) => {
                    const px = entry.snapshot.px ?? ((index % 7) - 3) * 0.22;
                    const pz = entry.snapshot.pz ?? 2.2 + ((index % 11) - 5) * 0.12;
                    const x = Math.max(5, Math.min(95, 50 + px * 22));
                    const y = Math.max(5, Math.min(95, 100 - pz * 24));
                    return (
                      <button
                        key={`${entry.snapshot.pitch_id}-${index}`}
                        type="button"
                        className={index === pitchIndex ? "active" : ""}
                        style={{ left: `${x}%`, top: `${y}%` }}
                        onClick={() => setPitchIndex(index)}
                        title={`Pitch ${pitchCountForEntry(entry)} · ${statusLabel(entry.recommendation.status)}`}
                      />
                    );
                  })}
                  <div className="zone-box" />
                </div>
                <div className="score-line">{scoreText}</div>
              </div>
            </div>

            <aside className="degradation-card">
              <p className="eyebrow eyebrow--muted">Degradation Factors</p>
              <MetricBar label="Velocity Drop" value={velocityDrop(selectedEntry)} suffix=" mph" max={-4} inverse />
              <MetricBar label="Spin Change" value={spinChange(selectedEntry)} suffix=" rpm" max={400} />
              <MetricBar label="Location Dispersion" value={selectedEntry.snapshot.starter_state.location_dispersion_10} max={1.4} />
              <MetricBar label="Zone Miss Distance" value={selectedEntry.snapshot.starter_state.zone_miss_distance_10} suffix=" ft" max={0.75} />
              <MetricBar label="Whiff Loss" value={selectedEntry.snapshot.starter_state.whiff_rate_15 == null ? null : 1 - selectedEntry.snapshot.starter_state.whiff_rate_15} max={1} percent />
              <MetricBar label="Hard Contact" value={selectedEntry.snapshot.starter_state.hard_contact_rate_15} max={1} percent />
              <MetricBar label="Ball Rate" value={selectedEntry.snapshot.starter_state.ball_rate_10} max={1} percent />
              <MetricBar label="Pitch Mix Drift" value={selectedEntry.snapshot.starter_state.pitch_mix_drift_10} max={1} percent />
              <div className="degradation-score">
                <span>{Math.round(selectedEntry.snapshot.starter_state.degradation_score * 100)}</span>
                <strong>Degradation</strong>
                <em>{statusLabel(selectedEntry.recommendation.status)}</em>
              </div>
              <p className="factor-note">
                Missing factors are shown as unavailable when the finalized replay artifact did not expose that pitch-level input for this pitch.
              </p>
            </aside>
          </div>

          <div className="replay-decision-grid">
            <article className="decision-answer-card">
              <p className="eyebrow">Pull Decision at This Pitch</p>
              <h3>{decisionAction}</h3>
              <p>
                The answer changes pitch by pitch. This view compares the starter&apos;s current degradation and game state against the best relief alternative and its usage cost.
              </p>
              <div className="decision-answer-stats">
                <span>Best alternative <strong>{selectedEntry.recommendation.recommended_reliever_name || bestCandidate?.player_name || "Unavailable"}</strong></span>
                <span>Usage cost <strong>{formatScore(bestCandidate?.usage_cost, 2)}</strong></span>
                <span>Decision delta <strong>{formatScore(selectedEntry.recommendation.decision_delta, 2)}</strong></span>
                <span>Win prob delta <strong>{formatPercent(selectedEntry.recommendation.estimated_win_probability_delta)}</strong></span>
              </div>
            </article>
            <article className="decay-card">
              <p className="eyebrow">Dynamic Decay Trajectory</p>
              <h3>Stuff path through selected pitch.</h3>
              <MiniCurve values={currentCurve} />
              <p>
                The curve summarizes how the degradation composite has moved within this outing. Recovery or stabilization can justify staying even after an earlier warning.
              </p>
            </article>
          </div>

          <div className="replay-controls">
            <button type="button" onClick={() => setPitchIndex(Math.max(0, pitchIndex - 1))}>‹</button>
            <button type="button" className="play-button">Pitch {currentPitchCount ?? "—"}</button>
            <button type="button" onClick={() => setPitchIndex(Math.min(teamEntries.length - 1, pitchIndex + 1))}>›</button>
            <button
              type="button"
              className="jump-button"
              disabled={pullPitchCount == null}
              onClick={() => {
                const next = pullEntry ? teamEntries.indexOf(pullEntry) : -1;
                if (next >= 0) setPitchIndex(next);
              }}
            >
              Jump to Pull Now
            </button>
          </div>

          <div className="pitch-strip" aria-label="Pitch-by-pitch replay strip">
            {teamEntries.map((entry, index) => (
              <button
                key={`${entry.snapshot.pitch_id}-strip-${index}`}
                type="button"
                className={`${index === pitchIndex ? "active" : ""} signal-${String(entry.recommendation.status).toLowerCase()}`}
                onClick={() => setPitchIndex(index)}
                title={`Pitch ${pitchCountForEntry(entry)} · ${statusLabel(entry.recommendation.status)}`}
              />
            ))}
          </div>

          <div className="replay-metric-grid">
            <StatCard label="Current Stuff Score" value={String(stuffScoreFromEntry(selectedEntry))} detail="Inverse of the pitch-level degradation composite." />
            <StatCard label="Decision Delta" value={formatScore(selectedEntry.recommendation.decision_delta, 2)} detail="Starter-vs-best-alternative model separation." />
            <StatCard label="Best Reliever" value={selectedEntry.recommendation.recommended_reliever_name || "—"} detail="Optimal alternative if the hook clears." />
            <StatCard label="Win Probability Delta" value={formatPercent(selectedEntry.recommendation.estimated_win_probability_delta)} detail="Decision opportunity in current game state." />
          </div>

          {recap && (
            <GameRecapSummary recap={recap} team={team} />
          )}
        </div>
      )}
    </section>
  );
}

function PitchersModule({ profilesPayload }: { profilesPayload: PitcherProfilesPayload | null }) {
  const profiles = profilesPayload?.profiles ?? [];
  const [selectedPitcherId, setSelectedPitcherId] = useState<string>("");
  useEffect(() => {
    if (profiles.length === 0) {
      setSelectedPitcherId("");
      return;
    }
    if (!selectedPitcherId || !profiles.some((profile) => (profile.pitcherId || profile.pitcher) === selectedPitcherId)) {
      setSelectedPitcherId(profiles[0].pitcherId || profiles[0].pitcher);
    }
  }, [profiles, selectedPitcherId]);
  const selected = profiles.find((profile) => (profile.pitcherId || profile.pitcher) === selectedPitcherId) ?? profiles[0] ?? null;

  return (
    <section className="module-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Pitcher Profiles</p>
          <h2>Season-facing pitcher intelligence.</h2>
          <p className="lede">
            Select any pitcher who has appeared for the club this season. Each profile rolls game-level degradation windows into season-to-date run-prevention intelligence.
          </p>
        </div>
        <div className="game-picker">
          <label htmlFor="pitcher-select">Pitcher</label>
          <select
            id="pitcher-select"
            value={selectedPitcherId}
            onChange={(event) => setSelectedPitcherId(event.target.value)}
          >
            {profiles.map((profile) => (
              <option key={profile.pitcherId || profile.pitcher} value={profile.pitcherId || profile.pitcher}>
                {profile.pitcher}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!selected ? (
        <EmptyState title="No pitcher profiles for this club yet" detail="Profiles populate from season-to-date replay artifacts for every pitcher who has appeared for the selected club." />
      ) : (
        <div className="pitcher-profile-detail">
          <article className="pitcher-profile-hero">
            <span className="eyebrow eyebrow--muted">{selected.team} · season to date</span>
            <h3>{selected.pitcher}</h3>
            <div className="profile-metrics profile-metrics--wide">
              <span>Preventable Runs <strong>{formatRuns(selected.projectedRunsSaved)}</strong></span>
              <span>Preventable / Game <strong>{selected.appearances > 0 ? formatRuns((selected.projectedRunsSaved ?? 0) / selected.appearances) : AWAITING}</strong></span>
              <span>Appearances <strong>{selected.appearances}</strong></span>
              <span>Pitch Windows <strong>{selected.pitchWindows}</strong></span>
              <span>Pull Now Games <strong>{selected.pullNowGames}</strong></span>
              <span>Avg Degradation <strong>{formatScore(selected.avgDegradation, 2)}</strong></span>
            </div>
          </article>
          <article className="profile-reading-card">
            <p className="eyebrow">How to read this pitcher</p>
            <h3>{selected.pitcher} is ranked by allocation opportunity, not realized performance.</h3>
            <p>
              Preventable Runs sums the calibrated model windows attached to this pitcher&apos;s games. A high number means the model repeatedly found defensible run-risk that may have been preventable through different pitcher allocation. It should prompt drill-down into the game log and replay, not be read as official runs prevented or a talent-only rating.
            </p>
            <div className="brief-facts">
              <span>Peak degradation: {formatScore(selected.maxDegradation, 2)}</span>
              <span>Prep/watch games: {selected.prepOrWatchGames}</span>
              <span>Pull now games: {selected.pullNowGames}</span>
              <span>Windows: {selected.pitchWindows}</span>
            </div>
          </article>
          <div className="game-log-table">
            <div className="game-log-head">
              <span>Game</span>
              <span>Peak Signal</span>
              <span>Pitch Windows</span>
              <span>Max Deg</span>
              <span>Preventable Runs</span>
              <span>Trajectory</span>
            </div>
            {selected.gameLog.map((game) => (
              <div className="game-log-row" key={`${selected.pitcher}-${game.gameId}`}>
                <div>
                  <strong>{game.matchup}</strong>
                  <span>{game.date}</span>
                </div>
                <span>{statusLabel(game.peakStatus)}</span>
                <span>{game.pitchWindows}</span>
                <span>{formatScore(game.maxDegradation, 2)}</span>
                <span>{formatRuns(game.projectedRunsSaved)}</span>
                <MiniCurve values={game.stuffCurve} compact />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function inferredReliefProfiles(profilesPayload: PitcherProfilesPayload | null): PitcherProfile[] {
  const profiles = profilesPayload?.profiles ?? [];
  const inferred = profiles.filter((profile) => {
    const avgMaxPitchCount = average(profile.gameLog.map((game) => game.maxPitchCount));
    return (avgMaxPitchCount != null && avgMaxPitchCount <= 45) || profile.appearances >= 8;
  });
  return (inferred.length > 0 ? inferred : profiles)
    .slice()
    .sort((a, b) => (b.projectedRunsSaved ?? -Infinity) - (a.projectedRunsSaved ?? -Infinity));
}

function BullpenModule({
  options,
  profilesPayload,
}: {
  options: BullpenOption[];
  profilesPayload: PitcherProfilesPayload | null;
}) {
  const reliefProfiles = inferredReliefProfiles(profilesPayload);
  return (
    <section className="module-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Relief Alternatives</p>
          <h2>Available arms, usage cost, and matchup fit.</h2>
          <p className="lede">
            The top table is current decision-engine context. The season table below lists the club&apos;s staff profiles so the front office can see the broader relief pool, not only the three arms attached to the current board.
          </p>
        </div>
      </div>

      <div className="bullpen-stack">
        <div>
          <div className="section-heading section-heading--compact">
            <div>
              <p className="eyebrow eyebrow--navy">Current Decision Alternatives</p>
              <h2>Arms attached to active hook windows.</h2>
            </div>
          </div>
          {options.length === 0 ? (
            <EmptyState title="No current relief alternatives" detail="No active decision window returned a bullpen alternative for this club." />
          ) : (
            <div className="bullpen-table">
              <div className="bullpen-head">
                <span>Pitcher</span>
                <span>Role</span>
                <span>Availability</span>
                <span>Matchup Fit</span>
                <span>Usage Cost</span>
                <span>Net Option</span>
              </div>
              {options.map((option) => (
                <div className="bullpen-row" key={option.id}>
                  <div>
                    <div className="name">{option.name}</div>
                    <div className="sub">RSS {formatScore(option.rss)}</div>
                  </div>
                  <div className="cell" data-label="Role">{option.role}</div>
                  <div className="cell" data-label="Availability">{option.availability}</div>
                  <div className={`cell ${option.matchupFit == null ? "awaiting" : ""}`} data-label="Matchup Fit">{formatPercent(option.matchupFit)}</div>
                  <div className={`cell ${option.usageCost == null ? "awaiting" : ""}`} data-label="Usage Cost">{formatScore(option.usageCost)}</div>
                  <div className={`cell ${option.netOptionScore == null ? "awaiting" : ""}`} data-label="Net Option">{formatScore(option.netOptionScore)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="section-heading section-heading--compact">
            <div>
              <p className="eyebrow eyebrow--navy">Season Staff View</p>
              <h2>Relief pool and short-window profiles.</h2>
            </div>
          </div>
          {reliefProfiles.length === 0 ? (
            <EmptyState title="No season staff profiles loaded" detail="Season-to-date profiles populate from finalized replay artifacts." />
          ) : (
            <div className="bullpen-table bullpen-table--season">
              <div className="bullpen-head">
                <span>Pitcher</span>
                <span>Appearances</span>
                <span>Pitch Windows</span>
                <span>Avg Deg</span>
                <span>Pull Now Games</span>
                <span>Preventable Runs</span>
              </div>
              {reliefProfiles.map((profile) => (
                <div className="bullpen-row" key={profile.pitcherId || profile.pitcher}>
                  <div>
                    <div className="name">{profile.pitcher}</div>
                    <div className="sub">{profile.team} · season to date</div>
                  </div>
                  <div className="cell" data-label="Appearances">{profile.appearances}</div>
                  <div className="cell" data-label="Pitch Windows">{profile.pitchWindows}</div>
                  <div className="cell" data-label="Avg Deg">{formatScore(profile.avgDegradation, 2)}</div>
                  <div className="cell" data-label="Pull Now Games">{profile.pullNowGames}</div>
                  <div className="cell" data-label="Preventable Runs">{formatRuns(profile.projectedRunsSaved)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function matrixKey(decision: PitcherDecision, bestOption: BullpenOption | null): "standard" | "tandem" | "push" | "workload" {
  const lateStuff = lastAverage(decision.stuffCurve, 2);
  const starterAbove = (lateStuff ?? 50) >= 55 && (decision.cliffProbability ?? 0.5) < 0.6;
  const bullpenAbove = (bestOption?.netOptionScore ?? bestOption?.matchupFit ?? 0) >= 0.45;
  if (bullpenAbove && starterAbove) return "standard";
  if (bullpenAbove && !starterAbove) return "tandem";
  if (!bullpenAbove && starterAbove) return "push";
  return "workload";
}

function MatrixModule({ decisions, bullpenOptions }: { decisions: PitcherDecision[]; bullpenOptions: BullpenOption[] }) {
  const bestOption = bullpenOptions.length > 0 ? [...bullpenOptions].sort((a, b) => (b.netOptionScore ?? -Infinity) - (a.netOptionScore ?? -Infinity))[0] : null;
  const buckets = {
    standard: decisions.filter((decision) => matrixKey(decision, bestOption) === "standard"),
    tandem: decisions.filter((decision) => matrixKey(decision, bestOption) === "tandem"),
    push: decisions.filter((decision) => matrixKey(decision, bestOption) === "push"),
    workload: decisions.filter((decision) => matrixKey(decision, bestOption) === "workload"),
  };

  return (
    <section className="module-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Deployment Matrix</p>
          <h2>Starter value × bullpen alternative.</h2>
          <p className="lede">
            This synthesizes the room&apos;s core question: is the decayed starter still the best available option for the innings needed?
          </p>
        </div>
      </div>

      <div className="decision-matrix">
        <div className="matrix-axis matrix-axis--top">Pitcher&apos;s late-inning stuff</div>
        <div className="matrix-axis matrix-axis--side">Bullpen quality</div>
        <div className="matrix-cell standard">
          <span>Above-average pen · Above-average starter</span>
          <h3>Standard usage</h3>
          <p>Conventional usage is acceptable. The starter is still strong and the pen should be preserved for leverage.</p>
          <strong>{buckets.standard.length} current cases</strong>
        </div>
        <div className="matrix-cell tandem">
          <span>Above-average pen · Below-average starter</span>
          <h3>Tandem mandatory</h3>
          <p>The strategic edge is concentrated here: a hurting starter in front of an available relief upgrade.</p>
          <strong>{buckets.tandem.length} current cases</strong>
        </div>
        <div className="matrix-cell push">
          <span>Below-average pen · Above-average starter</span>
          <h3>Push the starter</h3>
          <p>Even with some decay, the starter may still outpitch the realistic bullpen alternative.</p>
          <strong>{buckets.push.length} current cases</strong>
        </div>
        <div className="matrix-cell workload">
          <span>Below-average pen · Below-average starter</span>
          <h3>Workload management</h3>
          <p>The lever is roster and workload planning more than one in-game hook decision.</p>
          <strong>{buckets.workload.length} current cases</strong>
        </div>
      </div>
    </section>
  );
}

function timingPillClass(timing: AuditRow["timing"]): string {
  switch (timing) {
    case "Early":
      return "timing-pill timing-pill--early";
    case "On time":
      return "timing-pill timing-pill--ontime";
    case "Late":
      return "timing-pill timing-pill--late";
    case "Held":
      return "timing-pill timing-pill--held";
    default:
      return "timing-pill";
  }
}

type AuditCase = {
  id: string;
  bucket: string;
  game: string;
  pitcher: string;
  inning: string;
  status: string;
  timing: AuditRow["timing"];
  leverageIndex: number | null;
  actualDecision: string;
  recommendedDecision: string;
  bestAlternative: string;
  modelWindowPitchCount: number | null;
  actualReplacementPitcher: string | null;
  actualChangePitchCount: number | null;
  actualChangeAfterPitches: number | null;
  actualChangeAfterBatters: number | null;
  actualChangeWithinNextPocket: boolean | null;
  actualRunsAfter: number | null;
  projectedRunsSaved: number | null;
  estimatedWinProbabilityDelta: number | null;
  note: string;
  counterfactualSummary: string;
  opportunityDescription: string;
  starterValueNextWindow: number | null;
  alternativeValueNextWindow: number | null;
};

function auditString(record: Record<string, unknown> | null | undefined, keys: string[], fallback = ""): string {
  if (!record) return fallback;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function auditNumber(record: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function nestedAuditRecord(row: PitchingAuditWindow, key: string): Record<string, unknown> | null {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function auditTimingFromBucket(bucket: string): AuditRow["timing"] {
  if (bucket === "Missed Hook") return "Late";
  if (bucket === "Delayed Change") return "Held";
  if (bucket === "Justified Stay") return "On time";
  return "Held";
}

function auditCaseFromWindow(row: PitchingAuditWindow, bucket: string, index: number): AuditCase {
  const starter = nestedAuditRecord(row, "starter");
  const topCandidate = nestedAuditRecord(row, "top_candidate");
  const recommendation = nestedAuditRecord(row, "recommendation");
  const pitcher = auditString(row, ["pitcher_name", "pitcher"], auditString(starter, ["pitcher_name", "name"], "Pitcher"));
  const game = auditString(row, ["matchup", "game"], auditString(row, ["game_id", "game_pk"], "Game"));
  const inning = auditString(row, ["inning"], auditString(starter, ["inning"], "Inning pending"));
  const status = auditString(row, ["status"], auditString(recommendation, ["status"], bucket));
  const actualOutcome = auditString(row, ["actual_outcome", "actualDecision", "actual_decision"], "");
  const actualDecision = actualOutcome ? normalizeReason(actualOutcome) : bucket === "Justified Stay" ? "Stayed with starter" : "Decision pending";
  const recommendedDecision =
    status.toUpperCase() === "PULL_NOW" || bucket === "Missed Hook" || bucket === "Delayed Change"
      ? "Change pitcher"
      : "Stay with pitcher";
  return {
    id: `${bucket}-${auditString(row, ["game_id", "game_pk"], "game")}-${pitcher}-${index}`,
    bucket,
    game,
    pitcher,
    inning: String(inning),
    status,
    timing: auditTimingFromBucket(bucket),
    leverageIndex: auditNumber(row, ["leverage_index"]) ?? auditNumber(starter, ["leverage_index"]),
    actualDecision,
    recommendedDecision,
    bestAlternative: auditString(topCandidate, ["player_name", "name"], UNAVAILABLE),
    modelWindowPitchCount: null,
    actualReplacementPitcher: null,
    actualChangePitchCount: null,
    actualChangeAfterPitches: null,
    actualChangeAfterBatters: null,
    actualChangeWithinNextPocket: null,
    actualRunsAfter: null,
    projectedRunsSaved: auditNumber(row, ["projected_runs_saved", "estimated_runs_saved", "runs_saved"]),
    estimatedWinProbabilityDelta: auditNumber(row, ["estimated_win_probability_delta", "win_probability_delta"]),
    note: auditString(row, ["note", "outcome_note"], "No outcome note recorded."),
    counterfactualSummary: auditString(row, ["counterfactual_summary", "counterfactualSummary"], "Counterfactual pending calibration."),
    opportunityDescription: auditString(row, ["opportunity_description", "opportunityDescription"], "Opportunity description pending."),
    starterValueNextWindow: auditNumber(row, ["starter_value_next_window", "starterValueNextWindow"]) ?? auditNumber(starter, ["value_next_window"]),
    alternativeValueNextWindow: auditNumber(row, ["alternative_value_next_window", "alternativeValueNextWindow"]) ?? auditNumber(topCandidate, ["net_option_score", "value_next_window"]),
  };
}

function auditCaseFromBoardRow(row: AuditRow): AuditCase {
  return {
    id: row.id,
    bucket: "Enterprise Board",
    game: row.game,
    pitcher: row.pitcher || row.decision,
    inning: row.inning || "Inning pending",
    status: row.recommendedDecision || row.decision,
    timing: row.timing,
    leverageIndex: row.leverageIndex ?? null,
    actualDecision: row.actualDecision || "Unavailable",
    recommendedDecision: row.recommendedDecision || "Unavailable",
    bestAlternative: row.bestAlternative || UNAVAILABLE,
    modelWindowPitchCount: row.modelWindowPitchCount ?? null,
    actualReplacementPitcher: row.actualReplacementPitcher ?? null,
    actualChangePitchCount: row.actualChangePitchCount ?? null,
    actualChangeAfterPitches: row.actualChangeAfterPitches ?? null,
    actualChangeAfterBatters: row.actualChangeAfterBatters ?? null,
    actualChangeWithinNextPocket: row.actualChangeWithinNextPocket ?? null,
    actualRunsAfter: row.runsAfterModelWindow ?? row.actualRunsAfter ?? null,
    projectedRunsSaved: row.projectedRunsSaved ?? row.modelImpliedRunsSaved ?? null,
    estimatedWinProbabilityDelta: row.estimatedWinProbabilityDelta ?? null,
    note: row.note || "",
    counterfactualSummary: row.counterfactualSummary || "Counterfactual unavailable in enterprise audit payload.",
    opportunityDescription: row.opportunityDescription || "",
    starterValueNextWindow: row.starterValueNextWindow ?? null,
    alternativeValueNextWindow: row.alternativeValueNextWindow ?? null,
  };
}

function auditCasesFromSummary(summary: PitchingAuditSummaryPayload | null): AuditCase[] {
  if (!summary) return [];
  return [
    ...(summary.missed_hook_windows ?? []).map((row, index) => auditCaseFromWindow(row, "Missed Hook", index)),
    ...(summary.delayed_change_windows ?? []).map((row, index) => auditCaseFromWindow(row, "Delayed Change", index)),
    ...(summary.high_leverage_holdouts ?? []).map((row, index) => auditCaseFromWindow(row, "High-Leverage Hold", index)),
    ...(summary.justified_stay_windows ?? []).map((row, index) => auditCaseFromWindow(row, "Justified Stay", index)),
  ];
}

function auditCasesFromEnterpriseRows(audits: AuditRow[]): AuditCase[] {
  return audits.map(auditCaseFromBoardRow);
}

function auditActualDetail(audit: AuditCase): string {
  const parts: string[] = [];
  if (audit.actualReplacementPitcher) parts.push(`Replacement: ${audit.actualReplacementPitcher}`);
  if (audit.actualChangeAfterPitches != null) parts.push(`${audit.actualChangeAfterPitches} pitches after model window`);
  if (audit.actualChangeAfterBatters != null) parts.push(`${audit.actualChangeAfterBatters} batters after model window`);
  if (audit.actualRunsAfter != null) parts.push(`${audit.actualRunsAfter} runs after model window`);
  if (audit.actualChangeWithinNextPocket != null) {
    parts.push(audit.actualChangeWithinNextPocket ? "Changed within next pocket" : "Not changed within next pocket");
  }
  return parts.length > 0 ? parts.join(" · ") : audit.note || "No actual decision detail recorded.";
}

function auditTimingDetail(audit: AuditCase): string {
  const parts: string[] = [];
  if (audit.modelWindowPitchCount != null) parts.push(`Model window PC ${audit.modelWindowPitchCount}`);
  if (audit.actualChangePitchCount != null) parts.push(`Actual change PC ${audit.actualChangePitchCount}`);
  if (audit.actualChangeAfterPitches != null) parts.push(`Lead time ${audit.actualChangeAfterPitches} pitches`);
  return parts.length > 0 ? parts.join(" · ") : "Pitch-level timing unavailable.";
}

function AuditModule({
  audits,
  auditSummary,
  auditYear,
  onAuditYearChange,
}: {
  audits: AuditRow[];
  auditSummary: PitchingAuditSummaryPayload | null;
  auditYear: string;
  onAuditYearChange: (year: string) => void;
}) {
  const auditCases = useMemo(() => {
    return audits.length > 0 ? auditCasesFromEnterpriseRows(audits) : auditCasesFromSummary(auditSummary);
  }, [auditSummary, audits]);
  const [selectedAuditId, setSelectedAuditId] = useState("");
  useEffect(() => {
    if (auditCases.length === 0) {
      setSelectedAuditId("");
      return;
    }
    if (!selectedAuditId || !auditCases.some((audit) => audit.id === selectedAuditId)) {
      setSelectedAuditId(auditCases[0].id);
    }
  }, [auditCases, selectedAuditId]);
  const selected = auditCases.find((audit) => audit.id === selectedAuditId) ?? auditCases[0] ?? null;
  const counts = auditSummary?.window_filtered_counts ?? {};

  return (
    <section className="module-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Postgame Audit</p>
          <h2>Timing, alternative, and counterfactual.</h2>
          <p className="lede">
            This view reads the full pitching audit summary for the selected club and season, then ties timing to the best recorded bullpen alternative and counterfactual opportunity.
          </p>
        </div>
        <div className="game-picker">
          <label htmlFor="audit-year-select">Season</label>
          <select id="audit-year-select" value={auditYear} onChange={(event) => onAuditYearChange(event.target.value)}>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
          </select>
        </div>
      </div>

      {!selected ? (
        <EmptyState title="No postgame evidence yet" detail="Completed-game audits will appear once final replay detail is available for the selected club." />
      ) : (
        <div className="audit-layout">
          <aside className="replay-selector">
            <p className="eyebrow eyebrow--muted">Audit Cases · {auditYear}</p>
            <div className="audit-counts">
              <span>Missed hooks <strong>{counts.missed_hook_windows_filtered ?? counts.missed_hook_windows ?? "—"}</strong></span>
              <span>Delayed changes <strong>{counts.delayed_change_windows_filtered ?? counts.delayed_change_windows ?? "—"}</strong></span>
              <span>Justified stays <strong>{counts.justified_stay_windows_filtered ?? counts.justified_stay_windows ?? "—"}</strong></span>
            </div>
            {auditCases.map((audit) => (
              <button
                key={audit.id}
                type="button"
                className={selected.id === audit.id ? "active" : ""}
                onClick={() => setSelectedAuditId(audit.id)}
              >
                <strong>{audit.pitcher}</strong>
                <span>{audit.game}</span>
                <small>{audit.bucket} · {formatRuns(audit.projectedRunsSaved)}</small>
              </button>
            ))}
          </aside>

          <div className="audit-counterfactual">
            <div className="audit-hero">
              <div>
                <p className="eyebrow">Selected Decision</p>
                <h3>{selected.pitcher}</h3>
                <p>{selected.game} · {selected.inning || "inning pending"} · LI {formatScore(selected.leverageIndex, 2)}</p>
              </div>
              <span className={timingPillClass(selected.timing)}>{selected.timing}</span>
            </div>

            <div className="counterfactual-grid">
              <StatCard label="Recommended Move" value={selected.recommendedDecision || "—"} detail={selected.opportunityDescription || "No recommendation detail recorded."} />
              <StatCard label="Actual Decision" value={selected.actualDecision || "—"} detail={auditActualDetail(selected)} />
              <StatCard label="Timing Evidence" value={selected.actualChangePitchCount == null ? UNAVAILABLE : `PC ${selected.actualChangePitchCount}`} detail={auditTimingDetail(selected)} />
              <StatCard label="Best Alternative" value={selected.bestAlternative || UNAVAILABLE} detail="Named bullpen option recorded in the audit artifact; not club-confirmed availability unless the source says so." />
              <StatCard label="Projected Preventable Runs" value={formatRuns(selected.projectedRunsSaved)} detail={`Model counterfactual, not an observed result. ${selected.counterfactualSummary || ""}`.trim()} />
            </div>

            <div className="counterfactual-callout">
              <p className="eyebrow eyebrow--gold">Counterfactual</p>
              <h4>{selected.counterfactualSummary || "Counterfactual pending calibration."}</h4>
              <div>
                <span>Starter next-window value: <strong>{formatScore(selected.starterValueNextWindow, 2)}</strong></span>
                <span>Alternative next-window value: <strong>{formatScore(selected.alternativeValueNextWindow, 2)}</strong></span>
                <span>Runs after model window: <strong>{formatScore(selected.actualRunsAfter, 0)}</strong></span>
                <span>Estimated WP delta: <strong>{formatPercent(selected.estimatedWinProbabilityDelta)}</strong></span>
                <span>Audit source: <strong>{auditSummary ? "Full summary artifact" : "Enterprise board fallback"}</strong></span>
              </div>
            </div>

            <div className="audit-table audit-table--compact">
              <div className="audit-head">
                <span>Game</span>
                <span>Decision</span>
                <span>Timing</span>
                <span>Preventable Runs</span>
                <span>Outcome Note</span>
              </div>
              {auditCases.map((audit) => (
                <div className="audit-row" key={audit.id}>
                  <div><div className="game">{audit.game}</div></div>
                  <div className="cell" data-label="Decision"><div className="decision">{audit.recommendedDecision}</div></div>
                  <div data-label="Timing"><span className={timingPillClass(audit.timing)}>{audit.timing}</span></div>
                  <div className={`cell ${audit.projectedRunsSaved == null ? "awaiting" : ""}`} data-label="Preventable Runs">{formatRuns(audit.projectedRunsSaved)}</div>
                  <div className="cell audit-note" data-label="Outcome">{audit.counterfactualSummary || audit.note || "No note recorded."}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function teamMatchesCandidate(team: Team, candidate: TripleAConversionCandidate): boolean {
  const parent = candidate.parentClub.toLowerCase();
  return parent.includes(team.abbr.toLowerCase()) || parent.includes(team.club.toLowerCase()) || parent.includes(team.name.toLowerCase());
}

function RecapsModule({
  team,
  games,
  selectedGameId,
  onGameChange,
  recap,
  settings,
  onSettingsSaved,
}: {
  team: Team;
  games: EnterpriseGameSummary[];
  selectedGameId: string | null;
  onGameChange: (gameId: string) => void;
  recap: PitchingGameRecap | null;
  settings: PitchingRecapSettings | null;
  onSettingsSaved: (settings: PitchingRecapSettings) => void;
}) {
  const [recipientInput, setRecipientInput] = useState("");
  const [sendState, setSendState] = useState<string>("");
  const selectedGame = games.find((game) => game.game_id === selectedGameId) ?? games[0] ?? null;
  const configuredRecipients = settings?.team_recipients?.[team.abbr] ?? [];
  const recapTeams = settings?.recap_teams ?? [];
  const autoTeams = settings?.auto_email_teams ?? [];

  useEffect(() => {
    setRecipientInput(configuredRecipients.join(", "));
  }, [team.abbr, configuredRecipients.join(", ")]);

  async function saveSettings(enabled: boolean) {
    const recipients = recipientInput
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const nextRecapTeams = enabled ? Array.from(new Set([...recapTeams, team.abbr])) : recapTeams.filter((value) => value !== team.abbr);
    const nextAutoTeams = enabled ? Array.from(new Set([...autoTeams, team.abbr])) : autoTeams.filter((value) => value !== team.abbr);
    const nextRecipients = { ...(settings?.team_recipients ?? {}), [team.abbr]: recipients };
    const saved = await savePitchingRecapSettings(
      {
        recap_teams: nextRecapTeams,
        auto_email_teams: nextAutoTeams,
        finalized_email_teams: nextAutoTeams,
        team_recipients: nextRecipients,
      },
      "mlb",
    );
    onSettingsSaved(saved);
    setSendState(enabled ? "Email recap enabled for this club." : "Email recap disabled for this club.");
  }

  async function sendEmail() {
    if (!selectedGameId) return;
    setSendState("Sending recap email...");
    try {
      const response = await sendPitchingRecapEmail({ game_id: selectedGameId, team: team.abbr, send: true }, "mlb");
      setSendState(response.sent ? `Sent to ${(response.sent_to ?? []).join(", ")}.` : "Send completed without confirmed recipients.");
    } catch (err) {
      setSendState(err instanceof Error ? err.message : "Failed to send recap email.");
    }
  }

  return (
    <section className="module-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Game Recaps &amp; Email</p>
          <h2>Postgame briefing for the club.</h2>
          <p className="lede">
            The recap summarizes what happened, where the change opportunity appeared, the actual result, and sends through the same finalized replay-backed email path as current Pitcher Intelligence.
          </p>
        </div>
        <div className="game-picker">
          <label htmlFor="recap-game-select">Game</label>
          <select id="recap-game-select" value={selectedGameId ?? ""} onChange={(event) => onGameChange(event.target.value)}>
            {games.map((game) => (
              <option key={game.game_id} value={game.game_id}>{gameLabel(game)}</option>
            ))}
          </select>
        </div>
      </div>

      {!recap || !selectedGame ? (
        <EmptyState title="No finalized recap loaded" detail="Select a completed game with replay artifacts to generate the club briefing." />
      ) : (
        <div className="recap-module-grid">
          <GameRecapSummary recap={recap} team={team} />
          <aside className="email-settings-card">
            <p className="eyebrow">Email Delivery</p>
            <h3>{team.club} recap delivery</h3>
            <p>
              Enabled clubs receive finalized, replay-backed recaps only. This uses the shared provider configured in the existing pitching recap workflow.
            </p>
            <div className="email-status">
              <span>Current status</span>
              <strong>{recapTeams.includes(team.abbr) ? "Enabled" : "Disabled"}</strong>
              <span>Provider configured</span>
              <strong>{settings?.shared_email_configured ? "Yes" : "No"}</strong>
            </div>
            <label className="email-label" htmlFor="recipient-input">Recipients</label>
            <textarea
              id="recipient-input"
              value={recipientInput}
              onChange={(event) => setRecipientInput(event.target.value)}
              placeholder="one@email.com, two@email.com"
            />
            <div className="email-actions">
              <button type="button" className="refresh-action" onClick={() => void saveSettings(true)}>Enable</button>
              <button type="button" className="refresh-action secondary-action" onClick={() => void saveSettings(false)}>Disable</button>
              <button type="button" className="refresh-action" onClick={() => void sendEmail()}>Send Now</button>
            </div>
            {sendState && <p className="send-note">{sendState}</p>}
          </aside>
        </div>
      )}
    </section>
  );
}

function TripleAModule({ team, candidates }: { team: Team; candidates: TripleAConversionCandidate[] }) {
  const teamCandidates = candidates.filter((candidate) => teamMatchesCandidate(team, candidate));
  const visible = teamCandidates.length > 0 ? teamCandidates : candidates.slice(0, 12);

  return (
    <section className="module-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Triple-A Pipeline</p>
          <h2>Short-window conversion candidates.</h2>
          <p className="lede">
            Identify starters or bulk arms who may create MLB value in shorter relief windows, while controlling for small-sample mirage risk.
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No Triple-A conversion candidates are available yet"
          detail="This module populates from the Triple-A translation model after the calibration feed has enough candidate windows."
        />
      ) : (
        <div className="triple-a-list">
          {visible.map((candidate) => (
            <div key={candidate.id} className="triple-a-row">
              <div>
                <strong>{candidate.pitcher}</strong>
                <div className="cell muted-cell">
                  {candidate.affiliate} · {candidate.parentClub}
                </div>
              </div>
              <div className="cell" data-label="Current">{candidate.currentRole} → {candidate.recommendedRole}</div>
              <div className="cell" data-label="Short-window stuff">{candidate.shortWindowStuffPlus}</div>
              <div className="cell" data-label="Conversion">{candidate.reliefConversionScore}</div>
              <div className="cell" data-label="Runs saved">{formatRuns(candidate.projectedRunsSaved)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function useRunSavingBoard({
  league,
  team,
  year,
  limit,
}: {
  league: "mlb" | "triple_a";
  team?: string;
  year?: string;
  limit?: number;
}) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [payload, setPayload] = useState<RunSavingBoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    setError(null);
    try {
      const data = await fetchRunSavingBoard({ league, team, year, limit });
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
  }, [league, team, year, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return { loadState, payload, error, reload: load };
}

export default function App() {
  const [selectedTeamAbbr, setSelectedTeamAbbr] = useState("ATL");
  const [activeModule, setActiveModule] = useState<ActiveModule>("overview");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [games, setGames] = useState<EnterpriseGameSummary[]>([]);
  const [replay, setReplay] = useState<PitchingReplayResponse | null>(null);
  const [recap, setRecap] = useState<PitchingGameRecap | null>(null);
  const [profilesPayload, setProfilesPayload] = useState<PitcherProfilesPayload | null>(null);
  const [auditSummary, setAuditSummary] = useState<PitchingAuditSummaryPayload | null>(null);
  const [auditYear, setAuditYear] = useState("2026");
  const [recapSettings, setRecapSettings] = useState<PitchingRecapSettings | null>(null);

  const selectedTeam = MLB_TEAMS.find((team) => team.abbr === selectedTeamAbbr) ?? MLB_TEAMS[0];
  const { loadState, payload, error, reload } = useRunSavingBoard({ league: "mlb", team: selectedTeam.abbr, year: auditYear, limit: 40 });
  const { payload: tripleAPayload, reload: reloadTripleA } = useRunSavingBoard({ league: "triple_a", year: auditYear, limit: 80 });
  const apiBase = getConfiguredApiBase();

  const decisions = payload?.decisions ?? [];
  const bullpenOptions = payload?.bullpenOptions ?? [];
  const audits = payload?.audits ?? [];
  const tripleA = tripleAPayload?.tripleAConversionCandidates ?? payload?.tripleAConversionCandidates ?? [];

  useEffect(() => {
    let cancelled = false;
    async function loadGamesAndProfiles() {
      try {
        const [gamePayload, profilePayload, settingsPayload, auditPayload] = await Promise.all([
          fetchEnterpriseGames({ league: "mlb", team: selectedTeam.abbr, limit: 250 }),
          fetchPitcherProfiles({ league: "mlb", team: selectedTeam.abbr, year: "2026", limit: 500 }),
          fetchPitchingRecapSettings("mlb"),
          fetchPitchingAuditSummary({ league: "mlb", team: selectedTeam.abbr, year: auditYear, limit: 500 }),
        ]);
        if (cancelled) return;
        setGames(gamePayload.games);
        setProfilesPayload(profilePayload);
        setRecapSettings(settingsPayload);
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
    void loadGamesAndProfiles();
    return () => {
      cancelled = true;
    };
  }, [selectedTeam.abbr, auditYear]);

  useEffect(() => {
    if (!selectedGameId) {
      setReplay(null);
      setRecap(null);
      return;
    }
    let cancelled = false;
    async function loadReplayAndRecap() {
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
    void loadReplayAndRecap();
    return () => {
      cancelled = true;
    };
  }, [selectedGameId]);

  const renderModule = () => {
    if (!payload) return null;
    switch (activeModule) {
      case "overview":
        return (
          <OverviewModule
            team={selectedTeam}
            payload={payload}
            decisions={decisions}
            bullpenOptions={bullpenOptions}
            audits={audits}
            profilesPayload={profilesPayload}
            auditSummary={auditSummary}
            onModuleChange={setActiveModule}
          />
        );
      case "replay":
        return <ReplayModule games={games} selectedGameId={selectedGameId} onGameChange={setSelectedGameId} replay={replay} recap={recap} team={selectedTeam} />;
      case "pitchers":
        return <PitchersModule profilesPayload={profilesPayload} />;
      case "bullpen":
        return <BullpenModule options={bullpenOptions} profilesPayload={profilesPayload} />;
      case "matrix":
        return <MatrixModule decisions={decisions} bullpenOptions={bullpenOptions} />;
      case "audit":
        return <AuditModule audits={audits} auditSummary={auditSummary} auditYear={auditYear} onAuditYearChange={setAuditYear} />;
      case "recaps":
        return (
          <RecapsModule
            team={selectedTeam}
            games={games}
            selectedGameId={selectedGameId}
            onGameChange={setSelectedGameId}
            recap={recap}
            settings={recapSettings}
            onSettingsSaved={setRecapSettings}
          />
        );
      case "triple-a":
        return <TripleAModule team={selectedTeam} candidates={tripleA} />;
      default:
        return null;
    }
  };

  return (
    <main className="app-shell">
      <ExecutiveHeader
        summary={payload?.summary}
        loadState={loadState}
        apiBase={apiBase}
        team={selectedTeam}
        onRefresh={() => {
          void reload();
          void reloadTripleA();
        }}
      />

      <TeamNav
        selectedTeam={selectedTeam}
        activeModule={activeModule}
        onTeamChange={(team) => {
          setSelectedTeamAbbr(team.abbr);
          setActiveModule("overview");
        }}
        onModuleChange={setActiveModule}
      />

      {loadState === "missing-config" && (
        <section className="state-panel">
          <p className="eyebrow">Connection Required</p>
          <h3>Connect enterprise data source.</h3>
          <p>
            Configure <span className="mono">VITE_BASEBALL_BRAIN_API_BASE</span> to begin surfacing club pitcher intelligence.
          </p>
        </section>
      )}

      {loadState === "error" && (
        <section className="state-panel">
          <p className="eyebrow">Service Notice</p>
          <h3>Data source unavailable.</h3>
          <p>{error ?? "The enterprise data source did not respond. Please retry."}</p>
          <button type="button" className="refresh-action" onClick={() => void reload()}>
            Retry connection
          </button>
        </section>
      )}

      {loadState === "loading" && (
        <section className="state-panel">
          <p className="eyebrow">Preparing Club Page</p>
          <h3>Loading {selectedTeam.club} pitcher intelligence.</h3>
          <p>Retrieving the current slate from the enterprise data source.</p>
        </section>
      )}

      {loadState === "ready" && renderModule()}

      <footer className="data-readiness-footer">
        <span className="readiness-field">
          <span>Source</span>
          <strong>{apiBase || "Not configured"}</strong>
        </span>
        <span className="readiness-field">
          <span>Club</span>
          <strong>{selectedTeam.abbr}</strong>
        </span>
        <span className="readiness-field">
          <span>Generated</span>
          <strong>{payload?.summary.generatedAt ?? "—"}</strong>
        </span>
        <span className="readiness-field">
          <span>Decisions</span>
          <strong>{payload?.summary.decisionCount ?? 0}</strong>
        </span>
        <span className="readiness-field">
          <span>Relief options</span>
          <strong>{payload?.summary.bullpenOptionCount ?? 0}</strong>
        </span>
        <span className="confidential">Confidential &middot; Baseball brAIn, Inc.</span>
      </footer>
    </main>
  );
}
