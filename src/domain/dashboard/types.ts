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
  value: number | null;
};

export type Day = {
  date: string;
  merged: number;
  firstPass: Rate;
  ci: Record<CiOutcome, number>;
  coverage: 'complete' | 'partial' | 'unknown';
};

export type DashboardData = {
  range: Range;
  days: Day[];
  previousDays: Day[];
  visiblePrCount: number;
  coverage: 'complete' | 'partial' | 'unknown';
};
