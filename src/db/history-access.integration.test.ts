import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { count, inArray } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, db } from './index';
import {
  prMetrics,
  pullRequests,
  repositories,
  installations,
  users,
  userInterests,
} from './schema';
import { prRows } from './queries/dashboard';
import { visiblePrIds } from './queries/history-access';
import { persistHistoryInterest } from './queries/history-interest';

const fixture = `history-${randomUUID()}`;
const repositoryIds = [`${fixture}-repo-a`, `${fixture}-repo-b`];

beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });
  await db().insert(users).values({ id: fixture, login: fixture, credentials: 'synthetic-unused' });
  await db()
    .insert(installations)
    .values({
      id: `${fixture}-installation`,
      githubInstallationId: `${fixture}-installation`,
      accountLogin: 'history-test',
      accountType: 'Organization',
    });
  await db()
    .insert(repositories)
    .values(
      repositoryIds.map((id) => ({
        id,
        installationId: `${fixture}-installation`,
        githubRepositoryId: id,
        owner: 'history-test',
        name: id,
        defaultBranch: 'main',
        isPrivate: true,
      })),
    );

  const prs = repositoryIds.flatMap((repositoryId) =>
    Array.from({ length: 101 }, (_, number) => {
      // 0 and 1 deliberately tie at the visibility boundary. The ID tie-breaker keeps 1.
      const day = number === 0 ? 1 : number;
      const id = `${repositoryId}-pr-${String(number).padStart(3, '0')}`;
      const openedAt = new Date(Date.UTC(2026, 0, day));
      return {
        id,
        repositoryId,
        githubPrId: id,
        githubPrNumber: number + 1,
        title: `PR ${number}`,
        state: 'closed',
        authorLogin: 'history-test',
        headSha: `${id}-head`,
        baseSha: `${id}-base`,
        openedAt,
        mergedAt: openedAt,
        sourceUpdatedAt: openedAt,
        facts: {
          openedAt: openedAt.toISOString(),
          mergedAt: openedAt.toISOString(),
          closedAt: openedAt.toISOString(),
          checks: [],
          files: [],
          revisions: [],
          historyComplete: true,
          issues: [],
        },
      };
    }),
  );
  await db().insert(pullRequests).values(prs);
  await db()
    .insert(prMetrics)
    .values(
      prs.map((pr) => ({
        id: `${pr.id}-metrics`,
        pullRequestId: pr.id,
        ciAttemptCount: 0,
        firstPassGreen: null,
        eventuallyGreen: null,
        attemptsToGreen: null,
        timeToFirstGreenSeconds: null,
        failedCheckCount: 0,
        uniqueFailedGateCount: 0,
        testFilesChanged: 0,
        harnessFilesChanged: 0,
        harnessChangedAfterFailure: null,
        cleanGreen: null,
        evidenceStatus: 'incomplete',
        evidenceReasons: [],
        analyzerVersion: 'history-test',
        gatePolicyVersion: 0,
        projection: {
          ciAttemptCount: 0,
          firstPassGreen: null,
          eventuallyGreen: null,
          attemptsToGreen: null,
          timeToFirstGreenSeconds: null,
          failedCheckCount: 0,
          uniqueFailedGateCount: 0,
          testFilesChanged: 0,
          harnessFilesChanged: 0,
          harnessChangedAfterFailure: null,
          cleanGreen: null,
          evidenceStatus: 'incomplete' as const,
          evidenceReasons: [],
          analyzerVersion: 'history-test',
          gatePolicyVersion: 0,
        },
        computedAt: pr.openedAt,
      })),
    );
});

afterAll(async () => {
  await db()
    .delete(prMetrics)
    .where(
      inArray(
        prMetrics.pullRequestId,
        repositoryIds.flatMap((repositoryId) =>
          Array.from(
            { length: 101 },
            (_, number) => `${repositoryId}-pr-${String(number).padStart(3, '0')}`,
          ),
        ),
      ),
    );
  await db().delete(pullRequests).where(inArray(pullRequests.repositoryId, repositoryIds));
  await db().delete(repositories).where(inArray(repositories.id, repositoryIds));
  await db()
    .delete(installations)
    .where(inArray(installations.id, [`${fixture}-installation`]));
  await db()
    .delete(userInterests)
    .where(inArray(userInterests.userId, [fixture]));
  await db()
    .delete(users)
    .where(inArray(users.id, [fixture]));
  await closeDb();
});

test('Free history exposes IDs 1 through 100 per repository and retains all 202 records', async () => {
  const expectedIds = repositoryIds.flatMap((repositoryId) =>
    Array.from(
      { length: 100 },
      (_, index) => `${repositoryId}-pr-${String(index + 1).padStart(3, '0')}`,
    ),
  );
  const visibleIds = await visiblePrIds(repositoryIds);
  const rows = await prRows(repositoryIds);

  expect(visibleIds.sort()).toEqual(expectedIds.sort());
  expect(visibleIds).not.toContain(`${repositoryIds[0]}-pr-000`);
  expect(visibleIds).not.toContain(`${repositoryIds[1]}-pr-000`);
  expect(rows.map(({ pr }) => pr.id).sort()).toEqual(expectedIds.sort());
  expect(
    await db()
      .select({ count: count() })
      .from(pullRequests)
      .where(inArray(pullRequests.repositoryId, repositoryIds)),
  ).toEqual([{ count: 202 }]);
});

test('registering expanded-history interest never grants access to older PRs', async () => {
  const before = await visiblePrIds(repositoryIds);
  await persistHistoryInterest(fixture);
  expect((await visiblePrIds(repositoryIds)).sort()).toEqual(before.sort());
  const rows = await prRows(repositoryIds);
  expect(rows).toHaveLength(200);
  expect(rows.map(({ pr }) => pr.id)).not.toContain(`${repositoryIds[0]}-pr-000`);
  expect(rows.map(({ pr }) => pr.id)).not.toContain(`${repositoryIds[1]}-pr-000`);
});
