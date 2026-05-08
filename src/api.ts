import type { RunSavingBoardPayload } from "./types";

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

async function fetchJson<T>(path: string): Promise<T> {
  if (!API_BASE) {
    throw new ApiConfigurationError();
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: "application/json",
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

export function fetchRunSavingBoard(league: "mlb" | "triple_a" = "mlb"): Promise<RunSavingBoardPayload> {
  return fetchJson<RunSavingBoardPayload>(`/v1/enterprise/run-saving/board?league=${league}`);
}
