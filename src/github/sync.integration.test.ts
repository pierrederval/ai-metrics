import { beforeAll, afterAll, expect, test, vi } from 'vitest';
import { Octokit } from 'octokit';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, closeDb } from '../db';
import * as s from '../db/schema';
import { persistEvent } from '../db/queries/events';
import { syncPullRequest } from './sync-pull-request';
import { loadDashboardEvidence } from '../db/queries/dashboard-evidence';
import { classifyMergedPr, classifyWorkflow } from '../domain/dashboard/classify';
let reviewStatus = 200;
let includeProviderChecks = true;
vi.mock('./repositories', () => ({
  assertTrackedRepository: async () => {},
  repositoryClient: async () => ({
    repo: { id: 'hydrate-repo', owner: 'owner', name: 'repo', githubRepositoryId: '4242' },
    client: new Octokit({ request: { fetch: fakeFetch } }),
  }),
}));
const t = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString();
async function fakeFetch(input: RequestInfo | URL) {
  const url = String(input);
  let data: unknown;
  if (url.includes('/reviews') || url.includes('/timeline')) {
    return new Response(JSON.stringify(reviewStatus === 200 ? [] : { message: 'Unavailable' }), {
      status: reviewStatus,
      headers: { 'content-type': 'application/json' },
    });
  } else if (url.includes('/actions/runs/300/attempts/1/jobs')) data = { total_count: 0, jobs: [] };
  else if (url.includes('/actions/runs/300/attempts/1'))
    data = {
      id: 300,
      run_attempt: 1,
      head_sha: 'b',
      status: 'completed',
      conclusion: 'success',
      run_started_at: t(5),
      updated_at: t(6),
    };
  else if (url.includes('/check-runs')) {
    const sha = url.includes('/a/') ? 'a' : 'b';
    data = {
      total_count: 1,
      check_runs: [
        {
          id: sha === 'a' ? 11 : 22,
          name: 'unit',
          app: { id: 1 },
          head_sha: sha,
          status: 'completed',
          conclusion: sha === 'a' ? 'failure' : 'success',
          started_at: t(sha === 'a' ? 1 : 5),
          completed_at: t(sha === 'a' ? 2 : 6),
        },
      ],
    };
    if (!includeProviderChecks) data = { total_count: 0, check_runs: [] };
  } else if (url.includes('/actions/runs'))
    data = url.includes('head_sha=b')
      ? { total_count: 1, workflow_runs: [{ id: 300, run_attempt: 1, head_sha: 'b' }] }
      : { total_count: 0, workflow_runs: [] };
  else if (url.includes('/compare/'))
    data = {
      merge_base_commit: { sha: 'a' },
      files: [{ filename: 'tests/foo.spec.ts', status: 'modified', additions: 2, deletions: 1 }],
    };
  else if (url.includes('/commits'))
    data = ['a', 'b'].map((sha) => ({
      sha,
      author: { login: 'dev' },
      commit: { committer: { date: t(0) } },
    }));
  else if (url.includes('/files'))
    data = [{ filename: 'tests/foo.spec.ts', status: 'modified', additions: 2, deletions: 1 }];
  else
    data = {
      id: 42421,
      number: 1,
      title: 'Harness repair',
      state: 'closed',
      user: { login: 'dev' },
      head: { sha: 'b' },
      base: { sha: 'base' },
      created_at: t(0),
      updated_at: t(10),
      merged_at: t(10),
      closed_at: t(10),
      changed_files: 1,
      commits: 2,
    };
  const response = new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}
beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });
  await db()
    .insert(s.installations)
    .values({
      id: 'hydrate-install',
      githubInstallationId: '4242',
      accountLogin: 'owner',
      accountType: 'User',
    })
    .onConflictDoNothing();
  await db()
    .insert(s.repositories)
    .values({
      id: 'hydrate-repo',
      installationId: 'hydrate-install',
      githubRepositoryId: '4242',
      owner: 'owner',
      name: 'repo',
      defaultBranch: 'main',
      isPrivate: true,
      trackingStartedAt: new Date(),
    })
    .onConflictDoNothing();
  await db()
    .insert(s.gatePolicies)
    .values({ repositoryId: 'hydrate-repo', version: 1, gates: [{ appId: '1', name: 'unit' }] })
    .onConflictDoNothing();
  for (const [action, sha, before, n] of [
    ['opened', 'a', undefined, 0],
    ['synchronize', 'b', 'a', 4],
  ] as const)
    await persistEvent(
      `hydrate-${action}`,
      'pull_request',
      {
        action,
        before,
        pull_request: { number: 1, head: { sha }, created_at: t(0), updated_at: t(n) },
      },
      { repositoryId: '4242', installationId: '4242', action },
    );
});
afterAll(closeDb);
test('REST hydration and repeat import preserve facts and demonstrate harness repair', async () => {
  const id = await syncPullRequest('hydrate-repo', 1);
  const [first] = await db().select().from(s.prMetrics).where(eq(s.prMetrics.pullRequestId, id));
  expect(first.projection).toMatchObject({
    firstPassGreen: false,
    eventuallyGreen: true,
    attemptsToGreen: 2,
    harnessChangedAfterFailure: true,
    cleanGreen: false,
  });
  const dashboard = await loadDashboardEvidence(id);
  expect(dashboard?.attempts).toHaveLength(1);
  expect(dashboard?.reviewsComplete).toBe(true);
  await syncPullRequest('hydrate-repo', 1);
  expect(await loadDashboardEvidence(id)).toEqual(dashboard);
  const [second] = await db().select().from(s.prMetrics).where(eq(s.prMetrics.pullRequestId, id));
  expect(second.projection).toEqual(first.projection);
  expect(await db().select().from(s.pullRequests).where(eq(s.pullRequests.id, id))).toHaveLength(1);
});

test('review permission failure persists independent CI evidence then retries', async () => {
  await db()
    .delete(s.dashboardPrEvidence)
    .where(eq(s.dashboardPrEvidence.pullRequestId, 'pr:4242:1'));
  await db()
    .delete(s.prWorkflowAttempts)
    .where(eq(s.prWorkflowAttempts.pullRequestId, 'pr:4242:1'));
  await db().delete(s.workflowAttempts).where(eq(s.workflowAttempts.repositoryId, 'hydrate-repo'));
  reviewStatus = 403;
  try {
    await expect(syncPullRequest('hydrate-repo', 1)).rejects.toMatchObject({ status: 403 });
    const evidence = await loadDashboardEvidence('pr:4242:1');
    expect(evidence?.attempts).toHaveLength(1);
    expect(evidence).toMatchObject({
      reviewsComplete: false,
      reviewExpected: null,
      ciExpected: true,
    });
  } finally {
    reviewStatus = 200;
  }
});

test('hydration keeps CI operational evidence when merge first-pass chronology is unavailable', async () => {
  await db()
    .delete(s.dashboardPrEvidence)
    .where(eq(s.dashboardPrEvidence.pullRequestId, 'pr:4242:1'));
  await db().delete(s.githubEvents).where(eq(s.githubEvents.deliveryId, 'hydrate-opened'));
  await persistEvent(
    'hydrate-workflow-completed',
    'workflow_run',
    {
      workflow_run: {
        id: 300,
        run_attempt: 1,
        head_sha: 'b',
        status: 'completed',
        conclusion: 'success',
        run_started_at: t(5),
        updated_at: t(6),
      },
    },
    { repositoryId: '4242', installationId: '4242', action: 'completed' },
  );
  await db()
    .update(s.githubEvents)
    .set({ receivedAt: new Date(t(7)) })
    .where(eq(s.githubEvents.deliveryId, 'hydrate-workflow-completed'));
  includeProviderChecks = false;
  try {
    const id = await syncPullRequest('hydrate-repo', 1);
    const loaded = await loadDashboardEvidence(id);
    expect(loaded).toMatchObject({
      ciExpected: true,
      ciComplete: true,
      reviewExpected: false,
      chronologyComplete: false,
    });
    expect(classifyMergedPr(loaded!)).toBe('unknown');
    expect(classifyWorkflow(loaded!.attempts, t(10))).toBe('first-pass');
  } finally {
    includeProviderChecks = true;
    await db()
      .delete(s.githubEvents)
      .where(eq(s.githubEvents.deliveryId, 'hydrate-workflow-completed'));
  }
});
