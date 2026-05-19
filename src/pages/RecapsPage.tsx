import { useEffect, useState } from "react";
import type { Team } from "../lib/constants";
import { UNAVAILABLE } from "../lib/constants";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { MetricCard } from "../components/MetricCard";
import { TeamLogo } from "../components/TeamLogo";
import {
  fetchEnterpriseGames,
  fetchPitchingRecap,
  fetchPitchingRecapSettings,
  savePitchingRecapSettings,
  sendPitchingRecapEmail,
} from "../api";
import type {
  EnterpriseGameSummary,
  PitchingGameRecap,
  PitchingRecapPitcher,
  PitchingRecapSettings,
  PitchingRecapEmailResponse,
} from "../types";
import { fmtNumber, ordinal, statusLabel, formatDateText } from "../lib/format";
import { looseNumber } from "../lib/helpers";

export function RecapsPage({ team }: { team: Team }) {
  const [games, setGames] = useState<EnterpriseGameSummary[]>([]);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [recap, setRecap] = useState<PitchingGameRecap | null>(null);
  const [settings, setSettings] = useState<PitchingRecapSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [recapLoading, setRecapLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendResult, setSendResult] = useState<PitchingRecapEmailResponse | null>(null);
  const [newRecipient, setNewRecipient] = useState("");
  const [tab, setTab] = useState<"recap" | "settings">("recap");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchEnterpriseGames({ team: team.abbr, limit: 20 }).catch(() => ({ games: [] as EnterpriseGameSummary[], summary: { generatedAt: null, league: "mlb" as const, gameCount: 0 } })),
      fetchPitchingRecapSettings("mlb").catch(() => null),
    ]).then(([gamesPayload, settingsData]) => {
      setGames(gamesPayload.games);
      setSettings(settingsData);
      setLoading(false);
    });
  }, [team.abbr]);

  useEffect(() => {
    if (!selectedGameId) {
      setRecap(null);
      return;
    }
    setRecapLoading(true);
    fetchPitchingRecap(selectedGameId)
      .then(setRecap)
      .catch(() => setRecap(null))
      .finally(() => setRecapLoading(false));
  }, [selectedGameId]);

  const recipients = settings?.team_recipients?.[team.abbr] ?? [];
  const autoEnabled = settings?.enabled_teams?.includes(team.abbr) ?? false;

  function handleAddRecipient() {
    if (!newRecipient.trim() || !settings) return;
    const updated = {
      ...settings,
      team_recipients: {
        ...settings.team_recipients,
        [team.abbr]: [...recipients, newRecipient.trim()],
      },
    };
    setSaving(true);
    savePitchingRecapSettings(updated, "mlb")
      .then(setSettings)
      .catch(() => {})
      .finally(() => {
        setSaving(false);
        setNewRecipient("");
      });
  }

  function handleRemoveRecipient(email: string) {
    if (!settings) return;
    const updated = {
      ...settings,
      team_recipients: {
        ...settings.team_recipients,
        [team.abbr]: recipients.filter((r) => r !== email),
      },
    };
    setSaving(true);
    savePitchingRecapSettings(updated, "mlb")
      .then(setSettings)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  function handleToggleAuto() {
    if (!settings) return;
    const current = settings.enabled_teams ?? [];
    const next = autoEnabled ? current.filter((t) => t !== team.abbr) : [...current, team.abbr];
    const updated = { ...settings, enabled_teams: next };
    setSaving(true);
    savePitchingRecapSettings(updated, "mlb")
      .then(setSettings)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  function handleSendTest() {
    if (!selectedGameId) return;
    setSendResult(null);
    sendPitchingRecapEmail({ game_id: selectedGameId, team: team.abbr, send: true }, "mlb")
      .then(setSendResult)
      .catch(() => setSendResult(null));
  }

  const starters = recap?.starters.filter((p) => p.team === team.abbr && (p.role ?? "Starter").toLowerCase() !== "reliever") ?? [];
  const relievers = recap?.starters.filter((p) => p.team === team.abbr && (p.role ?? "Starter").toLowerCase() === "reliever") ?? [];

  return (
    <div className="recaps-page">
      <PageHeader
        eyebrow="GAME RECAPS"
        title={team.name}
        subtitle="Post-game briefings and email configuration"
        actions={
          <div className="recaps-tabs">
            <button className={`tab-btn ${tab === "recap" ? "tab-btn--active" : ""}`} onClick={() => setTab("recap")}>Recap</button>
            <button className={`tab-btn ${tab === "settings" ? "tab-btn--active" : ""}`} onClick={() => setTab("settings")}>Settings</button>
          </div>
        }
      />

      {tab === "recap" && (
        <>
          <div className="recaps-game-select">
            <select
              className="game-selector"
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
            >
              <option value="">Select game for recap...</option>
              {games.map((g) => (
                <option key={g.game_id} value={g.game_id}>
                  {g.away_team} @ {g.home_team} — {g.date}
                </option>
              ))}
            </select>
            {selectedGameId && (
              <button className="btn btn--gold" onClick={handleSendTest} disabled={!selectedGameId}>
                Send recap email
              </button>
            )}
          </div>

          {recapLoading && <div className="loading-shimmer" />}

          {sendResult && (
            <div className="send-result">
              {sendResult.sent
                ? `Recap sent to ${sendResult.sent_to?.join(", ") ?? "recipients"}`
                : "Recap generated (not sent)"}
            </div>
          )}

          {recap && !recapLoading && (
            <div className="recap-content">
              <div className="recap-header">
                <h2>{recap.away_team} @ {recap.home_team}</h2>
                <span className="recap-date">{formatDateText(recap.date)}</span>
                <span className="recap-score">
                  Final: {recap.away_team} {recap.final_away_score ?? "—"}, {recap.home_team} {recap.final_home_score ?? "—"}
                </span>
              </div>

              {starters.length > 0 && (
                <section className="recap-starters">
                  <h3 className="section-title">Starters</h3>
                  {starters.map((p) => (
                    <PitcherRecapCard key={p.pitcher_id} pitcher={p} />
                  ))}
                </section>
              )}

              {relievers.length > 0 && (
                <section className="recap-relievers">
                  <h3 className="section-title">Bullpen</h3>
                  {relievers.map((p) => (
                    <RelieverRecapCard key={p.pitcher_id} pitcher={p} />
                  ))}
                </section>
              )}

              {recap.score_timeline.length > 0 && (
                <section className="recap-timeline">
                  <h3 className="section-title">Scoring Timeline</h3>
                  <div className="score-timeline-chart">
                    {recap.score_timeline.map((entry, i) => (
                      <div key={i} className="score-bar">
                        <div
                          className="score-bar__fill"
                          style={{ height: `${Math.min(100, entry.runs_scored_against_pitcher * 25)}%` }}
                        />
                        <span className="score-bar__label">
                          {entry.half === "top" ? "T" : "B"}{entry.inning}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {!recap && !recapLoading && selectedGameId && (
            <EmptyState title="Recap unavailable" detail="No recap data was returned for this game." />
          )}
        </>
      )}

      {tab === "settings" && (
        <div className="recaps-settings">
          <section className="settings-section">
            <h3 className="section-title">Email Recipients</h3>
            <p className="section-desc">People who receive post-game briefings for {team.club}</p>
            {recipients.length === 0 && (
              <p className="settings-empty">No recipients configured for this club.</p>
            )}
            <ul className="recipient-list">
              {recipients.map((email) => (
                <li key={email} className="recipient-item">
                  <span>{email}</span>
                  <button className="btn btn--sm btn--danger" onClick={() => handleRemoveRecipient(email)} disabled={saving}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="add-recipient">
              <input
                type="email"
                placeholder="email@example.com"
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddRecipient()}
              />
              <button className="btn btn--gold" onClick={handleAddRecipient} disabled={saving || !newRecipient.trim()}>
                Add
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h3 className="section-title">Auto-Send</h3>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={autoEnabled}
                onChange={handleToggleAuto}
                disabled={saving}
              />
              <span>Automatically send recaps after {team.club} games</span>
            </label>
          </section>
        </div>
      )}
    </div>
  );
}

function PitcherRecapCard({ pitcher }: { pitcher: PitchingRecapPitcher }) {
  const box = pitcher.boxscore;
  return (
    <div className="pitcher-recap-card">
      <div className="pitcher-recap-card__header">
        <strong>{pitcher.pitcher_name}</strong>
        <StatusBadge status={pitcher.peak_status} size="sm" />
        {pitcher.missed_hook && <span className="missed-hook-tag">MISSED HOOK</span>}
      </div>
      <div className="pitcher-recap-card__stats">
        {box && (
          <span className="boxscore-line">
            {box.ip ?? "—"} IP, {box.h ?? "—"} H, {box.r ?? "—"} R, {box.bb ?? "—"} BB, {box.so ?? "—"} K
          </span>
        )}
        <span>{pitcher.pitch_count} pitches</span>
      </div>
      <div className="pitcher-recap-card__signal">
        {pitcher.first_pull_now_inning != null ? (
          <span className="signal-line signal-line--red">
            Pull Now in {ordinal(pitcher.first_pull_now_inning)} at pitch {pitcher.first_pull_now_pitch_count ?? "—"}
          </span>
        ) : pitcher.first_alert_inning != null ? (
          <span className="signal-line signal-line--gold">
            {statusLabel(pitcher.first_alert_status)} in {ordinal(pitcher.first_alert_inning)} at pitch {pitcher.first_alert_pitch_count ?? "—"}
          </span>
        ) : (
          <span className="signal-line">No action signal generated</span>
        )}
        {(pitcher.runs_allowed_after_signal ?? 0) > 0 && (
          <span className="damage-after">
            {pitcher.runs_allowed_after_signal} run{pitcher.runs_allowed_after_signal === 1 ? "" : "s"} scored after signal
          </span>
        )}
      </div>
    </div>
  );
}

function RelieverRecapCard({ pitcher }: { pitcher: PitchingRecapPitcher }) {
  const rssScore = pitcher.rss_score;
  return (
    <div className="pitcher-recap-card pitcher-recap-card--reliever">
      <div className="pitcher-recap-card__header">
        <strong>{pitcher.pitcher_name}</strong>
        {rssScore != null && (
          <span className="rss-badge">RSS {fmtNumber(rssScore, 2)}</span>
        )}
      </div>
      <div className="pitcher-recap-card__stats">
        <span>{fmtNumber(pitcher.innings_pitched, 1)} IP, {pitcher.runs_allowed_total ?? "—"} R, {pitcher.pitch_count} pitches</span>
      </div>
    </div>
  );
}
