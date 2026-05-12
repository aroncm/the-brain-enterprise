import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiConfigurationError,
  fetchEnterpriseGames,
  fetchPitcherProfiles,
  fetchPitchingAuditSummary,
  fetchPitchingRecap,
  fetchPitchingReplay,
  fetchPreventableRunsOpportunities,
  fetchRunSavingBoard,
  getConfiguredApiBase,
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
  PitchingReplayEntry,
  PitchingReplayResponse,
  PreventableRunsOpportunityRow,
  PreventableRunsOpportunitiesPayload,
  RunSavingBoardPayload,
  TripleAConversionCandidate,
} from "./types";

type LoadState = "loading" | "ready" | "error" | "missing-config";
type Workflow = "command" | "audit" | "allocation" | "roster";
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

function normalize(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function featureLabel(value: string | null | undefined): string {
  if (!value) return "Model driver";
  const labels: Record<string, string> = {
    base_traffic: "Base traffic",
    leverage: "Leverage",
    leveraged_production_degradation: "Leveraged production degradation",
    pitch_count_norm: "Pitch count",
    tto: "Times through order",
    inning_norm: "Inning",
    degradation_score: "Degradation",
    decay_velocity: "Decay velocity",
    decay_acceleration: "Decay acceleration",
    batter_quality: "Batter quality",
    inning_pitcher_penalty: "Inning-specific pitcher penalty",
    tto_pitcher_penalty: "TTO-specific pitcher penalty",
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

function statusLabel(status: string | null | undefined): string {
  return String(status || "STAY").replace(/_/g, " ").toUpperCase();
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

function CalibratedOpportunityRow({ row }: { row: PreventableRunsOpportunityRow }) {
  const topDrivers = (row.topFeatures ?? [])
    .filter((feature) => typeof feature.contribution === "number" && feature.contribution > 0)
    .slice(0, 3);
  const half = row.half ? normalize(row.half) : "Half unavailable";
  const context = `Inn ${row.inning ?? "—"} · ${half} · ${row.outs ?? "—"} out · Bases ${row.baseState ?? "—"}`;

  return (
    <div className="calibrated-row">
      <div>
        <strong>{row.pitcherName}</strong>
        <span>{row.team} vs {row.opponent} · {formatDateText(row.gameDate)}</span>
      </div>
      <div>
        <strong>{context}</strong>
        <span>PC {row.pitchCount ?? "—"} · LI {fmtNumber(row.leverageIndex, 2)} · Deg {fmtNumber(row.degradationScore, 2)}</span>
      </div>
      <div>
        <strong>{fmtRuns(row.projectedPreventableRuns)} runs</strong>
        <span>Damage probability {fmtPct(row.projectedDamageProbability)}</span>
      </div>
      <div>
        <strong>{row.calibrationSampleCount?.toLocaleString() ?? UNAVAILABLE}</strong>
        <span>Comparable MLB windows</span>
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
    </div>
  );
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
  const topCalibratedRows = calibratedRows.slice(0, 6);

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
        <KPI label="Season Preventable Runs" value={fmtRuns(displayedRuns)} detail="Calibrated model estimate across covered club pitcher windows." tone="gold" />
        <KPI label="High-Value Audit Cases" value={String(opportunityRows.length)} detail="Ranked windows with manager decision context and run impact." tone="bad" />
        <KPI label="Tandem Opportunity Cases" value={String(auditMatrix.tandem || decisionMatrix.tandem)} detail="Hurting starter with a stronger relief alternative." tone="bad" />
        <KPI label="Pitchers Covered" value={String(profiles.length)} detail={`${payload.summary.sourceGameCount ?? 0} source games in the current board.`} />
      </div>

      <article className="panel calibrated-panel">
        <div className="panel-title horizontal">
          <div>
            <p className="eyebrow">Calibrated Preventable Runs</p>
            <h3>New live-state model output now powering the club opportunity view.</h3>
            <p>
              This is the calibrated damage model: exact inning, outs, base state, pitcher degradation, decay trajectory, batter context, leverage, and empirical MLB damage rates.
            </p>
          </div>
          <SourceTag label={preventableRuns?.status === "available" ? "Model artifact ready" : preventableRunsLoading ? "Loading model" : "Model unavailable"} source={preventableRuns?.status === "available" ? "model" : "unavailable"} />
        </div>
        {preventableRunsLoading ? (
          <EmptyState title="Loading calibrated opportunities" detail="Retrieving the current preventable-runs artifact from the Baseball brAIn API." />
        ) : preventableRunsError ? (
          <EmptyState title="Calibrated opportunity source unavailable" detail={preventableRunsError} />
        ) : topCalibratedRows.length === 0 ? (
          <EmptyState title="No calibrated opportunities returned" detail="The model endpoint is reachable, but no rows matched this club and season." />
        ) : (
          <>
            <div className="calibrated-metrics">
              <KPI
                label="Covered Windows"
                value={String(calibratedSummary?.windowCount ?? preventableRuns?.rowCount ?? topCalibratedRows.length)}
                detail="Pitch-level windows eligible for calibrated damage scoring."
              />
              <KPI
                label="Avg Damage Probability"
                value={fmtPct(calibratedSummary?.avgProjectedDamageProbability)}
                detail="Mean probability of damage in the scored windows."
                tone="bad"
              />
              <KPI
                label="Actual Damage Rate"
                value={fmtPct(calibratedSummary?.damageRate)}
                detail={`${calibratedSummary?.missedHookDamageCount ?? 0} missed-hook damage windows in the source artifact.`}
              />
            </div>
            <div className="calibrated-list">
              {topCalibratedRows.map((row) => (
                <CalibratedOpportunityRow key={`${row.gameId}-${row.pitcherId ?? row.pitcherName}-${row.pitchCount ?? row.inning}`} row={row} />
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
}: {
  team: Team;
  games: EnterpriseGameSummary[];
  selectedGameId: string | null;
  onGameChange: (id: string) => void;
  replay: PitchingReplayResponse | null;
  recap: PitchingGameRecap | null;
}) {
  const [pitchIndex, setPitchIndex] = useState(0);
  const entries = useMemo(
    () => (replay?.entries ?? []).filter((entry) => entry.snapshot.fielding_team === team.abbr).sort((a, b) => pitchCount(a) - pitchCount(b)),
    [replay, team.abbr],
  );
  const selected = entries[Math.min(pitchIndex, Math.max(0, entries.length - 1))] ?? null;
  const selectedGame = games.find((game) => game.game_id === selectedGameId) ?? games[0] ?? null;
  const teamPitchers = selectedTeamPitchers(recap, team);
  const keyPitcher = teamPitchers.find((pitcher) => pitcher.first_pull_now_inning != null || pitcher.first_alert_inning != null) ?? teamPitchers[0] ?? null;
  const pullIndex = entries.findIndex((entry) => statusLabel(entry.recommendation.status) === "PULL NOW");
  const bestCandidate = selected?.top_candidates?.find((candidate) => candidate.available) ?? selected?.top_candidates?.[0] ?? null;

  useEffect(() => {
    setPitchIndex(0);
  }, [selectedGameId]);

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
          <div className="audit-summary-grid">
            <KPI
              label="Key Window"
              value={keyPitcher?.first_pull_now_inning != null ? `Inn ${keyPitcher.first_pull_now_inning}, PC ${keyPitcher.first_pull_now_pitch_count}` : UNAVAILABLE}
              detail={keyPitcher ? `${keyPitcher.pitcher_name} reached ${statusLabel(keyPitcher.peak_status)}.` : "No action window returned."}
              tone="gold"
            />
            <KPI
              label="Actual Result"
              value={keyPitcher?.runs_allowed_after_signal == null ? UNAVAILABLE : `${keyPitcher.runs_allowed_after_signal} runs`}
              detail={keyPitcher?.missed_hook ? "Signal was not acted on immediately." : "Observed after the first model action point."}
              tone={keyPitcher?.missed_hook ? "bad" : "neutral"}
            />
            <KPI label="Best Alternative Now" value={bestCandidate?.player_name || UNAVAILABLE} detail={bestCandidate ? `Usage cost ${fmtNumber(bestCandidate.usage_cost, 2)} · net option ${fmtNumber(bestCandidate.net_option_score, 2)}` : "No candidate attached to this pitch."} />
            <KPI label="Current Signal" value={statusLabel(selected.recommendation.status)} detail={`Pitch ${pitchCount(selected)} · ${scoreForEntry(selected, replay)}`} />
          </div>

          <article className="panel replay-panel">
            <div className={`signal-banner signal-${String(selected.recommendation.status).toLowerCase()}`}>
              <strong>{statusLabel(selected.recommendation.status)}</strong>
              <span>{selected.snapshot.pitcher_name} · pitch {pitchCount(selected)} · LI {fmtNumber(selected.snapshot.leverage_index, 2)}</span>
            </div>

            <div className="replay-layout">
              <aside className="situation-card">
                <TeamLogo abbr={team.abbr} />
                <h3>{selected.snapshot.pitcher_name}</h3>
                <BasesAndOuts baseState={selected.snapshot.base_state} outs={selected.snapshot.outs} />
                <div className="situation-list">
                  <span>Inning <strong>{selected.snapshot.half === "top" ? "▲" : "▼"}{selected.snapshot.inning}</strong></span>
                  <span>Pitch count <strong>{pitchCount(selected)}</strong></span>
                  <span>TTO <strong>{selected.snapshot.starter_state.times_through_order}</strong></span>
                  <span>Score <strong>{scoreForEntry(selected, replay)}</strong></span>
                </div>
              </aside>

              <PitchPlot entries={entries} selectedIndex={Math.min(pitchIndex, entries.length - 1)} />

              <aside className="model-card">
                <p className="eyebrow">Model Read</p>
                <div className="metric-list">
                  <span>Pitch type <strong>{pitchName(selected.snapshot.pitch_type)}</strong></span>
                  <span>Velocity <strong>{fmtNumber(selected.snapshot.release_speed ?? selected.snapshot.starter_state.velo_mean_5, 1)} mph</strong></span>
                  <span>Velocity change <strong>{fmtNumber(velocityDrop(selected), 1)} mph</strong></span>
                  <span>Stuff score <strong>{stuffScore(selected)}/100</strong></span>
                  <span>Degradation <strong>{fmtNumber(selected.snapshot.starter_state.degradation_score, 2)}</strong></span>
                  <span>Decision delta <strong>{fmtNumber(selected.recommendation.decision_delta, 2)}</strong></span>
                </div>
                <div className="source-row">
                  <SourceTag label="Official pitch facts" source="official" />
                  <SourceTag label="Model degradation" source="model" />
                </div>
              </aside>
            </div>

            <div className="pitch-controls">
              <button type="button" onClick={() => setPitchIndex(Math.max(0, pitchIndex - 1))}>Previous</button>
              <input
                type="range"
                min={0}
                max={Math.max(0, entries.length - 1)}
                value={Math.min(pitchIndex, Math.max(0, entries.length - 1))}
                onChange={(event) => setPitchIndex(Number(event.target.value))}
              />
              <button type="button" onClick={() => setPitchIndex(Math.min(entries.length - 1, pitchIndex + 1))}>Next</button>
              <button type="button" disabled={pullIndex < 0} onClick={() => setPitchIndex(pullIndex >= 0 ? pullIndex : pitchIndex)}>Jump to Pull Now</button>
            </div>
          </article>

          <article className="panel counterfactual-panel">
            <p className="eyebrow">Decision Explanation</p>
            <h3>What the club should inspect.</h3>
            <div className="counterfactual-grid">
              <div>
                <strong>If changed here</strong>
                <p>{bestCandidate ? `${bestCandidate.player_name} was the best recorded relief alternative at this selected pitch.` : "No relief alternative was recorded for this pitch window."}</p>
              </div>
              <div>
                <strong>If stayed</strong>
                <p>The starter’s current degradation is {fmtNumber(selected.snapshot.starter_state.degradation_score, 2)} with a stuff score of {stuffScore(selected)}.</p>
              </div>
              <div>
                <strong>Actual result</strong>
                <p>{keyPitcher?.runs_allowed_after_signal == null ? "Runs after the first action point are unavailable for this pitcher." : `${keyPitcher.runs_allowed_after_signal} runs scored after the first action point.`}</p>
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

  const selectedTeam = MLB_TEAMS.find((team) => team.abbr === selectedTeamAbbr) ?? MLB_TEAMS[0];
  const { loadState, payload, error, reload } = useRunSavingBoard({ league: "mlb", team: selectedTeam.abbr, limit: 50 });
  const { payload: tripleAPayload, reload: reloadTripleA } = useRunSavingBoard({ league: "triple_a", limit: 50 });
  const {
    payload: preventableRuns,
    error: preventableRunsError,
    loading: preventableRunsLoading,
    reload: reloadPreventableRuns,
  } = usePreventableRunsOpportunities({ season, team: selectedTeam.abbr, limit: 75 });
  const apiBase = getConfiguredApiBase();

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
        />
      )}

      {loadState === "ready" && workflow === "allocation" && (
        <PitcherAllocation profiles={profiles} bullpenOptions={bullpenOptions} />
      )}

      {loadState === "ready" && workflow === "roster" && (
        <RosterConstruction team={selectedTeam} profiles={profiles} auditSummary={auditSummary} candidates={tripleA} />
      )}

      <footer className="app-footer">
        <span>Source: {apiBase || UNAVAILABLE}</span>
        <span>Generated: {payload?.summary.generatedAt ?? LOADING_VALUE}</span>
        <span>Confidential · Baseball brAIn, Inc.</span>
      </footer>
    </main>
  );
}
