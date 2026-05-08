export type TrajectoryLabel =
  | "Rapid decay"
  | "Gradual fade"
  | "Stable"
  | "Settling/recovering"
  | "Volatile";

export type Recommendation =
  | "Hold starter"
  | "Prepare bullpen"
  | "Change pitcher"
  | "Planned tandem"
  | "Monitor only";

export type PitcherDecision = {
  id: string;
  team: string;
  pitcher: string;
  role: "Starter" | "Reliever" | string;
  opponent: string;
  inning: string;
  batterPocket: string;
  trajectoryLabel: TrajectoryLabel | "Pending";
  trajectoryIndex: number | null;
  trajectoryConfidence: number | null;
  decayVelocity: number | null;
  decayAcceleration: number | null;
  recoveryIndex: number | null;
  cliffProbability: number | null;
  currentDegradation: number | null;
  leverageIndex: number | null;
  decisionDelta: number | null;
  estimatedWinProbabilityDelta: number | null;
  starterValueNextWindow: number | null;
  alternativeValueNextWindow: number | null;
  starterRunsNextWindow: number | null;
  alternativeRunsNextWindow: number | null;
  transitionCost: number | null;
  bullpenUsageCost: number | null;
  projectedRunsSaved: number | null;
  modelImpliedRunsSaved?: number | null;
  dollarsProtected: number | null;
  recommendation: Recommendation;
  recommendationReason: string;
  stuffCurve: number[];
  topReasons: string[];
  calibrationStatus: string;
  calibrationBucket?: string | null;
  calibrationSampleCount?: number | null;
  calibrationFactor?: number | null;
  calibrationSource?: string | null;
};

export type BullpenOption = {
  id: string;
  name: string;
  role: string;
  availability: string;
  rss: number | null;
  matchupFit: number | null;
  usageCost: number | null;
  projectedRunsAllowed: number | null;
  netOptionScore: number | null;
};

export type AuditRow = {
  id: string;
  game: string;
  decision: string;
  timing: "Early" | "On time" | "Late" | "Held";
  projectedRunsSaved: number | null;
  modelImpliedRunsSaved?: number | null;
  estimatedWinProbabilityDelta: number | null;
  realizedDelayTax: number | null;
  actualRunsAfter: number | null;
  calibrationSampleCount?: number | null;
  calibrationFactor?: number | null;
  note: string;
};

export type TripleAConversionCandidate = {
  id: string;
  affiliate: string;
  parentClub: string;
  pitcher: string;
  currentRole: "Starter" | "Reliever";
  recommendedRole: "2-inning weapon" | "Bulk bridge" | "Pocket specialist" | "Watchlist" | "Mirage risk";
  shortWindowStuffPlus: number;
  secondWindowDecay: number;
  reliefConversionScore: number;
  projectedRunsSaved: number;
  confidence: number;
  mirageRisk: number;
  trackedPitches: number;
  note: string;
};

export type RunSavingSummary = {
  generatedAt: string | null;
  league: "mlb" | "triple_a";
  dataMode: string;
  calibrationStatus: string;
  decisionCount: number;
  bullpenOptionCount: number;
  auditCount: number;
  tripleAConversionCandidateCount: number;
  sourceSnapshotCount: number | null;
  sourceGameCount: number | null;
  calibrationWindowCount?: number | null;
  calibrationBucketCount?: number | null;
};

export type RunSavingBoardPayload = {
  summary: RunSavingSummary;
  decisions: PitcherDecision[];
  bullpenOptions: BullpenOption[];
  audits: AuditRow[];
  tripleAConversionCandidates: TripleAConversionCandidate[];
  calibration?: {
    source: string;
    generatedAt: string | null;
    windowCount: number;
    bucketCount: number;
  };
};
