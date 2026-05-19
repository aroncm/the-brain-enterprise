import { useEffect, useState, useMemo } from "react";
import type { Team } from "../lib/constants";
import { UNAVAILABLE } from "../lib/constants";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { GaugeBar } from "../components/GaugeBar";
import { EmptyState } from "../components/EmptyState";
import { TeamLogo } from "../components/TeamLogo";
import { MetricCard } from "../components/MetricCard";
import {
  fetchEnterpriseGames,
  fetchPitchingReplay,
  fetchPreventableRunsOpportunities,
} from "../api";
import type {
  EnterpriseGameSummary,
  PitchingReplayResponse,
  PitchingReplayEntry,
  PreventableRunsOpportunityRow,
} from "../types";
import {
  pitchCount,
  stuffScore,
  velocityDrop,
  monotonicStatuses,
  signalClass,
  opportunityForPitch,
  preventableRunsForPitch,
  scaledPercent,
  baseStateFlags,
} from "../lib/helpers";
import {
  fmtNumber,
  fmtSigned,
  fmtPct,
  statusLabel,
  statusRank,
  halfInningLabel,
  baseStateLabel,
  outsLabel,
  featureLabel,
  clamp,
  formatDateText,
} from "../lib/format";

export function GameAuditPage({ team, initialGameId }: { team: Team; initialGameId?: string }) {
  const [games, setGames] = useState<EnterpriseGameSummary[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>(initialGameId || "");
  const [replay, setReplay] = useState<PitchingReplayResponse | null>(null);
  const [opportunities, setOpportunities] = useState<PreventableRunsOpportunityRow[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [gamesLoading, setGamesLoading] = useState(true);

  useEffect(() => {
    setGamesLoading(true);
    fetchEnterpriseGames({ team: team.abbr, limit: 30 })
      .then((payload) => setGames(payload.games))
      .catch(() => setGames([]))
      .finally(() => setGamesLoading(false));
  }, [team.abbr]);

  useEffect(() => {
    if (!selectedGameId) {
      setReplay(null);
      return;
    }
    setLoading(true);
    Promise.all([
      fetchPitchingReplay(selectedGameId).catch(() => null),
      fetchPreventableRunsOpportunities({ gameId: selectedGameId }).then((p) => p.rows).catch(() => []),
    ]).then(([replayData, oppRows]) => {
      setReplay(replayData);
      setOpportunities(oppRows);
      setSelectedIdx(0);
      setLoading(false);
    });
  }, [selectedGameId]);

  const statuses = useMemo(() => (replay ? monotonicStatuses(replay.entries) : []), [replay]);
  const entries = replay?.entries ?? [];
  const selected = entries[selectedIdx] ?? null;
  const displayStatus = statuses[selectedIdx] ?? "STAY";
  const opportunity = useMemo(
    () => opportunityForPitch(selected, opportunities, selectedGameId),
    [selected, opportunities, selectedGameId],
  );
  const preventable = preventableRunsForPitch(selected, opportunity);

  if (!selectedGameId && !gamesLoading && games.length === 0) {
    return (
      <div className="game-page">
        <PageHeader eyebrow="GAME AUDIT" title={team.name} subtitle="Pitch-by-pitch replay" />
        <EmptyState title="No games available" detail="No recent games found for this club." />
      </div>
    );
  }

  return (
    <div className="game-page">
      <PageHeader
        eyebrow="GAME AUDIT"
        title={replay ? `${replay.game.away_team} @ ${replay.game.home_team}` : team.name}
        subtitle={replay ? formatDateText(replay.game.date) : "Select a game to review"}
        actions={
          <select
            className="game-selector"
            value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
          >
            <option value="">Select game...</option>
            {games.map((g) => (
              <option key={g.game_id} value={g.game_id}>
                {g.away_team} @ {g.home_team} — {g.date}
              </option>
            ))}
          </select>
        }
      />

      {loading && <div className="loading-shimmer" />}

      {!loading && replay && entries.length > 0 && (
        <>
          <section className="game-summary-strip">
            <MetricCard eyebrow="PITCHES" value={String(entries.length)} label="Windows tracked" accent="navy" />
            <MetricCard eyebrow="STAY" value={String(replay.summary.stay_count)} label="Hold calls" accent="green" />
            <MetricCard eyebrow="WATCH" value={String(replay.summary.watch_count)} label="Watch signals" accent="gold" />
            <MetricCard eyebrow="PREP/PULL" value={String(replay.summary.prep_count + replay.summary.pull_now_count)} label="Action signals" accent="red" />
          </section>

          <section className="game-timeline">
            <div className="timeline-strip">
              {entries.map((entry, idx) => {
                const st = statuses[idx];
                return (
                  <button
                    key={idx}
                    className={`timeline-dot timeline-dot--${signalClass(st)} ${idx === selectedIdx ? "timeline-dot--active" : ""}`}
                    onClick={() => setSelectedIdx(idx)}
                    title={`Pitch ${pitchCount(entry)} — ${statusLabel(st)}`}
                  />
                );
              })}
            </div>
            <div className="timeline-labels">
              <span>Pitch 1</span>
              <span>Pitch {pitchCount(entries[entries.length - 1])}</span>
            </div>
          </section>

          {selected && (
            <section className="game-detail">
              <div className="game-detail__situation">
                <h3>Situation</h3>
                <div className="situation-facts">
                  <span className="situation-pitcher">{selected.snapshot.pitcher_name}</span>
                  <span>{halfInningLabel(selected.snapshot.half, selected.snapshot.inning)}</span>
                  <span>{outsLabel(selected.snapshot.outs)}</span>
                  <span>{baseStateLabel(selected.snapshot.base_state)}</span>
                  <span>Pitch #{pitchCount(selected)}</span>
                  <span>
                    {selected.snapshot.away_score ?? "—"}-{selected.snapshot.home_score ?? "—"}
                  </span>
                </div>
                <Diamond baseState={selected.snapshot.base_state} />
              </div>

              <div className="game-detail__model">
                <h3>Model Reading</h3>
                <div className="model-status-row">
                  <StatusBadge status={displayStatus} />
                  <span className="model-confidence">
                    {fmtPct(selected.recommendation.confidence)} confidence
                  </span>
                </div>
                <div className="model-gauges">
                  <GaugeBar
                    label="Stuff Grade"
                    value={`${stuffScore(selected)}/100`}
                    percent={stuffScore(selected) / 100}
                    tone={stuffScore(selected) >= 65 ? "good" : stuffScore(selected) >= 45 ? "warn" : "bad"}
                  />
                  <GaugeBar
                    label="Velocity Drop"
                    value={velocityDrop(selected) != null ? `${fmtSigned(velocityDrop(selected), 1)} mph` : UNAVAILABLE}
                    percent={velocityDrop(selected) != null ? clamp(Math.abs(velocityDrop(selected)!) / 4) : 0}
                    tone={velocityDrop(selected) != null && velocityDrop(selected)! < -1.5 ? "bad" : "neutral"}
                  />
                  <GaugeBar
                    label="Degradation"
                    value={fmtNumber(selected.snapshot.starter_state.degradation_score, 2)}
                    percent={scaledPercent(selected.snapshot.starter_state.degradation_score, 4)}
                    tone={
                      (selected.snapshot.starter_state.degradation_score ?? 0) > 2
                        ? "bad"
                        : (selected.snapshot.starter_state.degradation_score ?? 0) > 1
                          ? "warn"
                          : "good"
                    }
                  />
                  <GaugeBar
                    label="Leverage"
                    value={fmtNumber(selected.snapshot.leverage_index, 2)}
                    percent={scaledPercent(selected.snapshot.leverage_index, 4)}
                    tone={
                      (selected.snapshot.leverage_index ?? 0) > 2
                        ? "gold"
                        : "neutral"
                    }
                  />
                </div>
              </div>

              <div className="game-detail__recommendation">
                <h3>Recommendation</h3>
                {selected.recommendation.top_reason_codes.length > 0 && (
                  <ul className="reason-list">
                    {selected.recommendation.top_reason_codes.map((code, i) => (
                      <li key={i}>{featureLabel(code)}</li>
                    ))}
                  </ul>
                )}
                {selected.top_candidates && selected.top_candidates.length > 0 && (
                  <div className="reliever-alt">
                    <span className="reliever-alt__label">Best alternative</span>
                    <strong>{selected.top_candidates[0].player_name}</strong>
                    <span className="reliever-alt__role">{selected.top_candidates[0].bullpen_role}</span>
                    <span className="reliever-alt__score">
                      Matchup: {fmtNumber(selected.top_candidates[0].direct_matchup_fit, 2)}
                    </span>
                  </div>
                )}
                {preventable != null && (
                  <div className="preventable-callout">
                    <span className="preventable-callout__label">Projected Preventable Runs</span>
                    <strong className="preventable-callout__value">{fmtNumber(preventable, 3)}</strong>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {!loading && replay && entries.length === 0 && (
        <EmptyState title="No pitch data" detail="This game has no tracked pitch windows." />
      )}

      {!loading && !replay && selectedGameId && (
        <EmptyState title="Replay unavailable" detail="Could not load replay data for this game." />
      )}
    </div>
  );
}

function Diamond({ baseState }: { baseState: string | null | undefined }) {
  const flags = baseStateFlags(baseState);
  return (
    <svg className="diamond-svg" viewBox="0 0 60 60" width={64} height={64}>
      <polygon points="30,8 52,30 30,52 8,30" fill="none" stroke="var(--navy)" strokeWidth="1.5" opacity="0.3" />
      <circle cx="30" cy="52" r="4" fill="var(--navy)" opacity="0.6" />
      <circle cx="52" cy="30" r="4" fill={flags.first ? "var(--gold)" : "var(--paper-2)"} stroke="var(--navy)" strokeWidth="1" />
      <circle cx="30" cy="8" r="4" fill={flags.second ? "var(--gold)" : "var(--paper-2)"} stroke="var(--navy)" strokeWidth="1" />
      <circle cx="8" cy="30" r="4" fill={flags.third ? "var(--gold)" : "var(--paper-2)"} stroke="var(--navy)" strokeWidth="1" />
    </svg>
  );
}
