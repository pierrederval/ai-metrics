import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, closeDb } from '..';
import * as s from '../schema';
import { loadCohorts } from './cohorts';
import type { PrMetrics } from '../../domain/pull-request/types';
import type { Range } from '../../domain/dashboard/types';

const RANGE: Range = {
  start: '2026-09-01T00:00:00.000Z',
  endExclusive: '2026-09-08T00:00:00.000Z',
  days: 7,
};

function metrics(firstPassGreen: boolean | null): PrMetrics {
  return {
    ciAttemptCount: 1,
    firstPassGreen,
    eventuallyGreen: firstPassGreen,
    attemptsToGreen: firstPassGreen === null ? null : firstPassGreen ? 1 : 2,
    timeToFirstGreenSeconds: null,
    failedCheckCount: 0,
    uniqueFailedGateCount: 0,
    testFilesChanged: 0,
    harnessFilesChanged: 0,
    harnessChangedAfterFailure: null,
    cleanGreen: firstPassGreen,
    evidenceStatus: 'complete',
    evidenceReasons: [],
    analyzerVersion: 'cohort-test',
    gatePolicyVersion: 0,
  };
}

const facts = (openedAt: string) => ({
  openedAt,
  mergedAt: null,
  closedAt: null,
  revisions: [],
  checks: [],
  files: [],
  historyComplete: false,
  issues: [],
});

const prNumbersByRepo = new Map<string, number>();

async function insertPr(opts: {
  id: string;
  repositoryId: string;
  agentProvider: string;
  openedAt: string;
  firstPassGreen: boolean | null;
}) {
  const nextNumber = (prNumbersByRepo.get(opts.repositoryId) ?? 0) + 1;
  prNumbersByRepo.set(opts.repositoryId, nextNumber);
  await db()
    .insert(s.pullRequests)
    .values({
      id: opts.id,
      repositoryId: opts.repositoryId,
      githubPrId: opts.id,
      githubPrNumber: nextNumber,
      title: 'Cohort fixture PR',
      state: 'open',
      authorLogin: 'test',
      headSha: 'head',
      baseSha: 'base',
      openedAt: new Date(opts.openedAt),
      agentProvider: opts.agentProvider,
      facts: facts(opts.openedAt),
      sourceUpdatedAt: new Date(opts.openedAt),
    })
    .onConflictDoNothing();
  await db()
    .insert(s.prMetrics)
    .values({
      id: opts.id,
      pullRequestId: opts.id,
      ...metrics(opts.firstPassGreen),
      projection: metrics(opts.firstPassGreen),
      computedAt: new Date(opts.openedAt),
    })
    .onConflictDoNothing();
}

beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });

  await db()
    .insert(s.installations)
    .values({
      id: 'cohort-install',
      githubInstallationId: 'cohort-install',
      accountLogin: 'test',
      accountType: 'User',
    })
    .onConflictDoNothing();

  await db()
    .insert(s.repositories)
    .values([
      {
        id: 'cohort-repo-basic',
        installationId: 'cohort-install',
        githubRepositoryId: 'cohort-repo-basic',
        owner: 'test',
        name: 'cohort-basic',
        defaultBranch: 'main',
        isPrivate: true,
        trackingStartedAt: new Date(),
      },
      {
        id: 'cohort-repo-visibility',
        installationId: 'cohort-install',
        githubRepositoryId: 'cohort-repo-visibility',
        owner: 'test',
        name: 'cohort-visibility',
        defaultBranch: 'main',
        isPrivate: true,
        trackingStartedAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  // Test A fixtures: 4 in-range PRs across three cohorts, plus one PR opened
  // before RANGE.start to prove the date filter excludes it.
  await insertPr({
    id: 'cohort-basic-codex-1',
    repositoryId: 'cohort-repo-basic',
    agentProvider: 'codex',
    openedAt: '2026-09-03T00:00:00.000Z',
    firstPassGreen: true,
  });
  await insertPr({
    id: 'cohort-basic-codex-2',
    repositoryId: 'cohort-repo-basic',
    agentProvider: 'codex',
    openedAt: '2026-09-03T01:00:00.000Z',
    firstPassGreen: false,
  });
  await insertPr({
    id: 'cohort-basic-claude-1',
    repositoryId: 'cohort-repo-basic',
    agentProvider: 'claude-code',
    openedAt: '2026-09-04T00:00:00.000Z',
    firstPassGreen: true,
  });
  await insertPr({
    id: 'cohort-basic-unknown-1',
    repositoryId: 'cohort-repo-basic',
    agentProvider: 'unknown',
    openedAt: '2026-09-05T00:00:00.000Z',
    firstPassGreen: true,
  });
  await insertPr({
    id: 'cohort-basic-outside-1',
    repositoryId: 'cohort-repo-basic',
    agentProvider: 'codex',
    openedAt: '2026-08-01T00:00:00.000Z',
    firstPassGreen: true,
  });

  // Test B fixtures: 101 pull requests so exactly one (the oldest) falls
  // outside the Free-plan latest-100 visibility limit. The hidden PR is the
  // only 'codex' row; every visible PR is 'unknown'. If loadCohorts forgot
  // to call visiblePrIds, a 'codex' cohort would leak into the result.
  const visRows = Array.from({ length: 101 }, (_, i) => ({
    id: `cohort-vis-${String(i).padStart(3, '0')}`,
    repositoryId: 'cohort-repo-visibility',
    agentProvider: i === 0 ? 'codex' : 'unknown',
    openedAt: new Date(Date.parse('2026-01-01T00:00:00.000Z') + i * 60_000).toISOString(),
    firstPassGreen: true,
  }));
  for (const row of visRows) await insertPr(row);
});

afterAll(closeDb);

describe('loadCohorts', () => {
  it('groups metrics by attributed agent and excludes pull requests outside the range', async () => {
    const table = await loadCohorts('cohort-repo-basic', RANGE);

    expect(table.totalPullRequests).toBe(4);
    expect(table.attributedPullRequests).toBe(3);

    const codex = table.rows.find((r) => r.agent === 'codex');
    expect(codex?.pullRequestCount).toBe(2);
    expect(codex?.label).toBe('Codex');
    expect(codex?.firstPass.value).toBe(50);

    const claude = table.rows.find((r) => r.agent === 'claude-code');
    expect(claude?.pullRequestCount).toBe(1);
    expect(claude?.label).toBe('Claude Code');
  });

  it('puts the unattributed cohort last, marks it unattributed, and never sums it into attributedPullRequests', async () => {
    const table = await loadCohorts('cohort-repo-basic', RANGE);

    const last = table.rows[table.rows.length - 1];
    expect(last.agent).toBe('unknown');
    expect(last.label).toBe('Unattributed');
    expect(last.attributed).toBe(false);
    expect(table.rows.filter((r) => r.agent === 'unknown')).toHaveLength(1);
  });

  it('respects the Free-plan visibility limit: a pull request beyond the latest 100 never joins a cohort', async () => {
    const wideRange: Range = {
      start: '2020-01-01T00:00:00.000Z',
      endExclusive: '2030-01-01T00:00:00.000Z',
      days: 3653,
    };

    const table = await loadCohorts('cohort-repo-visibility', wideRange);

    expect(table.totalPullRequests).toBe(100);
    expect(table.attributedPullRequests).toBe(0);
    expect(table.rows.find((r) => r.agent === 'codex')).toBeUndefined();
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toMatchObject({
      agent: 'unknown',
      label: 'Unattributed',
      attributed: false,
    });
  });

  // Distinct from the zero-visible-pull-requests case below: here the
  // repository has visible pull requests with metrics and the *range* excludes
  // every one of them. Both must produce the same empty table, because that is
  // what the cohort card's empty state renders from.
  it('returns an empty table when visible pull requests exist but none were opened in the range', async () => {
    const emptyRange: Range = {
      start: '2027-01-01T00:00:00.000Z',
      endExclusive: '2027-01-08T00:00:00.000Z',
      days: 7,
    };

    const populated = await loadCohorts('cohort-repo-basic', RANGE);
    expect(populated.rows.length).toBeGreaterThan(0);

    const table = await loadCohorts('cohort-repo-basic', emptyRange);

    expect(table.rows).toEqual([]);
    expect(table.totalPullRequests).toBe(0);
    expect(table.attributedPullRequests).toBe(0);
  });

  it('returns an empty table for a repository with no visible pull requests', async () => {
    const table = await loadCohorts('cohort-repo-does-not-exist', RANGE);

    expect(table.rows).toEqual([]);
    expect(table.totalPullRequests).toBe(0);
    expect(table.attributedPullRequests).toBe(0);
  });
});
