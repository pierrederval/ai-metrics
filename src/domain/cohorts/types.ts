export interface CohortRow {
  agent: string;
  label: string;
  attributed: boolean;
  pullRequestCount: number;
  firstPass: { value: number | null; known: number; unknown: number };
  averageAttempts: number | null;
  clean: { value: number | null; known: number; unknown: number };
}

export interface CohortTable {
  /** Attributed cohorts sorted by count descending; unattributed cohort always last. */
  rows: CohortRow[];
  totalPullRequests: number;
  attributedPullRequests: number;
}
