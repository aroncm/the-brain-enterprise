export type Route =
  | { page: "home" }
  | { page: "audit"; team?: string }
  | { page: "game"; gameId: string; team?: string }
  | { page: "recaps"; team?: string };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const [path, query] = raw.split("?");
  const params = new URLSearchParams(query || "");
  const team = params.get("team") || undefined;

  if (path.startsWith("game/")) {
    const gameId = decodeURIComponent(path.slice(5));
    return { page: "game", gameId, team };
  }
  if (path === "audit") return { page: "audit", team };
  if (path === "recaps") return { page: "recaps", team };
  return { page: "home" };
}

export function buildHash(route: Route): string {
  const params = new URLSearchParams();
  if ("team" in route && route.team) params.set("team", route.team);
  const qs = params.toString() ? `?${params.toString()}` : "";

  switch (route.page) {
    case "home": return "#/";
    case "audit": return `#/audit${qs}`;
    case "game": return `#/game/${encodeURIComponent(route.gameId)}${qs}`;
    case "recaps": return `#/recaps${qs}`;
  }
}

export function navigate(route: Route) {
  window.location.hash = buildHash(route);
}
