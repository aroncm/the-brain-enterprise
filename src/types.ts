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

export type SourceStatus = {
  available: boolean;
  source: string;
  status: string;
  notes?: string;
};

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
  sourceStatus?: Record<string, SourceStatus>;
};

export type BullpenOption = {
  id: string;
  name: string;
  role: string | null;
  roleSource?: string | null;
  availability: string;
  availabilitySource?: string | null;
  managerAvailabilityProbability?: number | null;
  managerAvailabilityStatus?: string | null;
  managerAvailabilitySource?: string | null;
  daysRest?: number | null;
  pitchesLast3Days?: number | null;
  appearancesLast3Days?: number | null;
  rss: number | null;
  rssSource?: string | null;
  matchupFit: number | null;
  usageCost: number | null;
  projectedRunsAllowed: number | null;
  netOptionScore: number | null;
  sourceStatus?: Record<string, SourceStatus>;
};

export type AuditRow = {
  id: string;
  game: string;
  decision: string;
  timing: "Early" | "On time" | "Late" | "Held";
  pitcher?: string | null;
  team?: string | null;
  opponent?: string | null;
  inning?: string | null;
  leverageIndex?: number | null;
  actualDecision?: string | null;
  recommendedDecision?: string | null;
  bestAlternative?: string | null;
  opportunityDescription?: string | null;
  counterfactualSummary?: string | null;
  starterValueNextWindow?: number | null;
  alternativeValueNextWindow?: number | null;
  starterRunsNextWindow?: number | null;
  alternativeRunsNextWindow?: number | null;
  projectedRunsSaved: number | null;
  modelImpliedRunsSaved?: number | null;
  estimatedWinProbabilityDelta: number | null;
  realizedDelayTax: number | null;
  actualRunsAfter: number | null;
  calibrationSampleCount?: number | null;
  calibrationFactor?: number | null;
  note: string;
  sourceStatus?: Record<string, SourceStatus>;
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
  dataCoverage?: {
    decisionWindows?: number;
    calibratedPreventableRunWindows?: number;
    modelImpliedRunWindows?: number;
    bullpenOptions?: number;
    bullpenOptionsWithRole?: number;
    bullpenOptionsWithManagerAvailability?: number;
    bullpenOptionsWithExplicitRss?: number;
    auditRows?: number;
    tripleAConversionCandidates?: number;
  };
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

export type EnterpriseGameSummary = {
  game_id: string;
  date: string;
  home_team: string;
  away_team: string;
  matchup?: string;
  snapshots?: number;
  stay_count?: number;
  watch_count?: number;
  prep_count?: number;
  pull_now_count?: number;
  generated_at?: string | null;
};

export type EnterpriseGamesPayload = {
  summary: {
    generatedAt: string | null;
    league: "mlb" | "triple_a";
    team?: string | null;
    gameCount: number;
    sourceGameCount?: number | null;
  };
  games: EnterpriseGameSummary[];
};

export type PitcherGameLog = {
  gameId: string;
  date: string;
  matchup: string;
  opponent: string;
  innings: number[];
  role?: string | null;
  roleSource?: string | null;
  roleStatus?: string | null;
  teamAppearanceOrder?: number | null;
  officialInningsPitchedText?: string | null;
  officialInningsPitched?: number | null;
  officialPitchCount?: number | null;
  pitchWindows: number;
  maxPitchCount: number;
  peakStatus: string;
  maxDegradation: number | null;
  avgDegradation: number | null;
  stuffCurve: number[];
  projectedRunsSaved: number | null;
};

export type PitcherProfile = {
  pitcherId?: string | null;
  pitcher: string;
  team: string;
  primaryRole?: string | null;
  roleSource?: string | null;
  roleCounts?: Record<string, number>;
  appearances: number;
  pitchWindows: number;
  maxDegradation: number | null;
  avgDegradation: number | null;
  pullNowGames: number;
  prepOrWatchGames: number;
  projectedRunsSaved: number | null;
  gameLog: PitcherGameLog[];
};

export type PitcherProfilesPayload = {
  summary: {
    generatedAt: string | null;
    league: "mlb" | "triple_a";
    team?: string | null;
    year?: string | null;
    profileCount: number;
    gameCount: number;
    calibrationWindowCount?: number | null;
  };
  profiles: PitcherProfile[];
};

export type PitchingReplayEntry = {
  snapshot: {
    pitch_id: string;
    pitcher_id: string;
    pitcher_name: string;
    batting_team: string;
    fielding_team: string;
    inning: number;
    half: "top" | "bottom" | string;
    outs: number;
    base_state: string;
    score_diff: number;
    home_score?: number | null;
    away_score?: number | null;
    leverage_index: number;
    px?: number | null;
    pz?: number | null;
    pitch_type?: string | null;
    release_speed?: number | null;
    starter_state: {
      pitch_count_in_game: number;
      official_pitch_count_in_game?: number | null;
      replay_pitch_count_in_game?: number | null;
      times_through_order: number;
      base_state: string;
      leverage_index: number;
      velo_mean_5: number;
      seasonal_velo_baseline: number;
      spin_mean_5?: number | null;
      seasonal_spin_baseline?: number | null;
      location_dispersion_10: number;
      zone_miss_distance_10: number;
      hard_contact_rate_15: number;
      whiff_rate_15?: number | null;
      ball_rate_10?: number | null;
      pitch_mix_drift_10?: number | null;
      degradation_score: number;
    };
  };
  recommendation: {
    status: string;
    confidence: number;
    recommended_reliever_id?: string | null;
    recommended_reliever_name?: string | null;
    starter_value_next_3_hitters?: number;
    best_reliever_value_next_3_hitters?: number;
    decision_delta?: number;
    estimated_win_probability_delta?: number;
    starter_risk_level?: string;
    top_reason_codes: string[];
  };
  top_candidates?: Array<{
    player_id: string;
    player_name: string;
    bullpen_role: string;
    available: boolean;
    net_option_score: number;
    direct_matchup_fit: number;
    usage_cost: number;
  }>;
};

export type PitchingReplayResponse = {
  game: {
    game_id: string;
    date: string;
    home_team: string;
    away_team: string;
  };
  summary: {
    snapshots: number;
    stay_count: number;
    watch_count: number;
    prep_count: number;
    pull_now_count: number;
    actual_changes_within_next_pocket: number;
  };
  entries: PitchingReplayEntry[];
};

export type PitchingAuditWindow = Record<string, unknown> & {
  game_id?: string | number | null;
  game_pk?: string | number | null;
  game_date?: string | null;
  matchup?: string | null;
  team?: string | null;
  pitcher_name?: string | null;
  pitcher?: string | null;
  inning?: number | string | null;
  half?: string | null;
  status?: string | null;
  leverage_index?: number | null;
  projected_runs_saved?: number | null;
  estimated_runs_saved?: number | null;
  estimated_win_probability_delta?: number | null;
  actual_outcome?: string | null;
  note?: string | null;
  counterfactual_summary?: string | null;
  opportunity_description?: string | null;
  starter?: Record<string, unknown> | null;
  top_candidate?: Record<string, unknown> | null;
  recommendation?: Record<string, unknown> | null;
};

export type PitchingAuditSummaryPayload = {
  source_summary?: {
    generated_at?: string | null;
    active_filters?: Record<string, unknown>;
  };
  window_summary?: Record<string, unknown>;
  window_filtered_counts?: Record<string, number>;
  delayed_change_windows?: PitchingAuditWindow[];
  missed_hook_windows?: PitchingAuditWindow[];
  justified_stay_windows?: PitchingAuditWindow[];
  high_leverage_holdouts?: PitchingAuditWindow[];
};

export type PitchingRecapPitcher = {
  pitcher_id: string;
  pitcher_name: string;
  team: string;
  role?: "Starter" | "Reliever" | string;
  pitch_count: number;
  innings_pitched: number;
  runs_allowed_total: number;
  rss_score?: number | null;
  rss_label?: string | null;
  first_alert_status?: string | null;
  first_alert_inning?: number | null;
  first_alert_pitch_count?: number | null;
  first_pull_now_inning: number | null;
  first_pull_now_pitch_count: number | null;
  runs_allowed_after_first_alert?: number | null;
  runs_allowed_after_signal: number | null;
  actual_exit_inning?: number | null;
  actual_exit_pitch_count?: number | null;
  missed_hook: boolean;
  peak_status: string;
  status_timeline: { inning: number; peak_status: string }[];
};

export type PitchingGameRecap = {
  game_id?: string | null;
  date?: string | null;
  home_team: string;
  away_team: string;
  final_home_score?: number | null;
  final_away_score?: number | null;
  starters: PitchingRecapPitcher[];
  score_timeline: Array<{
    inning: number;
    half: string;
    runs_scored_against_pitcher: number;
  }>;
};

export type PitchingRecapSettings = {
  league?: "mlb" | "triple_a";
  recap_teams: string[];
  auto_email_teams?: string[];
  finalized_email_teams?: string[];
  enabled_teams?: string[];
  team_recipients: Record<string, string[]>;
  email_provider?: string;
  shared_email_configured?: boolean;
};

export type PitchingRecapEmailResponse = {
  league: "mlb" | "triple_a";
  team: string;
  game_id: string;
  subject?: string;
  recap: PitchingGameRecap;
  sent?: boolean;
  sent_to?: string[];
  failed_recipients?: string[];
  recipients?: string[];
};
