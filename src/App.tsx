import { useEffect, useMemo, useState } from "react";
import { ApiConfigurationError, fetchRunSavingBoard, getConfiguredApiBase } from "./api";
import type {
  AuditRow,
  BullpenOption,
  PitcherDecision,
  RunSavingBoardPayload,
  TripleAConversionCandidate,
} from "./types";

type LoadState = "loading" | "ready" | "error" | "missing-config";

const AWAITING = "Awaiting calibrated value";

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

function FingerprintMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 52 52"
      fill="none"
      aria-hidden="true"
    >
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

function AwaitingValue() {
  return <span className="value value--awaiting">Awaiting calibrated value</span>;
}

function RunsValue({ value }: { value: number | null }) {
  if (value == null) return <AwaitingValue />;
  const sign = value > 0 ? "+" : "";
  const cls = value > 0 ? "positive" : value < 0 ? "negative" : "";
  return <span className={`value ${cls}`}>{`${sign}${value.toFixed(2)}`}</span>;
}

/* ============ Executive Header ============ */

function ExecutiveHeader({
  summary,
  loadState,
  apiBase,
  onRefresh,
}: {
  summary: RunSavingBoardPayload["summary"] | undefined;
  loadState: LoadState;
  apiBase: string;
  onRefresh: () => void;
}) {
  const readiness = (() => {
    if (loadState === "missing-config") {
      return { dot: "readiness-dot--red", label: "Data source not connected" };
    }
    if (loadState === "error") {
      return { dot: "readiness-dot--red", label: "Data source unavailable" };
    }
    if (loadState === "loading") {
      return { dot: "readiness-dot--amber", label: "Loading briefing" };
    }
    const decisions = summary?.decisionCount ?? 0;
    if (decisions === 0) {
      return { dot: "readiness-dot--amber", label: "Awaiting calibrated slate" };
    }
    return { dot: "", label: "Data ready" };
  })();

  return (
    <header className="executive-header">
      <div className="masthead">
        <p className="eyebrow">Baseball brAIn &nbsp;&middot;&nbsp; Professional Operational Intelligence</p>
        <h1>
          Run Saving <span className="accent">Tool.</span>
        </h1>
        <p className="subtitle">
          Pitcher allocation intelligence for run prevention — every starter hook, every relief alternative,
          every postgame decision, evaluated for the club.
        </p>
        <span className="subtitle-rule" />
      </div>

      <div className="header-side">
        <FingerprintMark className="fingerprint" />
        <span className="readiness-chip">
          <span className={`readiness-dot ${readiness.dot}`} />
          {readiness.label}
        </span>
        <div className="slate-context">
          <span>Today&apos;s slate</span>
          <strong>{formatDate(summary?.generatedAt)}</strong>
          <span>MLB &middot; Front-Office Briefing</span>
        </div>
        <button type="button" className="refresh-action" onClick={onRefresh}>
          Refresh briefing
        </button>
        {apiBase ? null : <span className="mono" style={{ fontSize: 10, color: "var(--muted-soft)" }}>No source configured</span>}
      </div>
    </header>
  );
}

/* ============ Opportunity card ============ */

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

function OpportunityCard({
  decision,
  reliefName,
}: {
  decision: PitcherDecision;
  reliefName: string | null;
}) {
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
          {decision.batterPocket
            ? `Situation: ${decision.batterPocket}.`
            : "Situation detail pending from live feed."}
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
          {decision.recommendationReason && (
            <p className="move-reason">{decision.recommendationReason}</p>
          )}
        </div>
        <div className="opportunity-metrics">
          <div className="metric-cell">
            <span className="label">Projected Runs Saved</span>
            <RunsValue value={decision.projectedRunsSaved} />
          </div>
          <div className="metric-cell">
            <span className="label">Decision Confidence</span>
            <span className="value">{formatPercent(confidence)}</span>
          </div>
          <div className="metric-cell">
            <span className="label">Starter Risk</span>
            <span className="value" style={{ fontSize: 20 }}>
              {starterRisk}
            </span>
          </div>
          <div className="metric-cell">
            <span className="label">Relief Alternative</span>
            <span
              className="value"
              style={{ fontSize: reliefName ? 18 : 13, fontStyle: reliefName ? "normal" : "italic" }}
            >
              {reliefName ?? "Awaiting calibrated value"}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ============ Bullpen panel ============ */

function BullpenPanel({ options }: { options: BullpenOption[] }) {
  return (
    <section className="panel-card">
      <p className="eyebrow eyebrow--navy">Staff Availability</p>
      <h3>Bullpen Availability &amp; Cost</h3>
      <p className="panel-sub">Relief options ranked by matchup fit against today&apos;s usage cost.</p>
      {options.length === 0 ? (
        <EmptyState
          title="No relief options available"
          detail="The enterprise feed has not returned bullpen availability for the current slate."
        />
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
          {options.map((o) => (
            <div className="bullpen-row" key={o.id}>
              <div>
                <div className="name">{o.name}</div>
                <div className="sub">{o.role}</div>
              </div>
              <div className="cell" data-label="Role">
                {o.role}
              </div>
              <div className="cell" data-label="Availability">
                {o.availability}
              </div>
              <div className={`cell ${o.matchupFit == null ? "awaiting" : ""}`} data-label="Matchup Fit">
                {formatPercent(o.matchupFit)}
              </div>
              <div className={`cell ${o.usageCost == null ? "awaiting" : ""}`} data-label="Usage Cost">
                {formatScore(o.usageCost)}
              </div>
              <div className={`cell ${o.netOptionScore == null ? "awaiting" : ""}`} data-label="Net Option">
                {formatScore(o.netOptionScore)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============ Postgame evidence panel ============ */

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

function PostgamePanel({ audits }: { audits: AuditRow[] }) {
  return (
    <section className="panel-card panel-card--cream">
      <p className="eyebrow">Accountability</p>
      <h3>Postgame Decision Evidence</h3>
      <p className="panel-sub">Recent staff moves measured against projected and realized outcomes.</p>
      {audits.length === 0 ? (
        <EmptyState
          title="No postgame evidence yet"
          detail="Completed-game audits will appear here once the evening&apos;s slate is closed."
        />
      ) : (
        <div className="audit-table">
          <div className="audit-head">
            <span>Game</span>
            <span>Decision</span>
            <span>Timing</span>
            <span>Runs Saved</span>
            <span>Outcome Note</span>
          </div>
          {audits.map((a) => (
            <div className="audit-row" key={a.id}>
              <div>
                <div className="game">{a.game}</div>
              </div>
              <div className="cell" style={{ fontWeight: 500 }} data-label="Decision">
                <div className="decision">{a.decision}</div>
              </div>
              <div data-label="Timing">
                <span className={timingPillClass(a.timing)}>{a.timing}</span>
              </div>
              <div className={`cell ${a.projectedRunsSaved == null ? "awaiting" : ""}`} data-label="Runs Saved">
                {formatRuns(a.projectedRunsSaved)}
              </div>
              <div className="cell" style={{ fontFamily: "Newsreader, serif", fontStyle: "italic", fontWeight: 500 }} data-label="Outcome">
                {a.note || "No note recorded."}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============ Model view ============ */

function MiniCurve({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <EmptyState title="No trajectory yet" detail="A pitch-window curve will render once the feed returns inning-level decay values." />;
  }
  const width = 320;
  const height = 120;
  const max = 100;
  const min = 40;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - ((value - min) / (max - min)) * height;
      return `${x},${Math.max(6, Math.min(height - 6, y))}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mini-curve" role="img" aria-label="Stuff trajectory">
      <path className="grid" d={`M0 ${height * 0.25} H${width}`} />
      <path className="grid" d={`M0 ${height * 0.55} H${width}`} />
      <path className="grid" d={`M0 ${height * 0.85} H${width}`} />
      <polyline points={points} />
      {values.map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width;
        const y = height - ((value - min) / (max - min)) * height;
        return <circle key={index} cx={x} cy={Math.max(6, Math.min(height - 6, y))} r="3.5" />;
      })}
    </svg>
  );
}

function ModelView({ decision }: { decision: PitcherDecision | null }) {
  return (
    <section className="model-view">
      <div className="model-chart">
        <p className="eyebrow">Model View</p>
        <h3>{decision ? `${decision.pitcher} — stuff trajectory` : "Stuff trajectory"}</h3>
        <p className="model-sub">
          {decision?.trajectoryLabel && decision.trajectoryLabel !== "Pending"
            ? `Classified: ${decision.trajectoryLabel}.`
            : "The degradation curve will resolve as live data accrues."}
        </p>
        {decision ? (
          <>
            <MiniCurve values={decision.stuffCurve} />
            <div className="model-grid">
              <div>
                <span className="label">Decay Velocity</span>
                <strong>{formatScore(decision.decayVelocity, 1)}</strong>
              </div>
              <div>
                <span className="label">Decay Acceleration</span>
                <strong>{formatScore(decision.decayAcceleration, 1)}</strong>
              </div>
              <div>
                <span className="label">Recovery Index</span>
                <strong>{formatPercent(decision.recoveryIndex)}</strong>
              </div>
              <div>
                <span className="label">Cliff Probability</span>
                <strong>{formatPercent(decision.cliffProbability)}</strong>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title="No calibrated opportunity available for this slate yet"
            detail="Once the first pitcher window populates, the model view will render its trajectory here."
          />
        )}
      </div>

      <aside className="model-principle">
        <p className="eyebrow">Decision Framework</p>
        <h3>Pull decisions are 162-game resource decisions.</h3>
        <p>
          The recommendation combines pitcher degradation state, trajectory forecast, the quality of available
          relief, and the rest-of-game bullpen cost — before assigning expected runs saved.
        </p>
        <p className="principle-note">Stuff Score &middot; Adjusted Leverage &middot; Bullpen Cost</p>
      </aside>
    </section>
  );
}

/* ============ Triple-A secondary ============ */

function TripleAConversion({ candidates }: { candidates: TripleAConversionCandidate[] }) {
  return (
    <section className="secondary-surface">
      <p className="eyebrow eyebrow--muted">Secondary Surface</p>
      <h3>Short-Window Relief Conversion Candidates</h3>
      <p className="panel-sub">Triple-A arms whose profile maps to short-window MLB relief usage.</p>
      {candidates.length === 0 ? (
        <div style={{ marginTop: 18 }}>
          <EmptyState
            title="No Triple-A conversion candidates are available yet."
            detail="This surface will populate after the translation model is calibrated."
          />
        </div>
      ) : (
        <div className="triple-a-list">
          {candidates.map((c) => (
            <div key={c.id} className="triple-a-row">
              <div>
                <strong>{c.pitcher}</strong>
                <div className="cell" style={{ color: "var(--muted)" }}>
                  {c.affiliate} &middot; {c.parentClub}
                </div>
              </div>
              <div className="cell" data-label="Current">
                {c.currentRole} → {c.recommendedRole}
              </div>
              <div className="cell" data-label="Short-window stuff">
                {c.shortWindowStuffPlus}
              </div>
              <div className="cell" data-label="Conversion">
                {c.reliefConversionScore}
              </div>
              <div className="cell" data-label="Runs saved">
                {formatRuns(c.projectedRunsSaved)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============ Hook ============ */

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

/* ============ App ============ */

export default function App() {
  const { loadState, payload, error, reload } = useRunSavingBoard();
  const decisions = payload?.decisions ?? [];
  const bullpenOptions = payload?.bullpenOptions ?? [];
  const audits = payload?.audits ?? [];
  const tripleA = payload?.tripleAConversionCandidates ?? [];
  const apiBase = getConfiguredApiBase();

  const topReliefName = useMemo(() => {
    if (bullpenOptions.length === 0) return null;
    const ranked = [...bullpenOptions].sort((a, b) => {
      const av = a.netOptionScore ?? -Infinity;
      const bv = b.netOptionScore ?? -Infinity;
      return bv - av;
    });
    return ranked[0]?.name ?? null;
  }, [bullpenOptions]);

  const topDecision = decisions[0] ?? null;

  return (
    <main className="app-shell">
      <ExecutiveHeader
        summary={payload?.summary}
        loadState={loadState}
        apiBase={apiBase}
        onRefresh={() => void reload()}
      />

      {loadState === "missing-config" && (
        <section className="state-panel">
          <p className="eyebrow">Connection Required</p>
          <h3>Connect enterprise data source.</h3>
          <p>
            Configure <span className="mono">VITE_BASEBALL_BRAIN_API_BASE</span> to begin surfacing today&apos;s
            run prevention opportunities.
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
          <p className="eyebrow">Preparing Briefing</p>
          <h3>Loading today&apos;s run prevention opportunities.</h3>
          <p>Retrieving the current slate from the enterprise data source.</p>
        </section>
      )}

      {loadState === "ready" && (
        <>
          <section className="opportunities">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Primary Briefing</p>
                <h2>Today&apos;s Run Prevention Opportunities</h2>
                <p className="lede">
                  Pitcher windows where the recommended staff move prevents the most expected runs.
                </p>
              </div>
              <div className="count-pill">
                <span>Opportunities on board</span>
                <strong>{decisions.length.toString().padStart(2, "0")}</strong>
              </div>
            </div>

            {decisions.length === 0 ? (
              <EmptyState
                title="No calibrated opportunity available for this slate yet"
                detail="As pitchers take the mound, calibrated run prevention opportunities will appear here."
              />
            ) : (
              <div className="opportunity-list">
                {decisions.map((d) => (
                  <OpportunityCard key={d.id} decision={d} reliefName={topReliefName} />
                ))}
              </div>
            )}
          </section>

          <ModelView decision={topDecision} />

          <section>
            <div className="section-heading">
              <div>
                <p className="eyebrow eyebrow--navy">Supporting Intelligence</p>
                <h2>Staff cost and decision audit.</h2>
                <p className="lede">
                  Relief availability alongside recent staff-move evidence — the two inputs the room needs
                  before committing to a hook.
                </p>
              </div>
            </div>
            <div className="analytical-grid">
              <BullpenPanel options={bullpenOptions} />
              <PostgamePanel audits={audits} />
            </div>
          </section>

          <TripleAConversion candidates={tripleA} />
        </>
      )}

      <footer className="data-readiness-footer">
        <span className="readiness-field">
          <span>Source</span>
          <strong>{apiBase || "Not configured"}</strong>
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
        <span className="readiness-field">
          <span>Audits</span>
          <strong>{payload?.summary.auditCount ?? 0}</strong>
        </span>
        <span className="confidential">Confidential &middot; Baseball brAIn, Inc.</span>
      </footer>
    </main>
  );
}
