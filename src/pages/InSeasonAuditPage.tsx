import { useEffect, useState } from "react";
import type { Team } from "../lib/constants";
import { UNAVAILABLE } from "../lib/constants";
import { PageHeader } from "../components/PageHeader";
import { MetricCard } from "../components/MetricCard";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { GaugeBar } from "../components/GaugeBar";
import {
  fetchPitchingAuditSummary,
  fetchPitcherProfiles,
  fetchPreventableRunsOpportunities,
} from "../api";
import type {
  PitchingAuditSummaryPayload,
  PitchingAuditWindow,
  PitcherProfile,
  PreventableRunsOpportunitiesPayload,
} from "../types";
import { auditWindows, matrixCellForWindow, record, num } from "../lib/helpers";
import { fmtNumber, fmtPct, statusLabel, halfInningLabel, avg } from "../lib/format";
import { navigate } from "../lib/router";

type MatrixBucket = "Standard" | "Tandem" | "Push" | "Workload";

export function InSeasonAuditPage({ team }: { team: Team }) {
  const [audit, setAudit] = useState<PitchingAuditSummaryPayload | null>(null);
  const [profiles, setProfiles] = useState<PitcherProfile[]>([]);
  const [opportunities, setOpportunities] = useState<PreventableRunsOpportunitiesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchPitchingAuditSummary({ team: team.abbr, limit: 500 }).catch(() => null),
      fetchPitcherProfiles({ team: team.abbr }).catch(() => ({ summary: { generatedAt: null, league: "mlb" as const, profileCount: 0, gameCount: 0 }, profiles: [] })),
      fetchPreventableRunsOpportunities({ team: team.abbr, limit: 200 }).catch(() => null),
    ]).then(([auditData, profileData, oppData]) => {
      setAudit(auditData);
      setProfiles(profileData.profiles);
      setOpportunities(oppData);
      setLoading(false);
      if (!auditData && !oppData) setError("Unable to load audit data for this club.");
    });
  }, [team.abbr]);

  const windows = auditWindows(audit);
  const matrixCounts: Record<MatrixBucket, number> = { Standard: 0, Tandem: 0, Push: 0, Workload: 0 };
  for (const w of windows) {
    matrixCounts[matrixCellForWindow(w)]++;
  }

  const missedHooks = audit?.missed_hook_windows ?? [];
  const totalPreventable = opportunities?.summary?.totalProjectedPreventableRuns ?? null;
  const damageRate = opportunities?.summary?.damageRate ?? null;

  if (loading) {
    return (
      <div className="audit-page">
        <PageHeader eyebrow="IN-SEASON AUDIT" title={`${team.name}`} subtitle="Loading audit intelligence..." />
        <div className="loading-shimmer" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="audit-page">
        <PageHeader eyebrow="IN-SEASON AUDIT" title={team.name} />
        <EmptyState title="Audit unavailable" detail={error} />
      </div>
    );
  }

  return (
    <div className="audit-page">
      <PageHeader
        eyebrow="IN-SEASON AUDIT"
        title={team.name}
        subtitle="Staff deployment intelligence and missed-hook analysis"
      />

      <section className="audit-kpis">
        <MetricCard
          eyebrow="PREVENTABLE RUNS"
          value={totalPreventable != null ? fmtNumber(totalPreventable, 1) : UNAVAILABLE}
          label="Projected runs preventable this season"
          accent="red"
        />
        <MetricCard
          eyebrow="DAMAGE RATE"
          value={damageRate != null ? fmtPct(damageRate) : UNAVAILABLE}
          label="Windows resulting in damage"
          accent="gold"
        />
        <MetricCard
          eyebrow="AUDIT WINDOWS"
          value={String(windows.length)}
          label="Decision points evaluated"
          accent="navy"
        />
        <MetricCard
          eyebrow="MISSED HOOKS"
          value={String(missedHooks.length)}
          label="Late pulls where damage occurred"
          accent="red"
        />
      </section>

      <section className="audit-matrix">
        <h2 className="section-title">Deployment Matrix</h2>
        <p className="section-desc">Pitcher quality vs. bullpen quality across decision windows</p>
        <div className="matrix-grid">
          {(["Standard", "Tandem", "Push", "Workload"] as MatrixBucket[]).map((bucket) => (
            <div key={bucket} className={`matrix-cell matrix-cell--${bucket.toLowerCase()}`}>
              <strong className="matrix-cell__count">{matrixCounts[bucket]}</strong>
              <span className="matrix-cell__label">{bucket}</span>
              <p className="matrix-cell__desc">
                {bucket === "Standard" && "Strong starter, strong pen options"}
                {bucket === "Tandem" && "Declining starter, relief available"}
                {bucket === "Push" && "Adequate starter, thin bullpen"}
                {bucket === "Workload" && "Both sides depleted"}
              </p>
            </div>
          ))}
        </div>
      </section>

      {profiles.length > 0 && (
        <section className="audit-profiles">
          <h2 className="section-title">Pitcher Inning Profiles</h2>
          <p className="section-desc">Average stuff grade decline by pitcher</p>
          <div className="profile-table">
            <div className="profile-table__header">
              <span>Pitcher</span>
              <span>Games</span>
              <span>Avg Decline</span>
              <span>Max Decline</span>
              <span>Pull Now Games</span>
            </div>
            {profiles.slice(0, 15).map((p) => (
              <div key={p.pitcher} className="profile-table__row">
                <span className="profile-table__name">{p.pitcher}</span>
                <span>{p.appearances}</span>
                <span>{fmtNumber(p.avgDegradation, 2)}</span>
                <span>{fmtNumber(p.maxDegradation, 2)}</span>
                <span className={p.pullNowGames > 0 ? "text-red" : ""}>{p.pullNowGames}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {missedHooks.length > 0 && (
        <section className="audit-missed-hooks">
          <h2 className="section-title">Missed Hooks</h2>
          <p className="section-desc">Windows where the starter was held too long and damage followed</p>
          <div className="missed-hooks-list">
            {missedHooks.slice(0, 20).map((w, i) => {
              const rec = record(w.recommendation);
              const starter = record(w.starter);
              return (
                <div key={i} className="missed-hook-card">
                  <div className="missed-hook-card__header">
                    <span className="missed-hook-card__matchup">{w.matchup ?? `${w.team ?? ""} game`}</span>
                    <StatusBadge status={w.status} size="sm" />
                  </div>
                  <div className="missed-hook-card__body">
                    <span>{w.pitcher_name ?? w.pitcher ?? "Pitcher"}</span>
                    <span>{w.inning != null ? halfInningLabel(w.half ?? null, Number(w.inning)) : "Inning unavailable"}</span>
                    <span>LI {fmtNumber(w.leverage_index, 1)}</span>
                  </div>
                  <div className="missed-hook-card__footer">
                    <GaugeBar
                      label="Projected preventable"
                      value={fmtNumber(w.projected_runs_saved ?? w.estimated_runs_saved, 2)}
                      percent={Math.min(1, Math.abs(num(w.projected_runs_saved ?? w.estimated_runs_saved) ?? 0) / 2)}
                      tone="bad"
                    />
                  </div>
                  {w.game_id && (
                    <button
                      className="missed-hook-card__link"
                      onClick={() => navigate({ page: "game", gameId: String(w.game_id ?? w.game_pk ?? ""), team: team.abbr })}
                    >
                      View game replay
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {opportunities && opportunities.pitcherSummaries.length > 0 && (
        <section className="audit-opportunities">
          <h2 className="section-title">Opportunity Leaderboard</h2>
          <p className="section-desc">Pitchers with the most projected preventable runs</p>
          <div className="profile-table">
            <div className="profile-table__header">
              <span>Pitcher</span>
              <span>Windows</span>
              <span>Total Preventable</span>
              <span>Avg per Window</span>
              <span>Damage Rate</span>
            </div>
            {opportunities.pitcherSummaries.slice(0, 12).map((ps) => (
              <div key={ps.pitcherName} className="profile-table__row">
                <span className="profile-table__name">{ps.pitcherName}</span>
                <span>{ps.windowCount}</span>
                <span className="text-red">{fmtNumber(ps.totalProjectedPreventableRuns, 2)}</span>
                <span>{fmtNumber(ps.avgProjectedPreventableRuns, 3)}</span>
                <span>{ps.damageRate != null ? fmtPct(ps.damageRate) : UNAVAILABLE}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
