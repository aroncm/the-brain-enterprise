import { useCallback, useEffect, useState } from "react";
import { type Route, parseHash, navigate as navTo } from "../lib/router";

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const handler = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = useCallback((r: Route) => navTo(r), []);

  return { route, navigate };
}
