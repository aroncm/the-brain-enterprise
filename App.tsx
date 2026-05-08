import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Fingerprint,
  Gauge,
  Gem,
  RefreshCcw,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import { ApiConfigurationError, fetchRunSavingBoard, getConfiguredApiBase } from "./api";
import type {
  AuditRow,
  BullpenOption,
  PitcherDecision,
  RunSavingBoardPayload,
  TripleAConversionCandidate,
} from "./types";

type LoadState = "loading" | "ready" | "error" | "missing-config";

function formatRuns(value: number | null | undefined): string {
  if (value == null) return "Pending";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function formatScore(value: number | null | undefined, digits = 2): string {
  if (value == null) return "Pending";
  return value.toFixed(digits);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "Pending";
  return `${Math.round(value * 100)}%`;
}

function formatMoney(value: number | null | undefined): string {
  if (value == null) return "Pending";
  if (value <= 0) return "$0";
  return `$${Math.round(value / 1000)}k`;
}

function normalizeReason(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "standard",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "standard" | "gold" | "blue" | "green";
}) {
  return (
    <section className={`metric-card metric-card--${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </section>
  );
}

function MiniCurve({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <EmptyState title="Trajectory pending" detail="The API returned no inning or pitch-window curve for this pitcher yet." />;
  }

  const width = 240;
  const height = 88;
  const max = 100;
  const min = 45;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - ((value - min) / (max - min)) * height;
      return `${x},${Math.max(4, Math.min(height - 4, y))}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mini-curve" role="img" aria-label="Stuff Score curve">
      <path d="M0 76 H240" />
      <path d="M0 44 H240" />
      <polyline points={points} />
      {values.map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width;
        const y = height - ((value - min) / (max - min)) * height;
        return <circle key={`${value}-${index}`} cx={x} cy={Math.max(4, Math.min(height - 4, y))} r="4" />;
      })}
    </svg>
  );
}

function DecisionRow({ decision }: { decision: PitcherDecision }) {
  const positive = (decision.projectedRunsSaved ?? 0) > 0;
  return (
    <article className="decision-row">
      <div className="pitcher-id">
        <div className="fingerprint-mark">
          <Fingerprint size={24} />
        </div>
        <div>
          <p className="eyebrow">{decision.team} vs {decision.opponent} - {decision.inning}</p>
          <h3>{decision.pitcher}</h3>
          <span>{decision.role} - {decision.batterPocket || "Pocket data pending"}</span>
        </div>
      </div>

      <div className="trajectory-pill">
        <span>{decision.trajectoryLabel}</span>
        <strong>{decision.trajectoryIndex == null ? "Pending" : `${decision.trajectoryIndex > 0 ? "+" : ""}${decision.trajectoryIndex}`}</strong>
        <small>{formatPercent(decision.trajectoryConfidence)} confidence</small>
      </div>

      <div className="runs-saved">
        <span>Projected runs saved</span>
        <strong className={positive ? "positive" : ""}>{formatRuns(decision.projectedRunsSaved)}</strong>
        <small>{decision.calibrationStatus}</small>
      </div>

      <div className="recommendation">
        <strong>{decision.recommendation}</strong>
        <p>{decision.recommendationReason}</p>
        {decision.topReasons.length > 0 && (
          <div className="reason-list">
            {decision.topReasons.slice(0, 4).map((reason) => (
              <span key={reason}>{normalizeReason(reason)}</span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function DecayPanel({ decision }: { decision: PitcherDecision | null }) {
  if (!decision) {
    return (
      <section className="panel decay-panel">
        <EmptyState title="No pitcher trajectory selected" detail="The board has not returned a real pitcher decision yet." />
      </section>
    );
  }

  return (
    <section className="panel decay-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Dynamic Decay</p>
          <h2>{decision.pitcher} trajectory</h2>
        </div>
        <span className="status-chip">{decision.trajectoryLabel}</span>
      </div>
      <MiniCurve values={decision.stuffCurve} />
      <div className="decay-grid">
        <div>
          <span>Decay velocity</span>
          <strong>{formatScore(decision.decayVelocity, 1)}</strong>
        </div>
        <div>
          <span>Decay acceleration</span>
          <strong>{formatScore(decision.decayAcceleration, 1)}</strong>
        </div>
        <div>
          <span>Recovery index</span>
          <strong>{formatPercent(decision.recoveryIndex)}</strong>
        </div>
        <div>
          <span>Cliff probability</span>
          <strong>{formatPercent(decision.cliffProbability)}</strong>
        </div>
      </div>
    </section>
  );
}

function BullpenBoard({ options }: { options: BullpenOption[] }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Bullpen Alternative Board</p>
          <h2>Best available relief options</h2>
        </div>
        <span className="status-chip status-chip--blue">Availability aware</span>
      </div>
      {options.length === 0 ? (
        <EmptyState
          title="No bullpen alternatives returned"
          detail="The backend has not returned real candidate data for the selected decision window."
        />
      ) : (
        <div className="bullpen-list">
          {options.map((option) => (
            <div className="bullpen-row" key={option.id}>
              <div>
                <strong>{option.name}</strong>
                <span>{option.role} - {option.availability}</span>
              </div>
              <div>
                <span>RSS</span>
                <strong>{formatScore(option.rss)}</strong>
              </div>
              <div>
                <span>Matchup fit</span>
                <strong>{formatPercent(option.matchupFit)}</strong>
              </div>
              <div>
                <span>Usage cost</span>
                <strong>{formatScore(option.usageCost)}</strong>
              </div>
              <div>
                <span>Net option</span>
                <strong>{formatScore(option.netOptionScore)}</strong>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AuditTable({ audits }: { audits: AuditRow[] }) {
  return (
    <section className="panel audit-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Postgame Audit</p>
          <h2>Decision quality after the game</h2>
        </div>
      </div>
      {audits.length === 0 ? (
        <EmptyState title="No postgame audit rows returned" detail="Run pitching artifact refresh to populate real audit cases." />
      ) : (
        <div className="audit-list">
          {audits.map((row) => (
            <div className="audit-row" key={row.id}>
              <div>
                <strong>{row.game}</strong>
                <span>{row.decision}</span>
              </div>
              <span className="status-chip">{row.timing}</span>
              <strong className={(row.projectedRunsSaved ?? 0) >= 0 ? "positive" : "negative"}>
                {formatRuns(row.projectedRunsSaved)}
              </strong>
              <p>{row.note}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TripleACandidateRow({ candidate }: { candidate: TripleAConversionCandidate }) {
  return (
    <article className="triple-a-row">
      <div className="pitcher-id">
        <div className="fingerprint-mark">
          <Gem size={22} />
        </div>
        <div>
          <p className="eyebrow">{candidate.affiliate} - {candidate.parentClub} affiliate</p>
          <h3>{candidate.pitcher}</h3>
          <span>{candidate.currentRole} to {candidate.recommendedRole}</span>
        </div>
      </div>
      <div>
        <span>Short-window stuff</span>
        <strong>{candidate.shortWindowStuffPlus}</strong>
      </div>
      <div>
        <span>Decay after window</span>
        <strong>{candidate.secondWindowDecay}</strong>
      </div>
      <div>
        <span>Conversion score</span>
        <strong>{candidate.reliefConversionScore}</strong>
      </div>
      <div>
        <span>Runs saved</span>
        <strong className={candidate.projectedRunsSaved > 0 ? "positive" : "negative"}>
          {formatRuns(candidate.projectedRunsSaved)}
        </strong>
      </div>
      <div>
        <span>Confidence</span>
        <strong>{formatPercent(candidate.confidence)}</strong>
      </div>
      <div>
        <span>Mirage risk</span>
        <strong className={candidate.mirageRisk >= 0.5 ? "negative" : ""}>
          {formatPercent(candidate.mirageRisk)}
        </strong>
      </div>
      <p>{candidate.note}</p>
    </article>
  );
}

function TripleAConversionBoard({ candidates }: { candidates: TripleAConversionCandidate[] }) {
  return (
    <section className="panel triple-a-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Triple-A Diamonds in the Rough</p>
          <h2>Short-window MLB relief conversion candidates</h2>
        </div>
        <span className="status-chip status-chip--blue">Translation layer pending</span>
      </div>
      <p className="panel-copy">
        This board is reserved for real Triple-A to MLB short-window translation candidates. It intentionally
        renders empty until the backend produces sample-adjusted conversion scores.
      </p>
      {candidates.length === 0 ? (
        <EmptyState
          title="No conversion candidates returned"
          detail="The Triple-A conversion endpoint is not populated yet. No sample players are wired into this frontend."
        />
      ) : (
        <div className="triple-a-list">
          {candidates.map((candidate) => (
            <TripleACandidateRow key={candidate.id} candidate={candidate} />
          ))}
        </div>
      )}
    </section>
  );
}

function useRunSavingBoard() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [payload, setPayload] = useState<RunSavingBoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoadState("loading");
    setError(null);
    try {
      const data = await fetchRunSavingBoard("mlb");
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
  }

  useEffect(() => {
    void load();
  }, []);

  return { loadState, payload, error, reload: load };
}

export default function App() {
  const { loadState, payload, error, reload } = useRunSavingBoard();
  const decisions = payload?.decisions ?? [];
  const topDecision = decisions[0] ?? null;
  const calibratedRuns = decisions
    .map((decision) => decision.projectedRunsSaved)
    .filter((value): value is number => typeof value === "number");
  const totalRunsSaved = calibratedRuns.reduce((sum, value) => sum + Math.max(0, value), 0);
  const highConfidence = decisions.filter((decision) => (decision.trajectoryConfidence ?? 0) >= 0.75).length;
  const apiBase = getConfiguredApiBase();

  return (
    <main className="app-shell">
      <header className="hero">
        <nav>
          <div className="brand-mark">BB</div>
          <div>
            <p className="eyebrow">Baseball brAIn Enterprise</p>
            <h1>Run Saving Tool</h1>
          </div>
          <span className="confidential">Confidential club workspace</span>
        </nav>

        <section className="hero-grid">
          <div>
            <p className="eyebrow">Pitcher Allocation Intelligence</p>
            <h2>Every pitcher decision normalized to runs saved.</h2>
            <p className="hero-copy">
              A front-office surface for dynamic pitcher decay, bullpen alternatives, and postgame evidence.
              This build is API-first: no dummy records are rendered, and uncalibrated Runs Saved fields stay
              marked as pending.
            </p>
          </div>
          <div className="hero-card">
            <ShieldCheck size={32} />
            <p>Highest-value real decision returned</p>
            <strong>{topDecision?.pitcher ?? "Pending data"}</strong>
            <span>{topDecision ? `${formatRuns(topDecision.projectedRunsSaved)} projected runs saved` : "Connect the enterprise API to populate"}</span>
          </div>
        </section>
      </header>

      <section className="meta-strip">
        <div>
          <span>API</span>
          <strong>{apiBase || "Not configured"}</strong>
        </div>
        <div>
          <span>Generated</span>
          <strong>{payload?.summary.generatedAt ?? "Pending"}</strong>
        </div>
        <div>
          <span>Calibration</span>
          <strong>{payload?.summary.calibrationStatus ?? "Pending"}</strong>
        </div>
        <button className="control-button" type="button" onClick={() => void reload()}>
          <RefreshCcw size={16} />
          Refresh
        </button>
      </section>

      {loadState === "missing-config" && (
        <section className="panel config-panel">
          <EmptyState
            title="API base URL required"
            detail="Set VITE_BASEBALL_BRAIN_API_BASE in Bolt or local .env to preview real backend data. No fallback sample data is wired."
          />
        </section>
      )}

      {loadState === "error" && (
        <section className="panel config-panel">
          <EmptyState title="Enterprise API request failed" detail={error ?? "Unknown API error."} />
        </section>
      )}

      {loadState === "loading" && (
        <section className="panel config-panel">
          <EmptyState title="Loading real enterprise data" detail="Requesting /v1/enterprise/run-saving/board from the configured backend." />
        </section>
      )}

      <section className="metrics-grid">
        <MetricCard
          label="Projected Runs Saved"
          value={calibratedRuns.length > 0 ? formatRuns(totalRunsSaved) : "Pending"}
          detail={calibratedRuns.length > 0 ? "Calibrated positive opportunities on today's board" : "Runs Saved calibration layer not populated yet"}
          tone="gold"
        />
        <MetricCard
          label="Allocation Windows"
          value={String(decisions.length)}
          detail="Real pitcher decision rows returned by API"
          tone="blue"
        />
        <MetricCard
          label="High Confidence"
          value={String(highConfidence)}
          detail="Trajectory reads above 75%"
          tone="green"
        />
        <MetricCard
          label="Optional Dollar View"
          value={formatMoney(null)}
          detail="Disabled until club-specific value per run is configured"
        />
      </section>

      <section className="board-layout">
        <section className="panel board-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Run Saving Board</p>
              <h2>Pitcher allocation opportunities</h2>
            </div>
            <div className="legend">
              <span><ArrowUpRight size={14} /> Saves runs</span>
              <span><ArrowDownRight size={14} /> Hold preferred</span>
            </div>
          </div>
          {decisions.length === 0 ? (
            <EmptyState
              title="No decision rows returned"
              detail="The frontend has no dummy records. Populate /v1/enterprise/run-saving/board to render this board."
            />
          ) : (
            <div className="decision-list">
              {decisions.map((decision) => <DecisionRow key={decision.id} decision={decision} />)}
            </div>
          )}
        </section>

        <aside className="side-stack">
          <DecayPanel decision={topDecision} />
          <section className="panel principle-panel">
            <div className="principle-icon"><Gauge size={20} /></div>
            <p className="eyebrow">Model Principle</p>
            <h2>Detect decay, then solve allocation</h2>
            <p>
              The enterprise recommendation should combine degradation state, trajectory forecast,
              available bullpen alternatives, and rest-of-game bullpen cost before assigning Runs Saved.
            </p>
            <div className="principle-row">
              <Activity size={16} />
              <span>Decay velocity and acceleration</span>
            </div>
            <div className="principle-row">
              <TimerReset size={16} />
              <span>Recovery index and cliff probability</span>
            </div>
            <div className="principle-row">
              <BadgeDollarSign size={16} />
              <span>Dollar view remains optional</span>
            </div>
          </section>
        </aside>
      </section>

      <section className="lower-grid">
        <BullpenBoard options={payload?.bullpenOptions ?? []} />
        <AuditTable audits={payload?.audits ?? []} />
      </section>

      <TripleAConversionBoard candidates={payload?.tripleAConversionCandidates ?? []} />
    </main>
  );
}
