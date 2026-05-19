import { useEffect, useState } from "react";
import { MLB_TEAMS, type Team } from "../lib/constants";
import { TeamLogo } from "../components/TeamLogo";
import { navigate } from "../lib/router";
import { fetchEnterpriseGames, fetchPitchingRecapSettings } from "../api";
import type { EnterpriseGameSummary, PitchingRecapSettings } from "../types";
import { formatDateText } from "../lib/format";

const DIVISIONS = ["AL East", "AL Central", "AL West", "NL East", "NL Central", "NL West"];

function groupByDivision(teams: Team[]): Record<string, Team[]> {
  const grouped: Record<string, Team[]> = {};
  for (const div of DIVISIONS) {
    grouped[div] = teams.filter((t) => t.division === div);
  }
  return grouped;
}

export function HomePage({ selectedTeam, onSelectTeam }: { selectedTeam: Team | null; onSelectTeam: (t: Team) => void }) {
  const [recentGames, setRecentGames] = useState<EnterpriseGameSummary[]>([]);
  const [recapSettings, setRecapSettings] = useState<PitchingRecapSettings | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedTeam) return;
    setLoading(true);
    Promise.all([
      fetchEnterpriseGames({ team: selectedTeam.abbr, limit: 5 }).catch(() => ({ games: [] as EnterpriseGameSummary[], summary: { generatedAt: null, league: "mlb" as const, gameCount: 0 } })),
      fetchPitchingRecapSettings("mlb").catch(() => null),
    ]).then(([gamesPayload, settings]) => {
      setRecentGames(gamesPayload.games);
      setRecapSettings(settings);
      setLoading(false);
    });
  }, [selectedTeam]);

  const divisions = groupByDivision(MLB_TEAMS);

  if (!selectedTeam) {
    return (
      <div className="home-page">
        <header className="home-hero">
          <span className="home-hero__eyebrow">BASEBALL BRAIN</span>
          <h1 className="home-hero__title">
            Pitching <em>Intelligence</em>
          </h1>
          <p className="home-hero__subtitle">Select a club to begin</p>
        </header>
        <section className="team-grid">
          {DIVISIONS.map((div) => (
            <div key={div} className="team-grid__division">
              <h3 className="team-grid__division-label">{div}</h3>
              <div className="team-grid__teams">
                {divisions[div].map((team) => (
                  <button
                    key={team.abbr}
                    className="team-grid__team"
                    onClick={() => onSelectTeam(team)}
                  >
                    <TeamLogo abbr={team.abbr} size={36} />
                    <span className="team-grid__team-name">{team.club}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    );
  }

  const recipientCount = recapSettings?.team_recipients?.[selectedTeam.abbr]?.length ?? 0;

  return (
    <div className="home-page">
      <header className="home-hero">
        <span className="home-hero__eyebrow">BASEBALL BRAIN</span>
        <h1 className="home-hero__title">
          <TeamLogo abbr={selectedTeam.abbr} size={48} />
          {selectedTeam.name}
        </h1>
        <p className="home-hero__subtitle">Pitching intelligence dashboard</p>
      </header>

      <section className="home-nav-cards">
        <button className="nav-card nav-card--gold" onClick={() => navigate({ page: "audit", team: selectedTeam.abbr })}>
          <span className="nav-card__eyebrow">IN-SEASON</span>
          <h2 className="nav-card__title">Pitching Audit</h2>
          <p className="nav-card__desc">Deployment matrix, inning profiles, and missed-hook analysis across the staff.</p>
        </button>
        <button className="nav-card nav-card--navy" onClick={() => navigate({ page: "game", gameId: "", team: selectedTeam.abbr })}>
          <span className="nav-card__eyebrow">GAME LEVEL</span>
          <h2 className="nav-card__title">Game Audit</h2>
          <p className="nav-card__desc">Pitch-by-pitch replay with real-time model signals and reliever alternatives.</p>
        </button>
        <button className="nav-card nav-card--red" onClick={() => navigate({ page: "recaps", team: selectedTeam.abbr })}>
          <span className="nav-card__eyebrow">POST-GAME</span>
          <h2 className="nav-card__title">Game Recaps</h2>
          <p className="nav-card__desc">
            Briefings delivered after each game.
            {recipientCount > 0 && ` ${recipientCount} recipient${recipientCount > 1 ? "s" : ""} configured.`}
          </p>
        </button>
      </section>

      {loading && <p className="home-loading">Loading recent activity...</p>}

      {!loading && recentGames.length > 0 && (
        <section className="home-recent">
          <h3 className="home-recent__title">Recent Games</h3>
          <div className="home-recent__list">
            {recentGames.map((game) => (
              <button
                key={game.game_id}
                className="home-recent__game"
                onClick={() => navigate({ page: "game", gameId: game.game_id, team: selectedTeam.abbr })}
              >
                <span className="home-recent__matchup">{game.away_team} @ {game.home_team}</span>
                <span className="home-recent__date">{formatDateText(game.date)}</span>
                <span className="home-recent__signals">
                  {game.pull_now_count ? `${game.pull_now_count} pull signal${game.pull_now_count > 1 ? "s" : ""}` : "No pull signals"}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <button className="home-change-team" onClick={() => onSelectTeam(null as unknown as Team)}>
        Change club
      </button>
    </div>
  );
}
