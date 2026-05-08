# Baseball brAIn Run Saving Tool

Standalone enterprise frontend scaffold for the MLB club-facing Baseball brAIn product.

This is intentionally separate from the live trading app. The goal is a clean Bolt deployment that reuses backend pitcher intelligence artifacts while presenting an enterprise `Run Saving Tool` UI.

## Product Positioning

Baseball brAIn helps clubs make incrementally better pitcher allocation decisions.

Core metric:

```text
Projected Runs Saved
```

Everything in the UI should ladder into run prevention:

- Starter degradation.
- Dynamic decay trajectory.
- Reliever RSS and bullpen availability.
- Handoff risk.
- Batter pocket quality.
- Triple-A short-window relief conversion candidates.
- Postgame decision audit.

## Run Locally

```bash
npm install
npm run dev
```

## Backend Integration

The scaffold is API-first and intentionally has no local sample-data fallback.
If the backend is not configured or the endpoint is unavailable, the UI renders an explicit configuration/error state.

Set this when wiring to the existing backend:

```text
VITE_BASEBALL_BRAIN_API_BASE=https://aroncm--abs-challenge-api-tuned-fastapi-app-tuned.modal.run
```

Current first adapter endpoint:

- `/v1/enterprise/run-saving/board?league=mlb`

This endpoint is a local backend adapter over existing pitching artifacts. It returns real decision windows, top bullpen alternatives, and audit rows from the current Mound Audit artifact layer.

Important current limitation:

- True `Projected Runs Saved` is intentionally returned as `null` until the calibration layer is built.
- Dynamic trajectory metrics are intentionally returned as `null` until the trajectory feature layer is built.
- Triple-A conversion candidates intentionally return an empty list until the Triple-A to MLB translation layer is built.

Existing artifact endpoints reused by the adapter:

- `/v1/pitching/summary`
- `/v1/pitching/games`
- `/v1/pitching/replay/{game_id}`
- `/v1/pitching/recap/{game_id}`
- `/v1/pitching/audit/summary`

Recommended future enterprise endpoints:

- `/v1/enterprise/run-saving/board`
- `/v1/enterprise/run-saving/staff`
- `/v1/enterprise/run-saving/decisions`
- `/v1/enterprise/run-saving/pitcher/{pitcher_id}`
- `/v1/enterprise/run-saving/game/{game_id}/replay`
- `/v1/enterprise/run-saving/game/{game_id}/audit`
- `/v1/enterprise/run-saving/triple-a/conversion-candidates`

## Design System

This uses the deck direction:

- Navy foundation.
- Gold accent.
- White and pale-blue analytical panels.
- Serif editorial headlines.
- Mono labels and metrics.
- Fingerprint-style pitcher identity motif.
