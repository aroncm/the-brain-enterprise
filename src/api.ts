import type {
  EnterpriseAppearancesPayload,
  EnterpriseGamesPayload,
  PitcherProfilesPayload,
  PitchingAuditSummaryPayload,
  PitchingGameRecap,
  PitchingRecapEmailResponse,
  PitchingRecapSettings,
  PitchingReplayResponse,
  RunSavingBoardPayload,
} from "./types";

const DEFAULT_API_BASE = "https://aroncm--abs-challenge-api-tuned-fastapi-app-tuned.modal.run";
const viteEnv = import.meta.env ?? {};
const API_BASE = (viteEnv.VITE_BASEBALL_BRAIN_API_BASE ?? DEFAULT_API_BASE).replace(/\/+$/, "");

export function getConfiguredApiBase(): string {
  return API_BASE;
}

export class ApiConfigurationError extends Error {
  constructor() {
    super("Baseball brAIn API base is not configured.");
    this.name = "ApiConfigurationError";
  }
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_BASE) {
    throw new ApiConfigurationError();
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      if (typeof payload?.detail === "string") {
        detail = payload.detail;
      }
    } catch {
      // Keep the HTTP status as the useful fallback.
    }
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

export type RunSavingBoardQuery = {
  league?: "mlb" | "triple_a";
  team?: string;
  date?: string;
  year?: string;
  limit?: number;
};

export function fetchRunSavingBoard(query: RunSavingBoardQuery = {}): Promise<RunSavingBoardPayload> {
  const params = new URLSearchParams();
  params.set("league", query.league ?? "mlb");
  if (query.team) params.set("team", query.team);
  if (query.date) params.set("date", query.date);
  if (query.year) params.set("year", query.year);
  if (query.limit != null) params.set("limit", String(query.limit));
  return fetchJson<RunSavingBoardPayload>(`/v1/enterprise/run-saving/board?${params.toString()}`);
}

export function fetchEnterpriseGames(query: RunSavingBoardQuery = {}): Promise<EnterpriseGamesPayload> {
  const params = new URLSearchParams();
  params.set("league", query.league ?? "mlb");
  if (query.team) params.set("team", query.team);
  if (query.date) params.set("date", query.date);
  if (query.year) params.set("year", query.year);
  if (query.limit != null) params.set("limit", String(query.limit));
  return fetchJson<EnterpriseGamesPayload>(`/v1/enterprise/run-saving/games?${params.toString()}`);
}

export function fetchPitcherProfiles(query: RunSavingBoardQuery & { year?: string } = {}): Promise<PitcherProfilesPayload> {
  const params = new URLSearchParams();
  params.set("league", query.league ?? "mlb");
  if (query.team) params.set("team", query.team);
  if (query.year) params.set("year", query.year);
  if (query.limit != null) params.set("limit", String(query.limit));
  return fetchJson<PitcherProfilesPayload>(`/v1/enterprise/run-saving/pitcher-profiles?${params.toString()}`);
}

export function fetchEnterpriseAppearances(query: RunSavingBoardQuery & { year?: string } = {}): Promise<EnterpriseAppearancesPayload> {
  const params = new URLSearchParams();
  params.set("league", query.league ?? "mlb");
  if (query.team) params.set("team", query.team);
  if (query.year) params.set("year", query.year);
  if (query.date) params.set("date", query.date);
  if (query.limit != null) params.set("limit", String(query.limit));
  return fetchJson<EnterpriseAppearancesPayload>(`/v1/enterprise/run-saving/appearances?${params.toString()}`);
}

export function fetchPitchingAuditSummary(
  query: RunSavingBoardQuery & {
    year?: string;
    leverage_band?: "ROUTINE" | "ELEVATED" | "HIGH";
    status?: "STAY" | "WATCH" | "PREP" | "PULL_NOW";
    actual_outcome?: "changed" | "stayed";
  } = {},
): Promise<PitchingAuditSummaryPayload> {
  const params = new URLSearchParams();
  params.set("league", query.league ?? "mlb");
  params.set("limit", String(query.limit ?? 500));
  if (query.team) params.set("team", query.team);
  if (query.year) params.set("year", query.year);
  if (query.leverage_band) params.set("leverage_band", query.leverage_band);
  if (query.status) params.set("status", query.status);
  if (query.actual_outcome) params.set("actual_outcome", query.actual_outcome);
  return fetchJson<PitchingAuditSummaryPayload>(`/v1/pitching/audit/summary?${params.toString()}`);
}

export function fetchPitchingReplay(gameId: string, league: "mlb" | "triple_a" = "mlb"): Promise<PitchingReplayResponse> {
  return fetchJson<PitchingReplayResponse>(`/v1/pitching/replay/${encodeURIComponent(gameId)}?league=${league}`);
}

export function fetchPitchingRecap(gameId: string, league: "mlb" | "triple_a" = "mlb"): Promise<PitchingGameRecap> {
  return fetchJson<PitchingGameRecap>(`/v1/pitching/recap/${encodeURIComponent(gameId)}?league=${league}`);
}

export function fetchPitchingRecapSettings(league: "mlb" | "triple_a" = "mlb"): Promise<PitchingRecapSettings> {
  return fetchJson<PitchingRecapSettings>(`/v1/pitching/recap-settings?league=${league}`);
}

export function savePitchingRecapSettings(
  patch: Partial<PitchingRecapSettings>,
  league: "mlb" | "triple_a" = "mlb",
): Promise<PitchingRecapSettings> {
  return fetchJson<PitchingRecapSettings>(`/v1/pitching/recap-settings?league=${league}`, {
    method: "POST",
    body: JSON.stringify(patch),
  });
}

export function sendPitchingRecapEmail(
  params: { game_id: string; team: string; recipient?: string; send?: boolean },
  league: "mlb" | "triple_a" = "mlb",
): Promise<PitchingRecapEmailResponse> {
  return fetchJson<PitchingRecapEmailResponse>(`/v1/pitching/recap-email?league=${league}`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}
