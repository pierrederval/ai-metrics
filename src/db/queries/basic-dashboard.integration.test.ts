import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, closeDb } from '..';
import * as s from '../schema';
import { loadBasicDashboard } from './basic-dashboard';
import { persistDashboardEvidence } from './dashboard-evidence';
import { visiblePrIds } from './history-access';
import { resolveRange } from '../../domain/dashboard/range';
const repos = ['basic-a', 'basic-b'];
const range = resolveRange(
  { from: '2026-09-02', to: '2026-09-08' },
  new Date('2026-09-10T12:00:00Z'),
);
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  await migrate(db(), { migrationsFolder: 'drizzle' });
  await db()
    .insert(s.installations)
    .values({
      id: 'basic-install',
      githubInstallationId: 'basic-install',
      accountLogin: 'test',
      accountType: 'User',
    })
    .onConflictDoNothing();
  await db()
    .insert(s.repositories)
    .values(
      repos.map((id) => ({
        id,
        installationId: 'basic-install',
        githubRepositoryId: id,
        owner: 'test',
        name: id,
        defaultBranch: 'main',
        isPrivate: true,
        trackingStartedAt: new Date('2026-01-01'),
      })),
    )
    .onConflictDoNothing();
});
beforeEach(async () => {
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  const prs = await db()
    .select({ id: s.pullRequests.id })
    .from(s.pullRequests)
    .where(inArray(s.pullRequests.repositoryId, repos));
  const ids = prs.map((p) => p.id);
  if (ids.length) {
    await db().delete(s.prWorkflowAttempts).where(inArray(s.prWorkflowAttempts.pullRequestId, ids));
    await db().delete(s.reviewEvents).where(inArray(s.reviewEvents.pullRequestId, ids));
    await db()
      .delete(s.dashboardPrEvidence)
      .where(inArray(s.dashboardPrEvidence.pullRequestId, ids));
    await db().delete(s.pullRequests).where(inArray(s.pullRequests.id, ids));
  }
  await db().delete(s.workflowAttempts).where(inArray(s.workflowAttempts.repositoryId, repos));
  await db().delete(s.historyBackfills).where(inArray(s.historyBackfills.repositoryId, repos));
  await db().delete(s.repositoryImports).where(inArray(s.repositoryImports.repositoryId, repos));
  await db().update(s.repositories).set({ active: true }).where(inArray(s.repositories.id, repos));
});
afterAll(async () => {
  vi.useRealTimers();
  await closeDb();
});
async function insertPr(
  repositoryId: string,
  n: number,
  options: {
    openedAt?: string;
    mergedAt?: string | null;
    failure?: boolean;
    missing?: boolean;
    runId?: string;
  } = {},
) {
  const id = `${repositoryId}-${n}`;
  const openedAt = options.openedAt ?? '2026-09-01T00:00:00Z';
  const mergedAt = options.mergedAt === undefined ? '2026-09-03T12:00:00Z' : options.mergedAt;
  await db()
    .insert(s.pullRequests)
    .values({
      id,
      repositoryId,
      githubPrId: id,
      githubPrNumber: n,
      title: 'Test',
      state: 'closed',
      authorLogin: 'test',
      headSha: 'head',
      baseSha: 'base',
      openedAt: new Date(openedAt),
      mergedAt: mergedAt ? new Date(mergedAt) : null,
      sourceUpdatedAt: new Date('2026-09-09'),
      facts: {
        openedAt,
        mergedAt,
        closedAt: mergedAt,
        revisions: [],
        checks: [],
        files: [],
        historyComplete: true,
        issues: [],
      },
    });
  if (!options.missing)
    await persistDashboardEvidence({
      id,
      repositoryId,
      openedAt,
      mergedAt,
      mergeHeadSha: 'head',
      reviewExpected: false,
      ciExpected: true,
      chronologyComplete: true,
      reviewsComplete: true,
      ciComplete: true,
      reviews: [],
      attempts: [
        {
          repositoryId,
          runId: options.runId ?? id,
          attempt: 1,
          headSha: 'head',
          status: 'completed',
          conclusion: options.failure ? 'failure' : 'success',
          startedAt: `${(mergedAt ?? '2026-09-03').slice(0, 10)}T01:00:00Z`,
          completedAt: `${(mergedAt ?? '2026-09-03').slice(0, 10)}T02:00:00Z`,
        },
      ],
    });
  return id;
}
async function completeHistory(repo: string, finishedAt = '2026-09-10') {
  await db()
    .insert(s.repositoryImports)
    .values({
      id: `${repo}-import`,
      repositoryId: repo,
      state: 'complete',
      total: 1,
      completed: 1,
      finishedAt: new Date(finishedAt),
    });
  await db()
    .insert(s.historyBackfills)
    .values({
      id: `${repo}-history`,
      repositoryId: repo,
      status: 'complete',
      cutoff: new Date('2025-09-10'),
      cursor: JSON.stringify({ page: null, sweep: 1, revision: 1, failures: 0 }),
      finishedAt: new Date(finishedAt),
    });
}
test('authorized repository aggregate weights counts and shares daily numerators with totals', async () => {
  await insertPr(repos[0], 1);
  for (let n = 1; n <= 9; n++) await insertPr(repos[1], n, { failure: true });
  for (const repo of repos) await completeHistory(repo);
  const data = await loadBasicDashboard(repos, range);
  expect(data.visiblePrCount).toBe(10);
  expect(data.totals.firstPass).toMatchObject({ numerator: 1, denominator: 10, value: 10 });
  expect(data.totals.ciSuccess.value).toBe(10);
  expect(data.days.reduce((n, d) => n + d.merged, 0)).toBe(10);
  expect(data.coverage).toBe('complete');
  expect(data.days[0].mergedValue).toBe(0);
  expect((await loadBasicDashboard([repos[0]], range)).totals.firstPass.value).toBe(100);
});
test('latest 100 are selected before dates; old recently merged PR and workflow never leak', async () => {
  const hidden = await insertPr(repos[0], 1, { openedAt: '2025-01-01T00:00:00Z' });
  for (let n = 2; n <= 101; n++) await insertPr(repos[0], n, { mergedAt: null });
  await completeHistory(repos[0]);
  const data = await loadBasicDashboard([repos[0]], range);
  expect(data.visiblePrCount).toBe(100);
  expect(data.totals.merged).toBe(0);
  expect(data.totals.ciSuccess.denominator).toBe(100);
  expect(data.coverageReasons).toContain('free-history-limit');
  expect(await visiblePrIds([repos[0]])).not.toContain(hidden);
  const old = await loadBasicDashboard(
    [repos[0]],
    resolveRange({ from: '2025-01-01', to: '2025-01-01' }, new Date('2026-09-10')),
  );
  expect(old.totals.merged).toBe(0);
  expect(old.totals.ciSuccess.denominator).toBe(0);
  expect(old.coverage).not.toBe('complete');
});
test('missing evidence still counts raw merges but excludes first-pass denominator and comparisons', async () => {
  await insertPr(repos[0], 1, { missing: true });
  await completeHistory(repos[0]);
  const data = await loadBasicDashboard([repos[0]], range);
  expect(data.totals.merged).toBe(1);
  expect(data.totals.firstPass).toMatchObject({ denominator: 0, excluded: 1, value: null });
  expect(data.coverageReasons).toContain('evidence-incomplete');
  expect(data.comparisons.firstPassPoints).toBeNull();
});
test('oldest opened PR and complete backfill do not certify unavailable date coverage', async () => {
  await insertPr(repos[0], 1, { openedAt: '2020-01-01T00:00:00Z' });
  const unknown = await loadBasicDashboard([repos[0]], range);
  expect(unknown.coverage).toBe('partial');
  expect(unknown.days[0].mergedValue).toBeNull();
  await completeHistory(repos[0]);
  const outside = await loadBasicDashboard(
    [repos[0]],
    resolveRange({ from: '2024-01-01', to: '2024-01-07' }, new Date('2026-09-10')),
  );
  expect(outside.coverageReasons).toContain('outside-collected-history');
  await db()
    .update(s.dashboardPrEvidence)
    .set({ ciComplete: false })
    .where(eq(s.dashboardPrEvidence.pullRequestId, `${repos[0]}-1`));
  expect((await loadBasicDashboard([repos[0]], range)).coverage).toBe('partial');
});
test('no selected repositories and revoked repository have gaps and no data', async () => {
  await insertPr(repos[0], 1);
  await db().update(s.repositories).set({ active: false }).where(eq(s.repositories.id, repos[0]));
  for (const ids of [[], [repos[0]]]) {
    const data = await loadBasicDashboard(ids, range);
    expect(data.visiblePrCount).toBe(0);
    expect(data.totals.merged).toBe(0);
    expect(data.coverage).toBe('unknown');
    expect(data.days.every((d) => d.mergedValue === null)).toBe(true);
  }
});

test('preceding equal period comparisons use real counts, percentage points, and today suppresses them', async () => {
  await insertPr(repos[0], 1, { mergedAt: '2026-08-28T12:00:00Z', failure: true });
  await insertPr(repos[0], 2);
  await insertPr(repos[0], 3);
  await completeHistory(repos[0]);
  const data = await loadBasicDashboard([repos[0]], range);
  expect(data.previousDays).toHaveLength(7);
  expect(data.previousRange.start).toBe('2026-08-26T00:00:00.000Z');
  expect(data.previousTotals.merged).toBe(1);
  expect(data.comparisons).toEqual({
    mergedPercent: 100,
    firstPassPoints: 100,
    ciSuccessPoints: 100,
  });
  const today = await loadBasicDashboard([repos[0]], resolveRange({ days: 7 }, new Date()));
  expect(today.coverageReasons).toContain('current-day');
  expect(today.comparisons.mergedPercent).toBeNull();
});
test('unfinished discovery cursor prevents date completeness even when status says complete', async () => {
  await insertPr(repos[0], 1);
  await completeHistory(repos[0]);
  await db()
    .update(s.historyBackfills)
    .set({ cursor: JSON.stringify({ page: 2, sweep: 1, revision: 2, failures: 0 }) })
    .where(eq(s.historyBackfills.repositoryId, repos[0]));
  const data = await loadBasicDashboard([repos[0]], range);
  expect(data.coverageReasons).toContain('history-undiscovered');
  expect(data.days[0].mergedValue).toBeNull();
});

test('custom picker bounds require discovered backfill metadata, not old PR creation', async () => {
  await insertPr(repos[0], 1, { openedAt: '2020-01-01T00:00:00Z' });
  expect((await loadBasicDashboard([repos[0]], range)).collectionBounds).toEqual({
    from: null,
    to: null,
    source: 'unknown',
  });
  await completeHistory(repos[0]);
  expect((await loadBasicDashboard([repos[0]], range)).collectionBounds).toEqual({
    from: '2025-09-10',
    to: '2026-09-10',
    source: 'backfill-discovery',
  });
  await db()
    .update(s.historyBackfills)
    .set({ status: 'partial' })
    .where(eq(s.historyBackfills.repositoryId, repos[0]));
  const partial = await loadBasicDashboard([repos[0]], range);
  expect(partial.collectionBounds.from).toBe('2025-09-10');
  expect(partial.coverage).toBe('partial');
  await db()
    .update(s.historyBackfills)
    .set({ cursor: JSON.stringify({ page: 2, sweep: 1, revision: 2, failures: 0 }) })
    .where(eq(s.historyBackfills.repositoryId, repos[0]));
  expect((await loadBasicDashboard([repos[0]], range)).collectionBounds.source).toBe('unknown');
});

test('visible collection advances custom dates after the initial backfill without certifying later coverage', async () => {
  await completeHistory(repos[0], '2026-09-08');
  vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
  const recent = resolveRange({ days: 7 }, new Date());
  expect((await loadBasicDashboard([repos[0]], recent)).collectionBounds.to).toBe('2026-09-08');
  await insertPr(repos[0], 1, { mergedAt: '2026-09-14T12:00:00Z' });
  const data = await loadBasicDashboard([repos[0]], recent);
  expect(data.collectionBounds).toEqual({
    from: '2025-09-10',
    to: '2026-09-15',
    source: 'backfill-discovery',
  });
  expect(data.totals.merged).toBe(1);
  expect(data.coverage).toBe('partial');
  expect(data.coverageReasons).toContain('outside-collected-history');
  expect(data.comparisons).toEqual({
    mergedPercent: null,
    firstPassPoints: null,
    ciSuccessPoints: null,
  });
  expect(data.days.find((day) => day.date === '2026-09-13')?.mergedValue).toBeNull();
});

test('hidden and unselected repository collection timestamps cannot extend custom bounds', async () => {
  await completeHistory(repos[0], '2026-09-08');
  for (let n = 1; n <= 100; n++) await insertPr(repos[0], n);
  vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
  await insertPr(repos[0], 101, { openedAt: '2020-01-01T00:00:00Z' });
  await insertPr(repos[1], 1);
  await completeHistory(repos[1], '2026-09-15');
  await db()
    .update(s.dashboardPrEvidence)
    .set({ sourceUpdatedAt: new Date('2026-09-20') })
    .where(eq(s.dashboardPrEvidence.pullRequestId, `${repos[0]}-1`));
  const data = await loadBasicDashboard([repos[0]], range);
  expect(data.collectionBounds.to).toBe('2026-09-10');
  expect(data.visiblePrCount).toBe(100);
  await db().update(s.repositories).set({ active: false }).where(eq(s.repositories.id, repos[1]));
  expect((await loadBasicDashboard(repos, range)).collectionBounds.to).toBe('2026-09-10');
});

test('visible collection bounds clamp to today and remain unknown without finished discovery', async () => {
  await completeHistory(repos[0], '2026-09-08');
  vi.setSystemTime(new Date('2026-09-16T12:00:00Z'));
  await insertPr(repos[0], 1);
  vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
  expect((await loadBasicDashboard([repos[0]], range)).collectionBounds.to).toBe('2026-09-15');
  await db().delete(s.historyBackfills).where(eq(s.historyBackfills.repositoryId, repos[0]));
  expect((await loadBasicDashboard([repos[0]], range)).collectionBounds).toEqual({
    from: null,
    to: null,
    source: 'unknown',
  });
});
