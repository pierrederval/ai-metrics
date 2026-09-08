import { beforeEach, expect, test, vi } from 'vitest';
const deps = vi.hoisted(() => ({
  available: vi.fn(),
  tracked: vi.fn(),
  get: vi.fn(),
  latest: vi.fn(),
}));
vi.mock('../../auth/access', () => ({
  accessibleRepositories: deps.available,
  requireTrackedRepository: deps.tracked,
}));
vi.mock('../../lib/env', () => ({
  env: () => ({ integration: { GITHUB_APP_SLUG: 'fieldnote' } }),
}));
vi.mock('../../db/queries/repository-imports', () => ({
  getImport: deps.get,
  latestImport: deps.latest,
}));
vi.mock('../../components/onboarding/repository-picker', () => ({ RepositoryPicker: () => null }));
vi.mock('../../components/onboarding/import-progress', () => ({ ImportProgress: () => null }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('404');
  },
}));
import Onboarding from './page';
const repo = {
  id: 'repo',
  owner: 'org',
  name: 'one',
  trackingStartedAt: new Date(),
  canAdmin: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  deps.available.mockResolvedValue([repo]);
  deps.tracked.mockResolvedValue(repo);
});
test('resume authorizes repo before exposing persisted run and rejects foreign runs', async () => {
  deps.get.mockResolvedValue({ snapshot: { id: 'run', repositoryId: 'foreign' } });
  await expect(
    Onboarding({ searchParams: Promise.resolve({ repo: 'repo', run: 'run' }) }),
  ).rejects.toThrow('404');
  expect(deps.tracked).toHaveBeenCalledWith('repo');
  expect(deps.tracked.mock.invocationCallOrder[0]).toBeLessThan(
    deps.get.mock.invocationCallOrder[0],
  );
});
test('repo-only resume loads latest import only after authorization', async () => {
  deps.latest.mockResolvedValue(null);
  await Onboarding({ searchParams: Promise.resolve({ repo: 'repo' }) });
  expect(deps.latest).toHaveBeenCalledWith('repo');
  expect(deps.tracked.mock.invocationCallOrder[0]).toBeLessThan(
    deps.latest.mock.invocationCallOrder[0],
  );
});
test('listing errors propagate to the error boundary', async () => {
  deps.available.mockRejectedValue(new Error('GitHub unavailable'));
  await expect(Onboarding({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    'GitHub unavailable',
  );
});
