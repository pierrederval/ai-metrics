import { beforeEach, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const deps = vi.hoisted(() => ({
  available: vi.fn(),
  rows: vi.fn(),
  latest: vi.fn(),
  grades: vi.fn(),
  demo: false,
  role: 'owner',
}));
vi.mock('../../workspaces/access', () => ({
  accessibleRepositories: deps.available,
  requireWorkspace: async () => ({ id: 'w', role: deps.role }),
}));
vi.mock('../../db/queries/grade-runs', () => ({ gradeSummaries: deps.grades }));
vi.mock('../../db/queries/dashboard', () => ({ prRows: deps.rows }));
vi.mock('../../db/queries/repository-imports', () => ({ latestImport: deps.latest }));
vi.mock('../../lib/env', () => ({ env: () => ({ DEMO_MODE: deps.demo ? 'true' : 'false' }) }));
vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(href);
  },
}));
import Dashboard from './page';
beforeEach(() => {
  vi.clearAllMocks();
  deps.demo = false;
  deps.role = 'owner';
  deps.rows.mockResolvedValue([]);
  deps.latest.mockResolvedValue(null);
  deps.grades.mockResolvedValue([]);
});
test('untracked installations redirect before metrics are fetched', async () => {
  deps.available.mockResolvedValue([{ id: 'untracked', trackingStartedAt: null }]);
  await expect(Dashboard()).rejects.toThrow('/onboarding');
  expect(deps.rows).not.toHaveBeenCalled();
});
test('overview only fetches tracked repository evidence', async () => {
  deps.available.mockResolvedValue([
    { id: 'untracked', trackingStartedAt: null },
    { id: 'tracked', trackingStartedAt: new Date() },
  ]);
  await Dashboard();
  expect(deps.rows).toHaveBeenCalledWith(['tracked']);
  expect(deps.grades).toHaveBeenCalledExactlyOnceWith(['tracked']);
  expect(deps.latest).toHaveBeenCalledTimes(1);
  expect(deps.latest).toHaveBeenCalledWith('tracked');
});
test('explicit demo rows retain read access without onboarding', async () => {
  deps.demo = true;
  deps.available.mockResolvedValue([{ id: 'demo', trackingStartedAt: null, isDemo: true }]);
  await Dashboard();
  expect(deps.rows).toHaveBeenCalledWith(['demo']);
});

test('members with no repositories stay in the overview', async () => {
  deps.role = 'member';
  deps.available.mockResolvedValue([]);
  await expect(Dashboard()).resolves.toBeDefined();
});

test('grade KPIs fetch all visible repositories in one batch', async () => {
  deps.available.mockResolvedValue([
    { id: 'one', trackingStartedAt: new Date() },
    { id: 'two', trackingStartedAt: new Date() },
  ]);
  await Dashboard();
  expect(deps.grades).toHaveBeenCalledExactlyOnceWith(['one', 'two']);
});

test('repository links use canonical encoded ids so prefetch does not retry', async () => {
  deps.available.mockResolvedValue([
    { id: 'repository:1360100266', owner: 'o', name: 'n', trackingStartedAt: new Date() },
  ]);
  const html = renderToStaticMarkup(await Dashboard());
  expect(html).toContain('/repos/repository%3A1360100266');
  expect(html).not.toContain('/repos/repository:1360100266');
});
