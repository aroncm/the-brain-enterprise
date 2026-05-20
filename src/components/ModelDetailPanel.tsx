import type { PitchingReplayEntry } from "../types";
import { GaugeBar } from "./GaugeBar";
import { fmtNumber, fmtPct, fmtSigned, clamp } from "../lib/format";
import { scaledPercent } from "../lib/helpers";

type Props = {
  entry: PitchingReplayEntry;
};

export function ModelDetailPanel({ entry }: Props) {
  const s = entry.snapshot.starter_state;
  const snap = entry.snapshot;

  const veloTrend = s.velo_slope_5 != null ? s.velo_slope_5 : null;
  const veloDiff = s.velo_mean_5 != null && s.seasonal_velo_baseline != null
    ? s.velo_mean_5 - s.seasonal_velo_baseline : null;

  const spinTrend = s.spin_slope_5 != null ? s.spin_slope_5 : null;
  const spinDiff = s.spin_mean_5 != null && s.seasonal_spin_baseline != null
    ? s.spin_mean_5 - s.seasonal_spin_baseline : null;

  const contributions = s.component_contributions ?? {};
  const sortedContributions = Object.entries(contributions)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 6);

  return (
    <section className="model-detail-panel">
      <header className="model-detail-panel__header">
        <span className="model-detail-panel__eyebrow">SUPPORTING MODEL DETAIL</span>
        <h2 className="model-detail-panel__title">Why the signal moved.</h2>
        <p className="model-detail-panel__subtitle">
          The headline read above is built from these tracked inputs. Missing values are shown as unavailable rather than estimated.
        </p>
      </header>

      <div className="model-detail-panel__columns">
        {/* STUFF */}
        <div className="model-detail-col">
          <span className="model-detail-col__title model-detail-col__title--stuff">STUFF</span>
          <ModelMetric
            label="Fastball Velocity"
            value={s.velo_mean_5 != null ? `${s.velo_mean_5.toFixed(1)} mph` : "Unavailable"}
            detail={veloDiff != null ? `Baseline ${s.seasonal_velo_baseline?.toFixed(1)} · trend ${fmtSigned(veloTrend, 2)} mph` : undefined}
            percent={s.velo_mean_5 != null && s.seasonal_velo_baseline != null ? clamp(s.velo_mean_5 / s.seasonal_velo_baseline) : undefined}
          />
          <ModelMetric
            label="Fastball Spin"
            value={s.spin_mean_5 != null ? `${Math.round(s.spin_mean_5)} rpm` : "Unavailable"}
            detail={s.seasonal_spin_baseline != null ? `Baseline ${Math.round(s.seasonal_spin_baseline)} ${spinDiff != null ? `${fmtSigned(spinDiff, 0)} rpm` : ""}` : undefined}
            percent={s.spin_mean_5 != null && s.seasonal_spin_baseline != null ? clamp(s.spin_mean_5 / s.seasonal_spin_baseline) : undefined}
          />
          <ModelMetric
            label="Swinging-Strike Rate"
            value={s.whiff_rate_15 != null ? fmtPct(s.whiff_rate_15) : "Unavailable"}
            detail={s.opponent_adjusted_whiff_drop != null ? `Opponent-adjusted change ${s.opponent_adjusted_whiff_drop.toFixed(2)}` : undefined}
            percent={s.whiff_rate_15 != null ? s.whiff_rate_15 : undefined}
            tone={s.opponent_adjusted_whiff_drop != null && s.opponent_adjusted_whiff_drop < -0.05 ? "warn" : "neutral"}
          />
          <ModelMetric
            label="Pitch Mix Drift"
            value={s.pitch_mix_drift_10 != null ? s.pitch_mix_drift_10.toFixed(2) : "Unavailable"}
            detail="How far recent pitch selection from expected mix."
            percent={s.pitch_mix_drift_10 != null ? scaledPercent(s.pitch_mix_drift_10, 0.5) : undefined}
          />
        </div>

        {/* COMMAND AND CONTACT */}
        <div className="model-detail-col">
          <span className="model-detail-col__title model-detail-col__title--command">COMMAND AND CONTACT</span>
          <ModelMetric
            label="Strike Rate"
            value={s.strike_rate_10 != null ? fmtPct(s.strike_rate_10) : "Unavailable"}
            detail="Last 10 pitches."
            percent={s.strike_rate_10 ?? undefined}
            tone={(s.strike_rate_10 ?? 1) < 0.55 ? "bad" : "good"}
          />
          <ModelMetric
            label="Called-Strike Rate"
            value={s.called_strike_rate_15 != null ? fmtPct(s.called_strike_rate_15) : "Unavailable"}
            detail="Called strikes over the recent command window."
            percent={s.called_strike_rate_15 ?? undefined}
            tone={(s.called_strike_rate_15 ?? 1) < 0.2 ? "warn" : "good"}
          />
          <ModelMetric
            label="Chase Rate Proxy"
            value={s.chase_proxy_rate_15 != null ? fmtPct(s.chase_proxy_rate_15) : "Unavailable"}
            detail="Hitters expanding against him."
            percent={s.chase_proxy_rate_15 ?? undefined}
            tone="good"
          />
          <ModelMetric
            label="Hard Contact"
            value={fmtPct(s.hard_contact_rate_15)}
            detail="Recent contact-quality pressure."
            percent={s.hard_contact_rate_15}
            tone={s.hard_contact_rate_15 > 0.35 ? "bad" : s.hard_contact_rate_15 > 0.2 ? "warn" : "good"}
          />
          <ModelMetric
            label="Zone Miss"
            value={s.zone_miss_distance_10 != null ? `${s.zone_miss_distance_10.toFixed(2)} ft` : "Unavailable"}
            detail={s.zone_miss_distance_5 != null ? `5-pitch window ${s.zone_miss_distance_5.toFixed(2)} ft.` : undefined}
            percent={scaledPercent(s.zone_miss_distance_10, 1.5)}
            tone={(s.zone_miss_distance_10 ?? 0) > 0.8 ? "warn" : "neutral"}
          />
          <ModelMetric
            label="Command Spread"
            value={s.location_dispersion_10 != null ? s.location_dispersion_10.toFixed(2) : "Unavailable"}
            detail={s.location_dispersion_5 != null ? `5-pitch spread ${s.location_dispersion_5.toFixed(2)}.` : undefined}
            percent={scaledPercent(s.location_dispersion_10, 2)}
            tone={(s.location_dispersion_10 ?? 0) > 1.2 ? "warn" : "neutral"}
          />
        </div>

        {/* DECISION CONTEXT */}
        <div className="model-detail-col">
          <span className="model-detail-col__title model-detail-col__title--context">DECISION CONTEXT</span>
          <ModelMetric
            label="Game Leverage"
            value={fmtNumber(snap.leverage_index, 2)}
            detail={snap.leverage_index > 1.5 ? "High-leverage window." : "Lower leverage window."}
            percent={scaledPercent(snap.leverage_index, 4)}
            tone={snap.leverage_index > 2 ? "gold" : "neutral"}
          />
          <ModelMetric
            label="Normalized Degradation"
            value={s.normalized_degradation_score != null ? fmtPct(s.normalized_degradation_score) : "Unavailable"}
            detail="Normalized against comparable MLB windows."
            percent={s.normalized_degradation_score ?? undefined}
            tone={(s.normalized_degradation_score ?? 0) > 0.6 ? "bad" : (s.normalized_degradation_score ?? 0) > 0.35 ? "warn" : "good"}
          />
          <ModelMetric
            label="Enhanced Degradation"
            value={s.enhanced_degradation_score != null ? s.enhanced_degradation_score.toFixed(2) : "Unavailable"}
            detail="Weighted model read after feature normalization."
            percent={scaledPercent(s.enhanced_degradation_score, 3)}
            tone={(s.enhanced_degradation_score ?? 0) > 1.5 ? "bad" : "neutral"}
          />
          <ModelMetric
            label="League Percentile"
            value={s.empirical_degradation_percentile != null ? fmtPct(s.empirical_degradation_percentile) : "Unavailable"}
            detail={s.empirical_degradation_sample_count != null ? `${s.empirical_degradation_sample_count} comparable windows.` : undefined}
            percent={s.empirical_degradation_percentile ?? undefined}
            tone={(s.empirical_degradation_percentile ?? 0) > 0.7 ? "bad" : "good"}
          />
          <ModelMetric
            label="Pitcher History Percentile"
            value={s.pitcher_empirical_degradation_percentile != null ? fmtPct(s.pitcher_empirical_degradation_percentile) : "Unavailable"}
            detail={s.pitcher_empirical_degradation_sample_count != null ? `${s.pitcher_empirical_degradation_sample_count} pitcher windows.` : undefined}
            percent={s.pitcher_empirical_degradation_percentile ?? undefined}
            tone={(s.pitcher_empirical_degradation_percentile ?? 0) > 0.7 ? "bad" : "good"}
          />
          <ModelMetric
            label="Decay Pressure"
            value={`${fmtNumber(s.inning_decay_factor, 2)} inning · ${fmtNumber(s.tto_decay_factor, 2)} TTO`}
            detail={s.batters_faced_in_game != null ? `${s.batters_faced_in_game} batters faced.` : undefined}
            percent={scaledPercent((s.inning_decay_factor ?? 0) + (s.tto_decay_factor ?? 0), 2)}
            tone={((s.inning_decay_factor ?? 0) + (s.tto_decay_factor ?? 0)) > 0.8 ? "bad" : "neutral"}
          />
        </div>
      </div>

      {sortedContributions.length > 0 && (
        <div className="model-detail-panel__contributors">
          <span className="model-detail-panel__contributors-label">TOP MODEL CONTRIBUTORS</span>
          <div className="model-detail-panel__pills">
            {sortedContributions.map(([key, value]) => (
              <span key={key} className={`contributor-pill ${value > 0 ? "contributor-pill--positive" : "contributor-pill--negative"}`}>
                {formatContributorLabel(key)} {fmtSigned(value, 2)}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ModelMetric({
  label,
  value,
  detail,
  percent,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  percent?: number;
  tone?: "neutral" | "good" | "warn" | "bad" | "gold";
}) {
  return (
    <div className="model-metric">
      <div className="model-metric__head">
        <span className="model-metric__label">{label}</span>
        <strong className="model-metric__value">{value}</strong>
      </div>
      {percent != null && (
        <div className={`model-metric__bar model-metric__bar--${tone}`}>
          <div className="model-metric__bar-fill" style={{ width: `${Math.round(clamp(percent) * 100)}%` }} />
        </div>
      )}
      {detail && <p className="model-metric__detail">{detail}</p>}
    </div>
  );
}

function formatContributorLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Tto", "TTO")
    .replace("Whiff", "Whiff")
    .replace("Velo", "Velocity");
}
