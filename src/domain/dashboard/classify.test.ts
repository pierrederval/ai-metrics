import { describe, expect, test } from 'vitest';
import type { PrEvidence, ReviewEvent, WorkflowAttempt } from './types';
import { classifyMergedPr, classifyWorkflow } from './classify';

const cutoff = '2026-09-02T00:00:00Z';

const attempt = (
  number: number,
  conclusion: string | null,
  overrides: Partial<WorkflowAttempt> = {},
): WorkflowAttempt => ({
  repositoryId: 'repository',
  runId: 'workflow',
  attempt: number,
  headSha: 'merge-head',
  status: conclusion === null ? 'in_progress' : 'completed',
  conclusion,
  startedAt: `2026-09-01T0${number}:00:00Z`,
  completedAt: conclusion === null ? null : `2026-09-01T0${number}:10:00Z`,
  ...overrides,
});

const review = (
  id: string,
  reviewerId: string,
  state: string,
  occurredAt: string,
  overrides: Partial<ReviewEvent> = {},
): ReviewEvent => ({
  id,
  reviewerId,
  state,
  commitSha: 'merge-head',
  occurredAt,
  kind: 'review',
  dismissedReviewId: null,
  ...overrides,
});

const evidence = (overrides: Partial<PrEvidence> = {}): PrEvidence => ({
  id: 'pr',
  repositoryId: 'repository',
  openedAt: '2026-08-31T00:00:00Z',
  mergedAt: '2026-09-01T12:00:00Z',
  mergeHeadSha: 'merge-head',
  reviewExpected: false,
  ciExpected: false,
  chronologyComplete: false,
  reviewsComplete: false,
  ciComplete: false,
  reviews: [],
  attempts: [],
  ...overrides,
});

describe('classifyWorkflow', () => {
  test.each<{
    name: string;
    attempts: WorkflowAttempt[];
    want: ReturnType<typeof classifyWorkflow>;
  }>([
    { name: 'first success', attempts: [attempt(1, 'success')], want: 'first-pass' },
    {
      name: 'failure then successful rerun',
      attempts: [attempt(1, 'failure'), attempt(2, 'success')],
      want: 'recovered',
    },
    {
      name: 'repeated failure',
      attempts: [attempt(1, 'failure'), attempt(2, 'failure')],
      want: 'failed',
    },
    {
      name: 'later pending rerun',
      attempts: [attempt(1, 'failure'), attempt(2, null)],
      want: 'pending',
    },
    { name: 'cancelled', attempts: [attempt(1, 'cancelled')], want: 'cancelled' },
    { name: 'skipped', attempts: [attempt(1, 'skipped')], want: 'skipped' },
    { name: 'neutral', attempts: [attempt(1, 'neutral')], want: 'neutral' },
    { name: 'missing attempt one', attempts: [attempt(2, 'success')], want: 'unknown' },
    {
      name: 'attempt started after cutoff',
      attempts: [
        attempt(1, 'failure'),
        attempt(2, 'success', {
          startedAt: '2026-09-02T01:00:00Z',
          completedAt: '2026-09-02T01:10:00Z',
        }),
      ],
      want: 'failed',
    },
    {
      name: 'attempt completed after cutoff',
      attempts: [
        attempt(1, 'failure'),
        attempt(2, 'success', { completedAt: '2026-09-02T01:10:00Z' }),
      ],
      want: 'pending',
    },
  ])('$name', ({ attempts, want }) => {
    expect(classifyWorkflow(attempts, cutoff)).toBe(want);
  });
});

describe('classifyMergedPr', () => {
  test.each<{
    name: string;
    evidence: PrEvidence;
    want: ReturnType<typeof classifyMergedPr>;
  }>([
    {
      name: 'review-only approval',
      evidence: evidence({
        reviewExpected: true,
        chronologyComplete: true,
        reviewsComplete: true,
        reviews: [review('approval', 'alice', 'APPROVED', '2026-09-01T10:00:00Z')],
      }),
      want: 'first-pass',
    },
    {
      name: 'CI-only first success',
      evidence: evidence({ ciExpected: true, ciComplete: true, attempts: [attempt(1, 'success')] }),
      want: 'first-pass',
    },
    {
      name: 'review and CI both pass',
      evidence: evidence({
        reviewExpected: true,
        ciExpected: true,
        chronologyComplete: true,
        reviewsComplete: true,
        ciComplete: true,
        reviews: [review('approval', 'alice', 'approved', '2026-09-01T10:00:00Z')],
        attempts: [attempt(1, 'success')],
      }),
      want: 'first-pass',
    },
    {
      name: 'changes requested followed by approval is not first pass',
      evidence: evidence({
        reviewExpected: true,
        chronologyComplete: true,
        reviewsComplete: true,
        reviews: [
          review('changes', 'alice', 'changes_requested', '2026-09-01T09:00:00Z'),
          review('approval', 'alice', 'approved', '2026-09-01T10:00:00Z'),
        ],
      }),
      want: 'not-first-pass',
    },
    {
      name: 'ordinary comments do not spoil an approval',
      evidence: evidence({
        reviewExpected: true,
        chronologyComplete: true,
        reviewsComplete: true,
        reviews: [
          review('comment', 'bob', 'commented', '2026-09-01T09:00:00Z'),
          review('approval', 'alice', 'approved', '2026-09-01T10:00:00Z'),
        ],
      }),
      want: 'first-pass',
    },
    {
      name: 'dismissed approval does not apply at merge',
      evidence: evidence({
        reviewExpected: true,
        chronologyComplete: true,
        reviewsComplete: true,
        reviews: [
          review('approval', 'alice', 'approved', '2026-09-01T09:00:00Z'),
          review('dismissal-event', 'alice', 'dismissed', '2026-09-01T10:00:00Z', {
            kind: 'dismissed',
            dismissedReviewId: 'approval',
          }),
        ],
      }),
      want: 'not-first-pass',
    },
    {
      name: 'dismissal targets its review identity rather than a newer approval',
      evidence: evidence({
        reviewExpected: true,
        chronologyComplete: true,
        reviewsComplete: true,
        reviews: [
          review('old-approval', 'alice', 'approved', '2026-09-01T08:00:00Z'),
          review('new-approval', 'alice', 'approved', '2026-09-01T09:00:00Z'),
          review('dismissal-event', 'alice', 'dismissed', '2026-09-01T10:00:00Z', {
            kind: 'dismissed',
            dismissedReviewId: 'old-approval',
          }),
        ],
      }),
      want: 'first-pass',
    },
    { name: 'neither review nor CI applies', evidence: evidence(), want: 'ineligible' },
    {
      name: 'missing review chronology',
      evidence: evidence({
        reviewExpected: true,
        reviewsComplete: true,
        reviews: [review('approval', 'alice', 'approved', '2026-09-01T10:00:00Z')],
      }),
      want: 'unknown',
    },
    {
      name: 'post-merge CI success cannot change the merge outcome',
      evidence: evidence({
        ciExpected: true,
        ciComplete: true,
        attempts: [
          attempt(1, 'success', {
            startedAt: '2026-09-01T13:00:00Z',
            completedAt: '2026-09-01T13:10:00Z',
          }),
        ],
      }),
      want: 'not-first-pass',
    },
    {
      name: 'post-merge approval cannot change the merge outcome',
      evidence: evidence({
        reviewExpected: true,
        chronologyComplete: true,
        reviewsComplete: true,
        reviews: [review('approval', 'alice', 'approved', '2026-09-01T13:00:00Z')],
      }),
      want: 'not-first-pass',
    },
    {
      name: 'an unresolved changes request blocks another reviewer approval',
      evidence: evidence({
        reviewExpected: true,
        chronologyComplete: true,
        reviewsComplete: true,
        reviews: [
          review('changes', 'bob', 'changes_requested', '2026-09-01T09:00:00Z'),
          review('approval', 'alice', 'approved', '2026-09-01T10:00:00Z'),
        ],
      }),
      want: 'not-first-pass',
    },
    {
      name: 'failure on an earlier revision prevents first pass',
      evidence: evidence({
        ciExpected: true,
        ciComplete: true,
        attempts: [
          attempt(1, 'failure', { runId: 'old-workflow', headSha: 'old-head' }),
          attempt(1, 'success', { runId: 'merge-workflow', headSha: 'merge-head' }),
        ],
      }),
      want: 'not-first-pass',
    },
    {
      name: 'unknown attempt history cannot establish first pass',
      evidence: evidence({ ciExpected: true, attempts: [attempt(1, 'success')] }),
      want: 'unknown',
    },
    {
      name: 'CI success must belong to the merge head rather than the merge commit',
      evidence: evidence({
        ciExpected: true,
        ciComplete: true,
        mergeHeadSha: 'pull-request-head',
        attempts: [attempt(1, 'success', { headSha: 'merge-commit' })],
      }),
      want: 'not-first-pass',
    },
  ])('$name', ({ evidence: fixture, want }) => {
    expect(classifyMergedPr(fixture)).toBe(want);
  });
});
