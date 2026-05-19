import type { Route } from "../lib/router";
import { navigate } from "../lib/router";
import type { Team } from "../lib/constants";
import { TeamLogo } from "./TeamLogo";

const NAV_ITEMS: Array<{ page: Route["page"]; label: string }> = [
  { page: "home", label: "Home" },
  { page: "audit", label: "In-Season Audit" },
  { page: "game", label: "Game Audit" },
  { page: "recaps", label: "Recaps" },
];

export function NavShell({
  route,
  team,
  children,
}: {
  route: Route;
  team: Team | null;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <nav className="top-nav">
        <button className="top-nav__brand" onClick={() => navigate({ page: "home" })}>
          Baseball br<em>AI</em>n
        </button>
        <div className="top-nav__links">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.page}
              className={`top-nav__link ${route.page === item.page ? "top-nav__link--active" : ""}`}
              onClick={() => {
                if (item.page === "game") {
                  navigate({ page: "game", gameId: "", team: team?.abbr });
                } else if (item.page === "home") {
                  navigate({ page: "home" });
                } else {
                  navigate({ page: item.page, team: team?.abbr });
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        {team && (
          <div className="top-nav__team">
            <TeamLogo abbr={team.abbr} size={24} />
            <span>{team.club}</span>
          </div>
        )}
      </nav>
      <main className="page-content">{children}</main>
    </div>
  );
}
