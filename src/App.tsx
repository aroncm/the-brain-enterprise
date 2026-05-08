import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiConfigurationError, fetchRunSavingBoard, getConfiguredApiBase } from "./api";
import type {
  AuditRow,
  BullpenOption,
  PitcherDecision,
  RunSavingBoardPayload,
  TripleAConversionCandidate,
} from "./types";

type LoadState = "loading" | "ready" | "error" | "missing-config";
type ActiveModule = "overview" | "replay" | "pitchers" | "bullpen" | "matrix" | "audit" | "triple-a";

type Team = {
  abbr: string;
  name: string;
  club: string;
  division: string;
};

const AWAITING = "Awaiting calibrated value";

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
            <span className="label">Projected Runs Saved</span>
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

function OverviewModule({
  team,
  payload,
  decisions,
  bullpenOptions,
  audits,
}: {
  team: Team;
  payload: RunSavingBoardPayload;
  decisions: PitcherDecision[];
  bullpenOptions: BullpenOption[];
  audits: AuditRow[];
}) {
  const projected = sum(decisions.map((decision) => decision.projectedRunsSaved));
  const avgCliff = average(decisions.map((decision) => decision.cliffProbability));
  const bestRelief = bestReliefName(bullpenOptions);

  return (
    <section className="module-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Club Overview</p>
          <h2>{team.club} pitcher intelligence board.</h2>
          <p className="lede">
            A club-scoped view of today&apos;s starter decisions, relief alternatives, season evidence, and run-prevention opportunities.
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Projected Runs Saved" value={formatRuns(projected)} detail="Sum of calibrated opportunities on this club page." />
        <StatCard label="Open Decisions" value={String(decisions.length)} detail="Starter and relief windows currently requiring evaluation." />
        <StatCard label="Starter Cliff Risk" value={formatPercent(avgCliff)} detail="Average current cliff probability across visible pitcher windows." />
        <StatCard label="Relief Alternatives" value={String(bullpenOptions.length)} detail={bestRelief ? `Top available option: ${bestRelief}.` : "No calibrated relief option currently available."} />
      </div>

      <div className="module-grid module-grid--wide-left">
        <div>
          <div className="section-heading section-heading--compact">
            <div>
              <p className="eyebrow eyebrow--navy">Primary Staff Moves</p>
              <h2>Run prevention opportunities.</h2>
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
            Projected Runs Saved converts pitch-level decay, current leverage, starter outlook, and available relief alternatives into a single
            run-prevention value. The board is built for marginal allocation decisions, not wholesale staff changes.
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
  decisions,
  selectedId,
  onSelect,
}: {
  decisions: PitcherDecision[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = decisions.find((decision) => decision.id === selectedId) ?? decisions[0] ?? null;

  return (
    <section className="module-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Pitch-by-Pitch Intelligence</p>
          <h2>Decay and degradation at game speed.</h2>
          <p className="lede">
            Replay-grade windows show how stuff quality, degradation, cliff probability, and Runs Saved evolve through a pitcher&apos;s outing.
          </p>
        </div>
      </div>

      {decisions.length === 0 || selected == null ? (
        <EmptyState
          title="No replay-grade windows for this club yet"
          detail="Once a selected club has an active or finalized pitcher window, the replay module will expose the pitch-window curve and decision context."
        />
      ) : (
        <div className="replay-layout">
          <aside className="replay-selector">
            <p className="eyebrow eyebrow--muted">Game Windows</p>
            {decisions.map((decision) => (
              <button
                key={decision.id}
                type="button"
                className={selected.id === decision.id ? "active" : ""}
                onClick={() => onSelect(decision.id)}
              >
                <strong>{decision.pitcher}</strong>
                <span>
                  {decision.team} vs {decision.opponent} · {decision.inning}
                </span>
                <small>{decision.recommendation}</small>
              </button>
            ))}
          </aside>

          <div className="replay-stage">
            <div className="replay-headline">
              <div>
                <p className="eyebrow">Selected Pitcher Window</p>
                <h3>{selected.pitcher}</h3>
                <p>
                  {selected.team} vs {selected.opponent} · {selected.role} · {selected.inning}
                </p>
              </div>
              <div className="runs-saved-tile">
                <span>Projected Runs Saved</span>
                <strong>{formatRuns(selected.projectedRunsSaved)}</strong>
              </div>
            </div>

            <div className="replay-curve-card">
              <div className="curve-copy">
                <p className="eyebrow eyebrow--gold">Pitch Window Trajectory</p>
                <h4>{selected.trajectoryLabel}</h4>
                <p>
                  The inning/window curve is the season-facing version of the pitch-by-pitch degradation model: every pitch contributes to the
                  current stuff state, while the curve explains whether the pitcher is fading, recovering, volatile, or stable.
                </p>
              </div>
              <MiniCurve values={selected.stuffCurve} />
            </div>

            <div className="replay-metric-grid">
              <StatCard label="Current Degradation" value={formatScore(selected.currentDegradation, 2)} detail="Composite pitch-level degradation state." />
              <StatCard label="Decay Velocity" value={formatScore(selected.decayVelocity, 1)} detail="How quickly the pitcher is moving away from baseline." />
              <StatCard label="Recovery Index" value={formatPercent(selected.recoveryIndex)} detail="Evidence that the pitcher is stabilizing after early decay." />
              <StatCard label="Cliff Probability" value={formatPercent(selected.cliffProbability)} detail="Probability of a meaningful next-window deterioration." />
            </div>

            <div className="pitch-strip" aria-label="Pitch-window replay strip">
              {selected.stuffCurve.map((value, index) => (
                <div key={`${selected.id}-${index}`} style={{ height: `${Math.max(16, Math.min(96, value))}%` }}>
                  <span>{index + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PitchersModule({ decisions }: { decisions: PitcherDecision[] }) {
  const profiles = useMemo(() => {
    const grouped = new Map<string, PitcherDecision[]>();
    decisions.forEach((decision) => {
      const existing = grouped.get(decision.pitcher) ?? [];
      existing.push(decision);
      grouped.set(decision.pitcher, existing);
    });
    return [...grouped.entries()]
      .map(([pitcher, rows]) => ({
        pitcher,
        team: rows[0]?.team ?? "",
        role: rows[0]?.role ?? "",
        windows: rows.length,
        projectedRunsSaved: sum(rows.map((row) => row.projectedRunsSaved)),
        avgCliff: average(rows.map((row) => row.cliffProbability)),
        avgDegradation: average(rows.map((row) => row.currentDegradation)),
        latestTrajectory: rows[0]?.trajectoryLabel ?? "Pending",
        curve: rows[0]?.stuffCurve ?? [],
      }))
      .sort((a, b) => b.projectedRunsSaved - a.projectedRunsSaved);
  }, [decisions]);

  return (
    <section className="module-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Pitcher Profiles</p>
          <h2>Season-facing pitcher intelligence.</h2>
          <p className="lede">
            Every game-level decay window rolls up to a pitcher profile: durability, cliff risk, recovery behavior, and calibrated run impact.
          </p>
        </div>
      </div>

      {profiles.length === 0 ? (
        <EmptyState title="No pitcher profiles for this club yet" detail="Profiles populate when the selected club has pitcher windows in the enterprise feed." />
      ) : (
        <div className="pitcher-profile-grid">
          {profiles.map((profile) => (
            <article key={profile.pitcher} className="pitcher-profile-card">
              <div>
                <span className="eyebrow eyebrow--muted">
                  {profile.team} · {profile.role}
                </span>
                <h3>{profile.pitcher}</h3>
              </div>
              <MiniCurve values={profile.curve} compact />
              <div className="profile-metrics">
                <span>Runs Saved <strong>{formatRuns(profile.projectedRunsSaved)}</strong></span>
                <span>Cliff Risk <strong>{formatPercent(profile.avgCliff)}</strong></span>
                <span>Degradation <strong>{formatScore(profile.avgDegradation, 2)}</strong></span>
                <span>Windows <strong>{profile.windows}</strong></span>
              </div>
              <p>{profile.latestTrajectory}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function BullpenModule({ options }: { options: BullpenOption[] }) {
  return (
    <section className="module-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Relief Alternatives</p>
          <h2>Available arms, usage cost, and matchup fit.</h2>
          <p className="lede">
            The model only recommends a hook when the alternative is materially better after accounting for availability and rest-of-game cost.
          </p>
        </div>
      </div>

      {options.length === 0 ? (
        <EmptyState title="No relief options available" detail="The enterprise feed has not returned bullpen availability for the selected club." />
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

function AuditModule({ audits }: { audits: AuditRow[] }) {
  return (
    <section className="module-surface">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Postgame Audit</p>
          <h2>Every decision measured after the fact.</h2>
          <p className="lede">
            Postgame evidence shows whether the staff move was early, on time, late, or held too long, with projected and realized run impact.
          </p>
        </div>
      </div>

      {audits.length === 0 ? (
        <EmptyState title="No postgame evidence yet" detail="Completed-game audits will appear once final replay detail is available for the selected club." />
      ) : (
        <div className="audit-table">
          <div className="audit-head">
            <span>Game</span>
            <span>Decision</span>
            <span>Timing</span>
            <span>Runs Saved</span>
            <span>Outcome Note</span>
          </div>
          {audits.map((audit) => (
            <div className="audit-row" key={audit.id}>
              <div><div className="game">{audit.game}</div></div>
              <div className="cell" data-label="Decision"><div className="decision">{audit.decision}</div></div>
              <div data-label="Timing"><span className={timingPillClass(audit.timing)}>{audit.timing}</span></div>
              <div className={`cell ${audit.projectedRunsSaved == null ? "awaiting" : ""}`} data-label="Runs Saved">{formatRuns(audit.projectedRunsSaved)}</div>
              <div className="cell audit-note" data-label="Outcome">{audit.note || "No note recorded."}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function teamMatchesCandidate(team: Team, candidate: TripleAConversionCandidate): boolean {
  const parent = candidate.parentClub.toLowerCase();
  return parent.includes(team.abbr.toLowerCase()) || parent.includes(team.club.toLowerCase()) || parent.includes(team.name.toLowerCase());
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

export default function App() {
  const [selectedTeamAbbr, setSelectedTeamAbbr] = useState("ATL");
  const [activeModule, setActiveModule] = useState<ActiveModule>("overview");
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);

  const selectedTeam = MLB_TEAMS.find((team) => team.abbr === selectedTeamAbbr) ?? MLB_TEAMS[0];
  const { loadState, payload, error, reload } = useRunSavingBoard({ league: "mlb", team: selectedTeam.abbr, limit: 40 });
  const { payload: tripleAPayload, reload: reloadTripleA } = useRunSavingBoard({ league: "triple_a", limit: 80 });
  const apiBase = getConfiguredApiBase();

  const decisions = payload?.decisions ?? [];
  const bullpenOptions = payload?.bullpenOptions ?? [];
  const audits = payload?.audits ?? [];
  const tripleA = tripleAPayload?.tripleAConversionCandidates ?? payload?.tripleAConversionCandidates ?? [];

  useEffect(() => {
    if (decisions.length === 0) {
      setSelectedDecisionId(null);
      return;
    }
    if (!selectedDecisionId || !decisions.some((decision) => decision.id === selectedDecisionId)) {
      setSelectedDecisionId(decisions[0].id);
    }
  }, [decisions, selectedDecisionId]);

  const renderModule = () => {
    if (!payload) return null;
    switch (activeModule) {
      case "overview":
        return <OverviewModule team={selectedTeam} payload={payload} decisions={decisions} bullpenOptions={bullpenOptions} audits={audits} />;
      case "replay":
        return <ReplayModule decisions={decisions} selectedId={selectedDecisionId} onSelect={setSelectedDecisionId} />;
      case "pitchers":
        return <PitchersModule decisions={decisions} />;
      case "bullpen":
        return <BullpenModule options={bullpenOptions} />;
      case "matrix":
        return <MatrixModule decisions={decisions} bullpenOptions={bullpenOptions} />;
      case "audit":
        return <AuditModule audits={audits} />;
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
