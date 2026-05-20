import type { PitchingReplayEntry } from "../types";
import { fmtNumber, statusLabel } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

type RelieverSummary = {
  name: string;
  pitcherId: string;
  pitchCount: number;
  entries: PitchingReplayEntry[];
  peakStatus: string;
  peakIdx: number;
};

function groupRelievers(entries: PitchingReplayEntry[], starterPitcherId: string): RelieverSummary[] {
  const map = new Map<string, RelieverSummary>();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const pid = e.snapshot.pitcher_id;
    if (pid === starterPitcherId) continue;
    let existing = map.get(pid);
    if (!existing) {
      existing = { name: e.snapshot.pitcher_name, pitcherId: pid, pitchCount: 0, entries: [], peakStatus: "STAY", peakIdx: i };
      map.set(pid, existing);
    }
    existing.entries.push(e);
    existing.pitchCount++;
    const entryStatusRank = statusRankLocal(e.recommendation.status);
    if (entryStatusRank > statusRankLocal(existing.peakStatus)) {
      existing.peakStatus = statusLabel(e.recommendation.status);
      existing.peakIdx = i;
    }
  }
  return Array.from(map.values());
}

function statusRankLocal(s: string): number {
  const label = statusLabel(s);
  if (label === "DISTRESS") return 4;
  if (label === "PULL NOW") return 3;
  if (label === "PREP") return 2;
  if (label === "WATCH") return 1;
  return 0;
}

type Props = {
  entries: PitchingReplayEntry[];
  starterPitcherId: string;
};

export function BullpenOutcomes({ entries, starterPitcherId }: Props) {
  const relievers = groupRelievers(entries, starterPitcherId);
  if (relievers.length === 0) return null;

  return (
    <section className="bullpen-outcomes">
      <header className="bullpen-outcomes__header">
        <span className="bullpen-outcomes__eyebrow">RELIEVER STRESS SIGNAL</span>
        <h2 className="bullpen-outcomes__title">Bullpen outcomes from the same game.</h2>
        <p className="bullpen-outcomes__subtitle">
          Relievers are now available as their own pitch-by-pitch RSS replay stream when the finalized artifact includes bullpen entries.
        </p>
      </header>

      <div className="bullpen-outcomes__list">
        {relievers.map((rel) => {
          const lastEntry = rel.entries[rel.entries.length - 1];
          const rssComponents = lastEntry?.snapshot.starter_state.normalized_component_scores ?? {};
          return (
            <div key={rel.pitcherId} className="reliever-outcome-card">
              <div className="reliever-outcome-card__info">
                <strong>{rel.name}</strong>
                <span className="reliever-outcome-card__stats">
                  {rel.pitchCount} pitches
                </span>
              </div>
              <div className="reliever-outcome-card__status">
                <StatusBadge status={rel.peakStatus} size="sm" />
                <span className="reliever-outcome-card__timing">
                  {statusLabel(rel.peakStatus)} at pitch {rel.peakIdx + 1}.
                </span>
              </div>
              {Object.keys(rssComponents).length > 0 && (
                <div className="reliever-outcome-card__rss">
                  {Object.entries(rssComponents).slice(0, 5).map(([key, val]) => (
                    <div key={key} className="rss-chip">
                      <span className="rss-chip__label">{formatRssLabel(key)}</span>
                      <strong className="rss-chip__value">{fmtNumber(val as number, 2)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatRssLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace("Tto", "TTO");
}
