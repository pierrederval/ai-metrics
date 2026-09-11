import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
// Repository-detail coverage (KPI cards, PR table, gate policy, route-id
// guards) moved with that behaviour: Task 6 rewrote `./[repoId]/page` as the
// Agents view, so it is now covered by `./[repoId]/page.test.ts`. This file
// keeps only the `/repos` directory, which Task 6 did not touch.
const deps = vi.hoisted(() => ({
  available: vi.fn(),
  records: vi.fn(),
}));
vi.mock('../../auth/access', () => ({ accessibleRepositories: deps.available }));
vi.mock('../../db/queries/repository-records', () => ({ repositoryRecords: deps.records }));
vi.mock('../../lib/env', () => ({ env: () => ({ DEMO_MODE: 'false' }) }));
import Directory from './page';
const repo = {
  id: 'repository:1',
  owner: 'owner',
  name: 'real-project',
  trackingStartedAt: new Date(),
  canAdmin: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  deps.available.mockResolvedValue([repo, { ...repo, id: 'untracked', trackingStartedAt: null }]);
  deps.records.mockResolvedValue([
    {
      repositoryId: 'repository:1',
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
});
test('directory shows only tracked authorized repositories with genuine links and separate failed attempt', async () => {
  const html = renderToStaticMarkup(
    await Directory({ searchParams: Promise.resolve({ days: '90' }) }),
  );
  expect(deps.records).toHaveBeenCalledWith(['repository:1']);
  expect(html).toContain('href="/repos/repository%3A1?days=90"');
  expect(html).toContain('https://github.com/owner/real-project');
  expect(html).toContain('2026-09-06');
  expect(html).toContain('2026-09-08');
  expect(html).toContain('failed');
  expect(html).toContain('No review or CI detected');
  expect(html).not.toContain('Not configured');
});
