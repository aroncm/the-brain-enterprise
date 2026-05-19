import { useState, useCallback } from "react";
import { useRoute } from "./hooks/useRoute";
import { NavShell } from "./components/NavShell";
import { HomePage } from "./pages/HomePage";
import { InSeasonAuditPage } from "./pages/InSeasonAuditPage";
import { GameAuditPage } from "./pages/GameAuditPage";
import { RecapsPage } from "./pages/RecapsPage";
import { MLB_TEAMS, type Team } from "./lib/constants";
import { navigate } from "./lib/router";

function findTeam(abbr: string | undefined): Team | null {
  if (!abbr) return null;
  return MLB_TEAMS.find((t) => t.abbr === abbr.toUpperCase()) ?? null;
}

export default function App() {
  const { route } = useRoute();
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(() => {
    if ("team" in route && route.team) return findTeam(route.team);
    return null;
  });

  const handleSelectTeam = useCallback((team: Team | null) => {
    setSelectedTeam(team);
    if (team) {
      navigate({ page: "home" });
    }
  }, []);

  const activeTeam = ("team" in route && route.team ? findTeam(route.team) : null) ?? selectedTeam;

  return (
    <NavShell route={route} team={activeTeam}>
      {route.page === "home" && (
        <HomePage selectedTeam={activeTeam} onSelectTeam={handleSelectTeam} />
      )}
      {route.page === "audit" && activeTeam && (
        <InSeasonAuditPage team={activeTeam} />
      )}
      {route.page === "audit" && !activeTeam && (
        <HomePage selectedTeam={null} onSelectTeam={handleSelectTeam} />
      )}
      {route.page === "game" && activeTeam && (
        <GameAuditPage team={activeTeam} initialGameId={route.gameId || undefined} />
      )}
      {route.page === "game" && !activeTeam && (
        <HomePage selectedTeam={null} onSelectTeam={handleSelectTeam} />
      )}
      {route.page === "recaps" && activeTeam && (
        <RecapsPage team={activeTeam} />
      )}
      {route.page === "recaps" && !activeTeam && (
        <HomePage selectedTeam={null} onSelectTeam={handleSelectTeam} />
      )}
    </NavShell>
  );
}
