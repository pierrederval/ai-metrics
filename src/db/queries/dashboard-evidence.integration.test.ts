import { beforeAll, beforeEach, afterAll, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, closeDb } from '..';
import * as s from '../schema';
import { persistDashboardEvidence, loadDashboardEvidence } from './dashboard-evidence';
import { classifyMergedPr } from '../../domain/dashboard/classify';
import type { PrEvidence } from '../../domain/dashboard/types';
const evidence: PrEvidence = {
  id: 'evidence-pr',
  repositoryId: 'evidence-repo',
  openedAt: '2026-01-01T00:00:00Z',
  mergedAt: '2026-01-02T12:00:00Z',
  mergeHeadSha: 'head',
  reviewExpected: true,
  ciExpected: true,
  chronologyComplete: true,
  reviewsComplete: true,
  ciComplete: true,
  sourceUpdatedAt: '2026-01-03T00:00:00Z',
  provenance: { reviews: ['timeline'], ci: ['attempt-api'] },
  reviews: [
    {
      id: '41',
      reviewerId: '7',
      state: 'approved',
      commitSha: 'head',
      occurredAt: '2026-01-02T01:00:00Z',
      kind: 'review',
      dismissedReviewId: null,
    },
    {
      id: 'timeline:1',
      reviewerId: '7',
      state: 'dismissed',
      commitSha: null,
      occurredAt: '2026-01-03T00:00:00Z',
      kind: 'dismissed',
      dismissedReviewId: '41',
    },
  ],
  attempts: [
    {
      repositoryId: 'evidence-repo',
      runId: '10',
      attempt: 1,
      headSha: 'head',
      status: 'completed',
      conclusion: 'success',
      startedAt: '2026-01-02T00:00:00Z',
      completedAt: null,
      sourceUpdatedAt: '2026-01-02T00:05:00Z',
      terminalObservedAt: '2026-01-02T00:10:00Z',
    },
  ],
};
beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });
  await db()
    .insert(s.installations)
    .values({
      id: 'evidence-install',
      githubInstallationId: 'evidence-install',
      accountLogin: 'test',
      accountType: 'User',
    })
    .onConflictDoNothing();
  await db()
    .insert(s.repositories)
    .values({
      id: evidence.repositoryId,
      installationId: 'evidence-install',
      githubRepositoryId: 'evidence-repo',
      owner: 'test',
      name: 'evidence',
      defaultBranch: 'main',
      isPrivate: true,
    })
    .onConflictDoNothing();
  await db()
    .insert(s.pullRequests)
    .values({
      id: evidence.id,
      repositoryId: evidence.repositoryId,
      githubPrId: evidence.id,
      githubPrNumber: 1,
      title: 'Evidence',
      state: 'closed',
      authorLogin: 'test',
      headSha: 'head',
      baseSha: 'base',
      openedAt: new Date(evidence.openedAt),
      mergedAt: new Date(evidence.mergedAt!),
      sourceUpdatedAt: new Date(evidence.sourceUpdatedAt!),
      facts: {
        openedAt: evidence.openedAt,
        mergedAt: evidence.mergedAt,
        closedAt: evidence.mergedAt,
        revisions: [],
        checks: [],
        files: [],
        historyComplete: true,
        issues: [],
      },
    })
    .onConflictDoNothing();
});
beforeEach(async () => {
  await db()
    .delete(s.prWorkflowAttempts)
    .where(eq(s.prWorkflowAttempts.pullRequestId, evidence.id));
  await db()
    .delete(s.workflowAttempts)
    .where(eq(s.workflowAttempts.repositoryId, evidence.repositoryId));
  await db().delete(s.reviewEvents).where(eq(s.reviewEvents.pullRequestId, evidence.id));
  await db()
    .delete(s.dashboardPrEvidence)
    .where(eq(s.dashboardPrEvidence.pullRequestId, evidence.id));
});
afterAll(closeDb);
test('duplicate hydration retains identical histories and original terminal observation bound', async () => {
  await persistDashboardEvidence(evidence);
  const first = await loadDashboardEvidence(evidence.id);
  await persistDashboardEvidence({
    ...evidence,
    attempts: evidence.attempts.map((a) => ({ ...a, terminalObservedAt: '2026-01-04T00:00:00Z' })),
  });
  expect(await loadDashboardEvidence(evidence.id)).toEqual(first);
  expect(first?.reviews.find((r) => r.kind === 'dismissed')?.dismissedReviewId).toBe('41');
  expect(first?.attempts[0]).toMatchObject({
    completedAt: null,
    sourceUpdatedAt: '2026-01-02T00:05:00.000Z',
    terminalObservedAt: '2026-01-02T00:10:00.000Z',
  });
  expect(
    await db().select().from(s.reviewEvents).where(eq(s.reviewEvents.pullRequestId, evidence.id)),
  ).toHaveLength(2);
  expect(
    await db()
      .select()
      .from(s.prWorkflowAttempts)
      .where(eq(s.prWorkflowAttempts.pullRequestId, evidence.id)),
  ).toHaveLength(1);
});
test('same PR source with newly incomplete collections retains rows and downgrades independent completeness', async () => {
  await persistDashboardEvidence(evidence);
  await persistDashboardEvidence({
    ...evidence,
    reviewsComplete: false,
    ciComplete: false,
    chronologyComplete: false,
    reviews: [{ ...evidence.reviews[0], state: 'dismissed' }],
    attempts: [],
    provenance: { reviews: ['unavailable'] },
  });
  const loaded = await loadDashboardEvidence(evidence.id);
  expect(loaded).toMatchObject({
    reviewsComplete: false,
    ciComplete: false,
    chronologyComplete: true,
  });
  expect(loaded?.reviews.find((r) => r.id === '41')?.state).toBe('approved');
  expect(loaded?.reviews).toHaveLength(2);
  expect(loaded?.attempts).toHaveLength(1);
  expect(classifyMergedPr(loaded!)).toBe('unknown');
});
test('revised provider conclusion cannot inherit old terminal observation', async () => {
  await persistDashboardEvidence(evidence);
  await persistDashboardEvidence({
    ...evidence,
    attempts: [
      {
        ...evidence.attempts[0],
        conclusion: 'failure',
        sourceUpdatedAt: '2026-01-05T00:00:00Z',
        terminalObservedAt: '2026-01-05T00:10:00Z',
      },
    ],
  });
  expect((await loadDashboardEvidence(evidence.id))?.attempts[0]).toMatchObject({
    conclusion: 'failure',
    terminalObservedAt: '2026-01-05T00:10:00.000Z',
  });
  await persistDashboardEvidence(evidence);
  expect((await loadDashboardEvidence(evidence.id))?.attempts[0].conclusion).toBe('failure');
});

test('an incomplete nonterminal snapshot cannot erase a richer terminal attempt at the same source version', async () => {
  await persistDashboardEvidence({
    ...evidence,
    attempts: [
      {
        ...evidence.attempts[0],
        conclusion: 'failure',
        sourceUpdatedAt: '2026-01-05T00:00:00Z',
        terminalObservedAt: '2026-01-05T00:10:00Z',
      },
    ],
  });
  await persistDashboardEvidence({
    ...evidence,
    attempts: [
      {
        ...evidence.attempts[0],
        status: 'queued',
        conclusion: null,
        sourceUpdatedAt: '2026-01-05T00:00:00Z',
        terminalObservedAt: null,
      },
    ],
    ciComplete: false,
  });
  expect((await loadDashboardEvidence(evidence.id))?.attempts[0]).toMatchObject({
    status: 'completed',
    conclusion: 'failure',
    terminalObservedAt: '2026-01-05T00:10:00.000Z',
  });
});

test('an unavailable refresh cannot retain an earlier no-evidence inference as confirmed absence', async () => {
  await persistDashboardEvidence({
    ...evidence,
    reviews: [],
    attempts: [],
    reviewExpected: false,
    ciExpected: false,
  });
  await persistDashboardEvidence({
    ...evidence,
    reviews: [],
    attempts: [],
    reviewExpected: null,
    ciExpected: null,
    reviewsComplete: false,
    ciComplete: false,
  });
  expect(await loadDashboardEvidence(evidence.id)).toMatchObject({
    reviewExpected: null,
    ciExpected: null,
  });
});

test.each(['2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z', '2026-01-04T00:00:00Z'])(
  'empty snapshot at %s cannot erase applicability established by retained historical evidence',
  async (sourceUpdatedAt) => {
    await persistDashboardEvidence(evidence);
    const before = await loadDashboardEvidence(evidence.id);
    expect(classifyMergedPr(before!)).toBe('first-pass');
    await persistDashboardEvidence({
      ...evidence,
      sourceUpdatedAt,
      reviews: [],
      attempts: [],
      reviewExpected: false,
      ciExpected: false,
    });
    const after = await loadDashboardEvidence(evidence.id);
    expect(after).toMatchObject({ reviewExpected: true, ciExpected: true });
    expect(after?.reviews).toEqual(before?.reviews);
    expect(after?.attempts).toEqual(before?.attempts);
    expect(classifyMergedPr(after!)).toBe('first-pass');
  },
);
