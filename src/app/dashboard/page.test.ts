import { beforeEach, expect, test, vi } from 'vitest';
const deps = vi.hoisted(() => ({
  available: vi.fn(),
  rows: vi.fn(),
  latest: vi.fn(),
  demo: false,
}));
vi.mock('../../auth/access', () => ({ accessibleRepositories: deps.available }));
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
  deps.rows.mockResolvedValue([]);
  deps.latest.mockResolvedValue(null);
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
  expect(deps.latest).toHaveBeenCalledTimes(1);
  expect(deps.latest).toHaveBeenCalledWith('tracked');
});
test('explicit demo rows retain read access without onboarding', async () => {
  deps.demo = true;
  deps.available.mockResolvedValue([{ id: 'demo', trackingStartedAt: null, isDemo: true }]);
  await Dashboard();
  expect(deps.rows).toHaveBeenCalledWith(['demo']);
});
