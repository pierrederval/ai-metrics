export type CiOutcome =
  | 'first-pass'
  | 'recovered'
  | 'failed'
  | 'pending'
  | 'cancelled'
  | 'skipped'
  | 'neutral'
  | 'unknown';

export type PrOutcome = 'first-pass' | 'not-first-pass' | 'ineligible' | 'unknown';

export type Range = { start: string; endExclusive: string; days: number };

export type WorkflowAttempt = {
  repositoryId: string;
  runId: string;
  attempt: number;
  headSha: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Mutable GitHub metadata; never an exact completion timestamp. */
  sourceUpdatedAt?: string | null;
  /** Conservative bound: the first time a terminal snapshot was observed. */
  terminalObservedAt?: string | null;
};

export type ReviewEvent = {
  id: string;
  reviewerId: string;
  state: string;
  commitSha: string | null;
  occurredAt: string;
  kind: 'review' | 'requested' | 'dismissed' | 'request-removed';
  dismissedReviewId: string | null;
};

export type PrEvidence = {
  id: string;
  repositoryId: string;
  openedAt: string;
  mergedAt: string | null;
  mergeHeadSha: string | null;
  reviewExpected: boolean | null;
  ciExpected: boolean | null;
  chronologyComplete: boolean;
  reviewsComplete: boolean;
  ciComplete: boolean;
  reviews: ReviewEvent[];
  attempts: WorkflowAttempt[];
  sourceUpdatedAt?: string | null;
  provenance?: { chronology?: string[]; reviews?: string[]; ci?: string[] };
};

export type Rate = {
  numerator: number;
  denominator: number;
  excluded: number;
  /** Percentage, on a 0–100 scale; null means no denominator. */
  value: number | null;
};

export type Day = {
  date: string;
  merged: number;
  /** Chart value: zero only with known coverage; raw merged remains additive. */
  mergedValue: number | null;
  firstPass: Rate;
  ci: Record<CiOutcome, number>;
  prOutcomes: Record<PrOutcome, number>;
  coverage: 'complete' | 'partial' | 'unknown';
};

export type DashboardData = {
  range: Range;
  days: Day[];
  previousDays: Day[];
  previousRange: Range;
  totals: MetricTotals;
  previousTotals: MetricTotals;
  comparisons: Comparisons;
  coverageReasons: CoverageReason[];
  previousCoverageReasons: CoverageReason[];
  undatedCi: Record<CiOutcome, number>;
  previousUndatedCi: Record<CiOutcome, number>;
  timezone: 'UTC';
  /** Inclusive discovered picker bounds, extended by visible evidence collection;
   * not a completeness claim. Unknown disables custom history choice. */
  collectionBounds: {
    from: string | null;
    to: string | null;
    source: 'backfill-discovery' | 'unknown';
  };
  visiblePrCount: number;
  coverage: 'complete' | 'partial' | 'unknown';
};

export type CoverageReason =
  | 'import-incomplete'
  | 'history-undiscovered'
  | 'outside-collected-history'
  | 'free-history-limit'
  | 'evidence-incomplete'
  | 'unknown-workflow-date'
  | 'no-repositories'
  | 'current-day';
export type MetricTotals = {
  merged: number;
  firstPass: Rate;
  prOutcomes: Record<PrOutcome, number>;
  ci: Record<CiOutcome, number>;
  ciSuccess: Rate;
  ciRecovered: Rate;
};
export type PeriodAggregate = {
  days: Day[];
  totals: MetricTotals;
  /** Excluded from chart/KPI totals: no defensible completion day in this period. */
  undatedCi: Record<CiOutcome, number>;
  coverageReasons: CoverageReason[];
};
export type Comparisons = {
  mergedPercent: number | null;
  firstPassPoints: number | null;
  ciSuccessPoints: number | null;
};
