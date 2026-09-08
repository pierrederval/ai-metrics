import { afterAll, beforeAll, expect, test } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, closeDb } from '..';
import * as s from '../schema';
import { repositoryRecords } from './repository-records';
beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });
  await db()
    .insert(s.installations)
    .values({
      id: 'directory-install',
      githubInstallationId: 'directory-install',
      accountLogin: 'test',
      accountType: 'User',
    })
    .onConflictDoNothing();
  await db()
    .insert(s.repositories)
    .values({
      id: 'directory-repo',
      installationId: 'directory-install',
      githubRepositoryId: 'directory-repo',
      owner: 'test',
      name: 'directory',
      defaultBranch: 'main',
      isPrivate: true,
      trackingStartedAt: new Date(),
    })
    .onConflictDoNothing();
  await db()
    .insert(s.pullRequests)
    .values(
      Array.from({ length: 101 }, (_, i) => ({
        id: `directory-pr-${String(i).padStart(3, '0')}`,
        repositoryId: 'directory-repo',
        githubPrId: `directory-pr-${i}`,
        githubPrNumber: i + 1,
        title: i === 0 ? 'Hidden old PR' : 'Visible PR',
        state: 'open',
        authorLogin: 'test',
        headSha: 'head',
        baseSha: 'base',
        openedAt: new Date('2026-09-01'),
        sourceUpdatedAt: new Date(i === 0 ? '2026-09-09' : '2026-09-07'),
        facts: {
          openedAt: '2026-09-01',
          mergedAt: null,
          closedAt: null,
          revisions: [],
          checks: [],
          files: [],
          historyComplete: false,
          issues: [],
        },
      })),
    )
    .onConflictDoNothing();
  await db()
    .insert(s.dashboardPrEvidence)
    .values({ pullRequestId: 'directory-pr-000', reviewExpected: true, ciExpected: true })
    .onConflictDoNothing();
  await db()
    .insert(s.repositoryImports)
    .values([
      {
        id: 'directory-success',
        repositoryId: 'directory-repo',
        state: 'complete',
        total: 100,
        completed: 100,
        createdAt: new Date('2026-09-05'),
        finishedAt: new Date('2026-09-06'),
      },
      {
        id: 'directory-failure',
        repositoryId: 'directory-repo',
        state: 'failed',
        createdAt: new Date('2026-09-08'),
        finishedAt: new Date('2026-09-08'),
      },
    ])
    .onConflictDoNothing();
});
afterAll(closeDb);
test('raw records and directory metadata respect latest 100 before activity/evidence lookup without gate metrics', async () => {
  const [record] = await repositoryRecords(['directory-repo']);
  expect(record.prs).toHaveLength(100);
  expect(record.accessiblePrCount).toBe(100);
  expect(record.prs.some((pr) => pr.title === 'Hidden old PR')).toBe(false);
  expect(record.latestPrActivity).toBe('2026-09-07T00:00:00.000Z');
  expect(record.reviewDetected).toBe(false);
  expect(record.ciDetected).toBe(false);
  expect(record.lastSuccessfulFetch).toEqual({
    at: '2026-09-06T00:00:00.000Z',
    source: 'Latest PR import',
  });
  expect(record.latestAttempt).toEqual({
    at: '2026-09-08T00:00:00.000Z',
    source: 'Latest PR import',
    status: 'failed',
  });
  expect(await repositoryRecords([])).toEqual([]);
});
test('a completed batch without a completion timestamp does not invent a successful fetch time', async () => {
  const { eq } = await import('drizzle-orm');
  await db()
    .update(s.repositoryImports)
    .set({ finishedAt: null })
    .where(eq(s.repositoryImports.id, 'directory-success'));
  try {
    const [record] = await repositoryRecords(['directory-repo']);
    expect(record.lastSuccessfulFetch).toBeNull();
  } finally {
    await db()
      .update(s.repositoryImports)
      .set({ finishedAt: new Date('2026-09-06') })
      .where(eq(s.repositoryImports.id, 'directory-success'));
  }
});
