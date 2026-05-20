import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import type { Team } from "../lib/constants";
import { UNAVAILABLE } from "../lib/constants";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { MetricCard } from "../components/MetricCard";
import { StrikeZone } from "../components/StrikeZone";
import { DecisionReadPanel } from "../components/DecisionReadPanel";
import { ModelDetailPanel } from "../components/ModelDetailPanel";
import { BullpenOutcomes } from "../components/BullpenOutcomes";
import { DecisionOutcome } from "../components/DecisionOutcome";
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
  monotonicStatuses,
  signalClass,
  opportunityForPitch,
  preventableRunsForPitch,
  baseStateFlags,
} from "../lib/helpers";
import {
  statusLabel,
  statusRank,
  halfInningLabel,
  baseStateLabel,
  outsLabel,
  formatDateText,
  ordinal,
  pitchName,
} from "../lib/format";

type PitcherGroup = {
  pitcherId: string;
  name: string;
  role: string;
  count: number;
  startIdx: number;
};

function groupByPitcher(entries: PitchingReplayEntry[]): PitcherGroup[] {
  const groups: PitcherGroup[] = [];
  let current: PitcherGroup | null = null;
  for (let i = 0; i < entries.length; i++) {
    const pid = entries[i].snapshot.pitcher_id;
    if (!current || current.pitcherId !== pid) {
      const isFirst = groups.length === 0;
      current = {
        pitcherId: pid,
        name: entries[i].snapshot.pitcher_name,
        role: isFirst ? "Starter" : "Reliever",
        count: 0,
        startIdx: i,
      };
      groups.push(current);
    }
    current.count++;
  }
  return groups;
}

function buildEventNarrative(entry: PitchingReplayEntry, prevEntry: PitchingReplayEntry | null, displayStatus: string): string | null {
  if (!prevEntry) return `${entry.snapshot.pitcher_name} at pitch ${pitchCount(entry)} in the ${halfInningLabel(entry.snapshot.half, entry.snapshot.inning).toLowerCase()}.`;

  const prevStatus = statusLabel(prevEntry.recommendation.status);
  const currStatus = displayStatus;
  if (statusRank(currStatus) > statusRank(prevStatus)) {
    return `Signal advanced to ${currStatus}. ${entry.snapshot.pitcher_name} at pitch ${pitchCount(entry)}.`;
  }

  if (entry.snapshot.inning !== prevEntry.snapshot.inning || entry.snapshot.half !== prevEntry.snapshot.half) {
    return `New inning: ${halfInningLabel(entry.snapshot.half, entry.snapshot.inning)}. Pitch ${pitchCount(entry)}.`;
  }

  const prevScore = (prevEntry.snapshot.away_score ?? 0) + (prevEntry.snapshot.home_score ?? 0);
  const currScore = (entry.snapshot.away_score ?? 0) + (entry.snapshot.home_score ?? 0);
  if (currScore !== prevScore) {
    return `Score changed: ${entry.snapshot.away_score ?? 0}-${entry.snapshot.home_score ?? 0}. Pitch ${pitchCount(entry)}.`;
  }

  return null;
}

export function GameAuditPage({ team, initialGameId }: { team: Team; initialGameId?: string }) {
  const [games, setGames] = useState<EnterpriseGameSummary[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>(initialGameId || "");
  const [replay, setReplay] = useState<PitchingReplayResponse | null>(null);
  const [opportunities, setOpportunities] = useState<PreventableRunsOpportunityRow[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [autoplay, setAutoplay] = useState(false);
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setGamesLoading(true);
    fetchEnterpriseGames({ team: team.abbr, limit: 30 })
      .then((payload) => setGames(payload.games))
      .catch(() => setGames([]))
      .finally(() => setGamesLoading(false));
  }, [team.abbr]);

  useEffect(() => {
    if (!selectedGameId) { setReplay(null); return; }
    setLoading(true);
    setAutoplay(false);
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

  // Autoplay logic
  useEffect(() => {
    if (autoplay && replay) {
      autoplayRef.current = setInterval(() => {
        setSelectedIdx((prev) => {
          if (prev >= replay.entries.length - 1) {
            setAutoplay(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1200);
    }
    return () => { if (autoplayRef.current) clearInterval(autoplayRef.current); };
  }, [autoplay, replay]);

  const entries = useMemo(
    () => (replay?.entries ?? []).filter((e) => e.snapshot.fielding_team === team.abbr),
    [replay, team.abbr],
  );
  const statuses = useMemo(() => monotonicStatuses(entries), [entries]);
  const pitcherGroups = useMemo(() => groupByPitcher(entries), [entries]);
  const selected = entries[selectedIdx] ?? null;
  const prevEntry = selectedIdx > 0 ? entries[selectedIdx - 1] : null;
  const displayStatus = statuses[selectedIdx] ?? "STAY";
  const opportunity = useMemo(
    () => opportunityForPitch(selected, opportunities, selectedGameId),
    [selected, opportunities, selectedGameId],
  );
  const preventable = preventableRunsForPitch(selected, opportunity);

  const starterPitcherId = entries[0]?.snapshot.pitcher_id ?? "";

  // Determine if selected team is home or away for score display
  const isHome = replay ? replay.game.home_team === team.abbr : true;
  const opponent = replay ? (isHome ? replay.game.away_team : replay.game.home_team) : "";

  const jumpToPullNow = useCallback(() => {
    const idx = entries.findIndex((e) => statusLabel(e.recommendation.status) === "PULL NOW");
    if (idx >= 0) setSelectedIdx(idx);
  }, [entries]);

  const eventNarrative = selected ? buildEventNarrative(selected, prevEntry, displayStatus) : null;

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
        title={replay ? `${team.abbr} vs ${opponent}` : team.name}
        subtitle={replay ? `${isHome ? "Home" : "Away"} · ${formatDateText(replay.game.date)}` : "Select a game to review"}
        actions={
          <select
            className="game-selector"
            value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
          >
            <option value="">Select game...</option>
            {games.map((g) => {
              const opp = g.home_team === team.abbr ? g.away_team : g.home_team;
              const loc = g.home_team === team.abbr ? "vs" : "@";
              return (
                <option key={g.game_id} value={g.game_id}>
                  {team.abbr} {loc} {opp} — {g.date}
                </option>
              );
            })}
          </select>
        }
      />

      {loading && <div className="loading-shimmer" />}

      {!loading && replay && entries.length > 0 && (
        <>
          {/* Status Banner */}
          <section className="game-status-banner">
            <h2 className={`game-status-banner__status game-status-banner__status--${signalClass(displayStatus)}`}>
              {displayStatus}
            </h2>
          </section>

          {/* Event narrative */}
          {eventNarrative && (
            <div className="event-narrative">
              <span className="event-narrative__label">Current pitch window</span>
              <span className="event-narrative__text">{eventNarrative}</span>
            </div>
          )}

          {/* Main three-column layout */}
          <section className="game-detail-expanded">
            {/* Left: Situation */}
            <div className="game-detail__situation-expanded">
              <div className="situation-pitcher-card">
                <div className="situation-pitcher-card__team">
                  <img
                    src={`https://www.mlbstatic.com/team-logos/${teamIdForAbbr(selected.snapshot.fielding_team)}.svg`}
                    alt={selected.snapshot.fielding_team}
                    width={40}
                    height={40}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                <h3 className="situation-pitcher-card__name">{selected.snapshot.pitcher_name}</h3>
                <Diamond baseState={selected.snapshot.base_state} outs={selected.snapshot.outs} />
              </div>
              <div className="situation-facts-table">
                <SituationRow label="Situation" value={halfInningLabel(selected.snapshot.half, selected.snapshot.inning)} />
                <SituationRow label="Bases" value={baseStateLabel(selected.snapshot.base_state)} />
                <SituationRow label="Outs" value={outsLabel(selected.snapshot.outs)} />
                <SituationRow label="Pitch count" value={String(pitchCount(selected))} />
                <SituationRow label="Times through order" value={String(selected.snapshot.starter_state.times_through_order)} />
                <SituationRow label="Score" value={scoreFromPerspective(selected, isHome, team.abbr, opponent)} />
                {selected.snapshot.starter_state.batters_faced_in_game != null && (
                  <SituationRow label="Batters faced" value={String(selected.snapshot.starter_state.batters_faced_in_game)} />
                )}
              </div>
            </div>

            {/* Center: Strike Zone */}
            <div className="game-detail__zone">
              <StrikeZone
                px={selected.snapshot.px}
                pz={selected.snapshot.pz}
                pitchType={selected.snapshot.pitch_type}
                releaseSpeed={selected.snapshot.release_speed}
                pitchNumber={pitchCount(selected)}
                status={displayStatus}
              />
            </div>

            {/* Right: Decision Read */}
            <div className="game-detail__decision">
              <DecisionReadPanel
                entry={selected}
                displayStatus={displayStatus}
                preventableRuns={preventable}
              />
            </div>
          </section>

          {/* Pitcher Tabs */}
          <section className="pitcher-tabs">
            {pitcherGroups.map((pg) => {
              const isActive = selectedIdx >= pg.startIdx && selectedIdx < pg.startIdx + pg.count;
              return (
                <button
                  key={pg.pitcherId}
                  className={`pitcher-tab ${isActive ? "pitcher-tab--active" : ""}`}
                  onClick={() => setSelectedIdx(pg.startIdx)}
                >
                  <span className="pitcher-tab__name">{pg.name} · {pg.role}</span>
                  <span className="pitcher-tab__count">{pg.count} pitches</span>
                </button>
              );
            })}
          </section>

          {/* Timeline */}
          <section className="game-timeline-expanded">
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
            {/* Scrubber */}
            <input
              type="range"
              className="timeline-scrubber"
              min={0}
              max={entries.length - 1}
              value={selectedIdx}
              onChange={(e) => setSelectedIdx(Number(e.target.value))}
            />
          </section>

          {/* Navigation controls */}
          <section className="game-nav-controls">
            <button
              className="nav-ctrl-btn"
              onClick={() => setSelectedIdx((p) => Math.max(0, p - 1))}
              disabled={selectedIdx <= 0}
            >
              PREVIOUS
            </button>
            <button
              className={`nav-ctrl-btn nav-ctrl-btn--autoplay ${autoplay ? "nav-ctrl-btn--active" : ""}`}
              onClick={() => setAutoplay((a) => !a)}
            >
              {autoplay ? "PAUSE" : "AUTOPLAY"}
            </button>
            <button
              className="nav-ctrl-btn"
              onClick={() => setSelectedIdx((p) => Math.min(entries.length - 1, p + 1))}
              disabled={selectedIdx >= entries.length - 1}
            >
              NEXT
            </button>
            <button className="nav-ctrl-btn nav-ctrl-btn--jump" onClick={jumpToPullNow}>
              JUMP TO PULL NOW
            </button>
          </section>

          {/* Model detail breakdown */}
          {selected && <ModelDetailPanel entry={selected} />}

          {/* Bullpen outcomes */}
          <BullpenOutcomes entries={entries} starterPitcherId={starterPitcherId} />

          {/* Decision outcome */}
          <DecisionOutcome entries={entries} opportunity={opportunity} />
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

function SituationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="situation-row">
      <span className="situation-row__label">{label}</span>
      <span className="situation-row__value">{value}</span>
    </div>
  );
}

function Diamond({ baseState, outs }: { baseState: string | null | undefined; outs: number }) {
  const flags = baseStateFlags(baseState);
  return (
    <div className="diamond-with-outs">
      <svg viewBox="0 0 60 60" width={56} height={56}>
        <polygon points="30,8 52,30 30,52 8,30" fill="none" stroke="var(--navy)" strokeWidth="1.5" opacity="0.25" />
        <circle cx="30" cy="52" r="4" fill="var(--navy)" opacity="0.5" />
        <circle cx="52" cy="30" r="4" fill={flags.first ? "var(--gold)" : "var(--paper-2)"} stroke="var(--navy)" strokeWidth="1" />
        <circle cx="30" cy="8" r="4" fill={flags.second ? "var(--gold)" : "var(--paper-2)"} stroke="var(--navy)" strokeWidth="1" />
        <circle cx="8" cy="30" r="4" fill={flags.third ? "var(--gold)" : "var(--paper-2)"} stroke="var(--navy)" strokeWidth="1" />
      </svg>
      <div className="diamond-outs">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`diamond-out-dot ${i < outs ? "diamond-out-dot--filled" : ""}`} />
        ))}
      </div>
    </div>
  );
}

function scoreFromPerspective(entry: PitchingReplayEntry, isHome: boolean, teamAbbr: string, opponent: string): string {
  const homeScore = entry.snapshot.home_score ?? 0;
  const awayScore = entry.snapshot.away_score ?? 0;
  const teamScore = isHome ? homeScore : awayScore;
  const oppScore = isHome ? awayScore : homeScore;
  return `${teamAbbr} ${teamScore} - ${oppScore} ${opponent}`;
}

function teamIdForAbbr(abbr: string): number {
  const ids: Record<string, number> = {
    ARI: 109, AZ: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CWS: 145,
    CIN: 113, CLE: 114, COL: 115, DET: 116, HOU: 117, KC: 118, LAA: 108,
    LAD: 119, MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147, OAK: 133,
    PHI: 143, PIT: 134, SD: 135, SEA: 136, SF: 137, STL: 138, TB: 139,
    TEX: 140, TOR: 141, WSH: 120,
  };
  return ids[abbr] ?? 0;
}
