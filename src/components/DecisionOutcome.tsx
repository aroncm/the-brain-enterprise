import type { PitchingReplayEntry, PreventableRunsOpportunityRow } from "../types";
import { fmtNumber, fmtSigned, statusLabel, ordinal } from "../lib/format";
import { pitchCount, stuffScore } from "../lib/helpers";

type Props = {
  entries: PitchingReplayEntry[];
  opportunity: PreventableRunsOpportunityRow | null;
};

export function DecisionOutcome({ entries, opportunity }: Props) {
  const pullNowEntry = entries.find((e) => statusLabel(e.recommendation.status) === "PULL NOW");
  if (!pullNowEntry) return null;

  const pullNowPitch = pitchCount(pullNowEntry);
  const pullNowInning = pullNowEntry.snapshot.inning;
  const pullNowHalf = pullNowEntry.snapshot.half;
  const pullNowStuff = stuffScore(pullNowEntry);
  const pullNowDeg = pullNowEntry.snapshot.starter_state.degradation_score;
  const decayVal = (pullNowEntry.snapshot.starter_state.inning_decay_factor ?? 0)
    + (pullNowEntry.snapshot.starter_state.tto_decay_factor ?? 0);

  const delta = pullNowEntry.recommendation.decision_delta;
  const bestReliever = pullNowEntry.recommendation.recommended_reliever_name
    ?? pullNowEntry.top_candidates?.[0]?.player_name
    ?? null;

  const lastEntry = entries[entries.length - 1];
  const finalPitch = pitchCount(lastEntry);
  const pitchesAfter = finalPitch - pullNowPitch;
  const battersAfter = (lastEntry.snapshot.starter_state.batters_faced_in_game ?? 0)
    - (pullNowEntry.snapshot.starter_state.batters_faced_in_game ?? 0);

  const oppAny = opportunity as Record<string, unknown> | null;
  const runsAfter = (oppAny?.runsAllowedAfterSignal ?? oppAny?.actualRunsAfterSignal ?? null) as number | null;
  const actualPullInning = (oppAny?.actualPullInning ?? null) as number | null;
  const actualPullPitch = (oppAny?.actualPullPitchCount ?? null) as number | null;

  return (
    <section className="decision-outcome">
      <header className="decision-outcome__header">
        <span className="decision-outcome__eyebrow">DECISION OUTCOME</span>
        <h2 className="decision-outcome__title">What happened after the model action point.</h2>
      </header>

      <div className="decision-outcome__cards">
        <div className="outcome-card">
          <h3 className="outcome-card__title">Pull Now summary</h3>
          <p className="outcome-card__body">
            Pull Now triggered in the {ordinal(pullNowInning)} ({pullNowHalf === "top" ? "top" : "bot"}) at pitch {pullNowPitch}.
          </p>
          <div className="outcome-card__chips">
            <span className="outcome-chip">Stuff {pullNowStuff}/100</span>
            <span className="outcome-chip">Decay {fmtNumber(decayVal, 2)}</span>
            <span className="outcome-chip">Degradation {fmtNumber(pullNowDeg, 2)}</span>
          </div>
        </div>

        <div className="outcome-card">
          <h3 className="outcome-card__title">Decision delta</h3>
          <p className="outcome-card__body">
            {bestReliever
              ? `${bestReliever} was the best recorded relief alternative at the model action point.`
              : "Relief alternative recorded at the model action point."}
            {delta != null && ` The model estimated a ${fmtSigned(delta, 2)} run delta versus staying with the starter.`}
          </p>
        </div>

        <div className="outcome-card">
          <h3 className="outcome-card__title">Actual result</h3>
          <p className="outcome-card__body">
            {actualPullInning != null && actualPullPitch != null
              ? `Starter was pulled in the ${ordinal(actualPullInning)} at pitch ${actualPullPitch}; `
              : `Starter continued to pitch ${finalPitch}; `}
            {runsAfter != null ? `${runsAfter} runs scored after the model signal.` : ""}
            {pitchesAfter > 0 && ` Manager held him ${pitchesAfter} pitches`}
            {battersAfter > 0 && ` / ${battersAfter} batters after the signal.`}
          </p>
        </div>
      </div>
    </section>
  );
}
