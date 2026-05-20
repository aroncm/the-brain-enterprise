import type { PitchingReplayEntry } from "../types";
import { fmtNumber, fmtPct, fmtSigned, statusLabel, clamp } from "../lib/format";
import { stuffScore, scaledPercent } from "../lib/helpers";

type Props = {
  entry: PitchingReplayEntry;
  displayStatus: string;
  preventableRuns: number | null;
};

export function DecisionReadPanel({ entry, displayStatus, preventableRuns }: Props) {
  const s = entry.snapshot.starter_state;
  const rec = entry.recommendation;

  const stuffPressure = s.normalized_component_scores?.stuff_pressure
    ?? s.normalized_component_scores?.stuff
    ?? (s.degradation_score != null ? Math.min(1, s.degradation_score / 3) : null);

  const commandPressure = s.normalized_component_scores?.command_pressure
    ?? s.normalized_component_scores?.command
    ?? (s.location_dispersion_10 != null ? Math.min(1, s.location_dispersion_10 / 2) : null);

  const decayPressure = s.normalized_component_scores?.decay_pressure
    ?? ((s.inning_decay_factor ?? 0) + (s.tto_decay_factor ?? 0) > 0
      ? Math.min(1, ((s.inning_decay_factor ?? 0) + (s.tto_decay_factor ?? 0)) / 1.5)
      : null);

  const leveragePressure = s.normalized_component_scores?.leverage_pressure
    ?? (entry.snapshot.leverage_index != null ? Math.min(1, entry.snapshot.leverage_index / 4) : null);

  const showRelief = statusLabel(displayStatus) !== "STAY";

  return (
    <div className="decision-read">
      <span className="decision-read__eyebrow">DECISION READ</span>

      <div className="decision-read__hero">
        <div className="decision-read__degradation-ring">
          <svg viewBox="0 0 80 80" className="degradation-ring">
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--paper-2)" strokeWidth="6" />
            <circle
              cx="40" cy="40" r="34"
              fill="none"
              stroke={s.degradation_score > 2 ? "var(--red)" : s.degradation_score > 1 ? "var(--gold)" : "var(--green)"}
              strokeWidth="6"
              strokeDasharray={`${Math.min(1, s.degradation_score / 4) * 214} 214`}
              strokeLinecap="round"
              transform="rotate(-90 40 40)"
            />
            <text x="40" y="37" textAnchor="middle" className="degradation-ring__value">
              {s.degradation_score.toFixed(2)}
            </text>
            <text x="40" y="52" textAnchor="middle" className="degradation-ring__label">
              DEGRADATION
            </text>
          </svg>
        </div>
        <div className="decision-read__preventable">
          <span className="decision-read__preventable-label">Preventable Runs</span>
          <strong className="decision-read__preventable-value">
            {preventableRuns != null ? fmtSigned(preventableRuns, 2) : "—"}
          </strong>
          <span className="decision-read__preventable-desc">Calibrated opportunity model</span>
        </div>
      </div>

      <div className="decision-read__pressures">
        <PressureGauge label="STUFF PRESSURE" value={stuffPressure} />
        <PressureGauge label="COMMAND PRESSURE" value={commandPressure} />
        <PressureGauge label="DECAY PRESSURE" value={decayPressure} />
        <PressureGauge label="LEVERAGE" value={leveragePressure} />
      </div>

      {rec.starter_risk_level && (
        <div className="decision-read__risk">
          Risk level: <strong>{rec.starter_risk_level}</strong>
        </div>
      )}

      {rec.estimated_win_probability_delta != null && (
        <div className="decision-read__wp">
          WP Impact: <strong>{fmtSigned(rec.estimated_win_probability_delta * 100, 1)}%</strong>
        </div>
      )}

      {!showRelief && (
        <div className="decision-read__note">
          <strong>Relief context unlocks at WATCH</strong>
          <p>Before WATCH, the replay stays focused on pitcher evidence. Bullpen alternatives are shown once the first action signal appears.</p>
        </div>
      )}

      {showRelief && entry.top_candidates && entry.top_candidates.length > 0 && (
        <div className="decision-read__candidates">
          <span className="decision-read__candidates-label">Reliever Alternatives</span>
          {entry.top_candidates.slice(0, 3).map((c) => (
            <div key={c.player_id} className="candidate-row">
              <span className="candidate-row__name">{c.player_name}</span>
              <span className="candidate-row__role">{c.bullpen_role}</span>
              <span className="candidate-row__score">
                Matchup {fmtNumber(c.direct_matchup_fit, 2)}
              </span>
              <span className="candidate-row__option">
                Option {fmtNumber(c.net_option_score, 2)}
              </span>
              <span className="candidate-row__usage">
                Usage {fmtNumber(c.usage_cost, 2)}
              </span>
              {!c.available && <span className="candidate-row__unavail">UNAVAIL</span>}
            </div>
          ))}
        </div>
      )}

      {showRelief && rec.decision_delta != null && (
        <div className="decision-read__delta">
          <span className="decision-read__delta-label">Decision Delta</span>
          <strong className="decision-read__delta-value">{fmtSigned(rec.decision_delta, 3)} runs</strong>
          <p className="decision-read__delta-desc">
            Starter next-3: {fmtNumber(rec.starter_value_next_3_hitters, 3)} vs.
            Reliever: {fmtNumber(rec.best_reliever_value_next_3_hitters, 3)}
          </p>
        </div>
      )}
    </div>
  );
}

function PressureGauge({ label, value }: { label: string; value: number | null }) {
  const pct = value != null ? Math.round(clamp(value) * 100) : 0;
  const display = value != null ? (value > 0.99 ? "100%" : `${pct}%`) : "—";
  const tone = pct > 65 ? "bad" : pct > 40 ? "warn" : "good";
  return (
    <div className="pressure-gauge">
      <div className="pressure-gauge__head">
        <span className="pressure-gauge__label">{label}</span>
        <strong className="pressure-gauge__value">{display}</strong>
      </div>
      <div className={`pressure-gauge__bar pressure-gauge__bar--${tone}`}>
        <div className="pressure-gauge__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
