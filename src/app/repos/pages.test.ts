import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import { aggregatePeriod } from '../../domain/dashboard/aggregate';
import { previousRange } from '../../domain/dashboard/range';
const deps = vi.hoisted(() => ({
  available: vi.fn(),
  require: vi.fn(),
  load: vi.fn(),
  records: vi.fn(),
  rows: vi.fn(),
  latest: vi.fn(),
  policy: vi.fn(),
}));
vi.mock('../../auth/access', () => ({
  accessibleRepositories: deps.available,
  requireTrackedRepository: deps.require,
}));
vi.mock('../../db/queries/basic-dashboard', () => ({ loadBasicDashboard: deps.load }));
vi.mock('../../db/queries/repository-records', () => ({ repositoryRecords: deps.records }));
vi.mock('../../db/queries/dashboard', () => ({ prRows: deps.rows, currentPolicy: deps.policy }));
vi.mock('../../db/queries/repository-imports', () => ({ latestImport: deps.latest }));
vi.mock('./[repoId]/actions', () => ({ saveGates: vi.fn(), refreshImport: vi.fn() }));
vi.mock('../../lib/env', () => ({ env: () => ({ DEMO_MODE: 'false' }) }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/repos/repo',
  useRouter: () => ({ push: vi.fn() }),
}));
import Directory from './page';
import Repository from './[repoId]/page';
const repo = {
  id: 'repo',
  owner: 'owner',
  name: 'real-project',
  trackingStartedAt: new Date(),
  canAdmin: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  deps.available.mockResolvedValue([repo, { ...repo, id: 'untracked', trackingStartedAt: null }]);
  deps.require.mockResolvedValue(repo);
  deps.rows.mockResolvedValue([]);
  deps.policy.mockResolvedValue({ gates: [], version: 0 });
  deps.latest.mockResolvedValue(null);
  deps.records.mockResolvedValue([
    {
      repositoryId: 'repo',
      prs: [],
      accessiblePrCount: 100,
      reviewDetected: false,
      ciDetected: false,
      latestPrActivity: '2026-09-07T10:00:00.000Z',
      lastSuccessfulFetch: { at: '2026-09-06T10:00:00.000Z', source: 'Latest PR import' },
      latestAttempt: {
        at: '2026-09-08T10:00:00.000Z',
        status: 'failed',
        source: 'Latest PR import',
      },
      importState: 'failed',
      historyState: 'partial',
    },
  ]);
  deps.load.mockImplementation(async (_ids, range) => {
    const p = aggregatePeriod([], range);
    return {
      ...p,
      range,
      previousRange: previousRange(range),
      previousDays: [],
      previousTotals: p.totals,
      comparisons: {},
      previousCoverageReasons: [],
      previousUndatedCi: p.undatedCi,
      coverage: 'partial',
      timezone: 'UTC',
      visiblePrCount: 100,
      collectionBounds: { from: null, to: null, source: 'unknown' },
    };
  });
});
test('directory shows only tracked authorized repositories with genuine links and separate failed attempt', async () => {
  const html = renderToStaticMarkup(
    await Directory({ searchParams: Promise.resolve({ days: '90' }) }),
  );
  expect(deps.records).toHaveBeenCalledWith(['repo']);
  expect(html).toContain('href="/repos/repo?days=90"');
  expect(html).toContain('https://github.com/owner/real-project');
  expect(html).toContain('2026-09-06');
  expect(html).toContain('2026-09-08');
  expect(html).toContain('failed');
  expect(html).toContain('No review or CI detected');
  expect(html).not.toContain('Not configured');
});
test('detail authorizes first, scopes loader to authorized repository, and retains custom range', async () => {
  const html = renderToStaticMarkup(
    await Repository({
      params: Promise.resolve({ repoId: 'repo' }),
      searchParams: Promise.resolve({ from: '2026-08-01', to: '2026-08-30' }),
    }),
  );
  expect(deps.require).toHaveBeenCalledWith('repo');
  expect(deps.require.mock.invocationCallOrder[0]).toBeLessThan(
    deps.load.mock.invocationCallOrder[0],
  );
  expect(deps.load).toHaveBeenCalledWith(
    ['repo'],
    expect.objectContaining({ start: '2026-08-01T00:00:00.000Z', days: 30 }),
  );
  expect(html).toContain('/repos?from=2026-08-01&amp;to=2026-08-30');
  expect(html.match(/data-kpi=/g)).toHaveLength(3);
  expect(html).toContain('Advanced gate analysis');
});
test('denied repository cannot reach dashboard or record loaders', async () => {
  deps.require.mockRejectedValue(new Error('not found'));
  await expect(Repository({ params: Promise.resolve({ repoId: 'forbidden' }) })).rejects.toThrow(
    'not found',
  );
  expect(deps.load).not.toHaveBeenCalled();
  expect(deps.records).not.toHaveBeenCalled();
});
