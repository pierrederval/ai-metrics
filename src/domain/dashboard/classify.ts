import type { CiOutcome, PrEvidence, PrOutcome, WorkflowAttempt } from './types';

type HistoricalAttempt = WorkflowAttempt & { pendingAtCutoff: boolean };

const failedConclusions = new Set([
  'action_required',
  'failure',
  'stale',
  'startup_failure',
  'timed_out',
]);

function timestamp(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function historicalAttempts(attempts: WorkflowAttempt[], asOf: string): HistoricalAttempt[] | null {
  const cutoff = timestamp(asOf);
  if (cutoff === null) return null;

  const historical: HistoricalAttempt[] = [];
  for (const attempt of attempts) {
    const startedAt = timestamp(attempt.startedAt);
    const completedAt = timestamp(attempt.completedAt);

    if (attempt.startedAt !== null && startedAt === null) return null;
    if (attempt.completedAt !== null && completedAt === null) return null;
    if (startedAt !== null && startedAt > cutoff) continue;

    if (startedAt === null && completedAt === null) return null;
    if (startedAt === null && completedAt !== null && completedAt > cutoff) return null;

    historical.push({
      ...attempt,
      pendingAtCutoff: completedAt === null || completedAt > cutoff,
    });
  }

  return historical.sort((left, right) => left.attempt - right.attempt);
}

export function classifyWorkflow(attempts: WorkflowAttempt[], asOf: string): CiOutcome {
  const historical = historicalAttempts(attempts, asOf);
  if (historical === null || historical.length === 0) return 'unknown';

  const latest = historical.at(-1)!;
  if (latest.pendingAtCutoff || latest.status.toLowerCase() !== 'completed') return 'pending';

  const conclusion = latest.conclusion?.toLowerCase();
  if (conclusion === 'success') {
    if (latest.attempt === 1 && historical.some((item) => item.attempt === 1)) {
      return 'first-pass';
    }
    if (!historical.some((item) => item.attempt === 1)) return 'unknown';
    return 'recovered';
  }
  if (conclusion !== undefined && failedConclusions.has(conclusion)) return 'failed';
  if (conclusion === 'cancelled' || conclusion === 'canceled') return 'cancelled';
  if (conclusion === 'skipped') return 'skipped';
  if (conclusion === 'neutral') return 'neutral';
  return 'unknown';
}

type DimensionResult = 'first-pass' | 'not-first-pass' | 'unknown';
type FormalReview = {
  id: string;
  reviewerId: string;
  state: 'approved' | 'changes_requested';
  occurredAt: number;
};

function classifyReview(evidence: PrEvidence, mergedAt: number): DimensionResult {
  if (!evidence.reviewsComplete || !evidence.chronologyComplete) return 'unknown';

  const reviewsBeforeMerge = evidence.reviews
    .map((event) => ({ event, occurredAt: timestamp(event.occurredAt) }))
    .filter(({ occurredAt }) => occurredAt !== null && occurredAt <= mergedAt)
    .sort((left, right) => {
      const timeDifference = left.occurredAt! - right.occurredAt!;
      return timeDifference === 0 ? left.event.id.localeCompare(right.event.id) : timeDifference;
    });
  if (evidence.reviews.some((event) => timestamp(event.occurredAt) === null)) return 'unknown';

  const formalReviews = new Map<string, FormalReview>();
  const dismissed = new Set<string>();
  let sawChangesRequested = false;

  for (const { event, occurredAt } of reviewsBeforeMerge) {
    if (event.kind === 'dismissed') {
      if (event.dismissedReviewId === null) return 'unknown';
      dismissed.add(event.dismissedReviewId);
      continue;
    }
    if (event.kind !== 'review') continue;

    const state = event.state.toLowerCase();
    if (state !== 'approved' && state !== 'changes_requested') continue;
    if (state === 'changes_requested') sawChangesRequested = true;
    formalReviews.set(event.id, {
      id: event.id,
      reviewerId: event.reviewerId,
      state,
      occurredAt: occurredAt!,
    });
  }

  for (const reviewId of dismissed) {
    if (!formalReviews.has(reviewId)) return 'unknown';
  }

  const latestByReviewer = new Map<string, FormalReview>();
  for (const formalReview of formalReviews.values()) {
    if (dismissed.has(formalReview.id)) continue;
    const current = latestByReviewer.get(formalReview.reviewerId);
    if (
      current === undefined ||
      formalReview.occurredAt > current.occurredAt ||
      (formalReview.occurredAt === current.occurredAt && formalReview.id > current.id)
    ) {
      latestByReviewer.set(formalReview.reviewerId, formalReview);
    }
  }

  const decisions = [...latestByReviewer.values()];
  const hasApproval = decisions.some((decision) => decision.state === 'approved');
  const hasUnresolvedChanges = decisions.some((decision) => decision.state === 'changes_requested');
  if (!hasApproval || hasUnresolvedChanges) return 'not-first-pass';
  return sawChangesRequested ? 'not-first-pass' : 'first-pass';
}

function classifyCi(evidence: PrEvidence, mergedAt: string): DimensionResult {
  if (!evidence.ciComplete || evidence.mergeHeadSha === null) return 'unknown';

  const historical = historicalAttempts(evidence.attempts, mergedAt);
  if (historical === null) return 'unknown';

  const mergeHeadAttempts = historical.filter(
    (attempt) => attempt.headSha === evidence.mergeHeadSha,
  );
  const attemptsByRun = new Map<string, WorkflowAttempt[]>();
  for (const attempt of mergeHeadAttempts) {
    const key = `${attempt.repositoryId}\u0000${attempt.runId}`;
    const run = attemptsByRun.get(key) ?? [];
    run.push(attempt);
    attemptsByRun.set(key, run);
  }

  if (attemptsByRun.size === 0) return 'not-first-pass';

  const outcomes = [...attemptsByRun.values()].map((attempts) =>
    classifyWorkflow(attempts, mergedAt),
  );
  if (outcomes.includes('unknown')) return 'unknown';
  if (outcomes.some((outcome) => outcome !== 'first-pass')) return 'not-first-pass';

  const earlierRevisionSpoiledFirstPass = historical.some(
    (attempt) =>
      attempt.headSha !== evidence.mergeHeadSha &&
      (attempt.attempt > 1 || failedConclusions.has(attempt.conclusion?.toLowerCase() ?? '')),
  );
  return earlierRevisionSpoiledFirstPass ? 'not-first-pass' : 'first-pass';
}

export function classifyMergedPr(evidence: PrEvidence): PrOutcome {
  const mergedAt = timestamp(evidence.mergedAt);
  if (mergedAt === null) return 'unknown';

  if (evidence.reviewExpected === false && evidence.ciExpected === false) return 'ineligible';
  if (evidence.reviewExpected === null || evidence.ciExpected === null) return 'unknown';

  const dimensions: DimensionResult[] = [];
  if (evidence.reviewExpected) dimensions.push(classifyReview(evidence, mergedAt));
  if (evidence.ciExpected) dimensions.push(classifyCi(evidence, evidence.mergedAt!));

  if (dimensions.includes('not-first-pass')) return 'not-first-pass';
  if (dimensions.includes('unknown')) return 'unknown';
  return 'first-pass';
}
