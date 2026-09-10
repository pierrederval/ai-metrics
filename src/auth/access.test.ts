import { beforeEach, expect, test, vi } from 'vitest';

const { paginate, select, reconcile, notFound } = vi.hoisted(() => ({
  paginate: vi.fn(),
  select: vi.fn(),
  reconcile: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
}));

vi.mock('../lib/env', () => ({ env: () => ({ DEMO_MODE: 'false' }) }));
vi.mock('./session', () => ({ userClient: async () => ({ paginate, rest: { apps: {} } }) }));
vi.mock('../github/repositories', () => ({ reconcileInstallation: reconcile }));
vi.mock('next/navigation', () => ({ notFound }));
vi.mock('../db', () => ({ db: () => ({ select }) }));

import { githubAccessibleRepositories } from './access';

function query(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'innerJoin', 'where']) chain[method] = vi.fn(() => chain);
  Object.assign(chain, { then: promise.then.bind(promise) });
  return chain;
}

const installation = { id: 'installation:10', githubInstallationId: '10', active: true };
const repository = {
  id: 'repository:1',
  installationId: installation.id,
  githubRepositoryId: '1',
  active: true,
  isDemo: false,
  trackingStartedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  paginate
    .mockResolvedValueOnce([{ id: 10, suspended_at: null }])
    .mockResolvedValueOnce([{ id: 1, permissions: { admin: false } }]);
  reconcile.mockResolvedValue(['repository:1']);
});

test('missing local inventory is reconciled before GitHub grants are joined to rows', async () => {
  select
    .mockReturnValueOnce(query([]))
    .mockReturnValueOnce(query([]))
    .mockReturnValueOnce(query([{ repo: repository, installation }]));

  await expect(githubAccessibleRepositories()).resolves.toEqual([
    { ...repository, canAdmin: false },
  ]);
  expect(reconcile).toHaveBeenCalledWith('10');
});

test('GitHub API errors propagate instead of becoming an empty repository list', async () => {
  paginate.mockReset().mockRejectedValue(new Error('GitHub unavailable'));
  await expect(githubAccessibleRepositories()).rejects.toThrow('GitHub unavailable');
});

test('current user grants still constrain rows returned after reconciliation', async () => {
  paginate.mockReset();
  paginate
    .mockResolvedValueOnce([{ id: 10, suspended_at: null }])
    .mockResolvedValueOnce([{ id: 2, permissions: { admin: true } }]);
  select
    .mockReturnValueOnce(query([]))
    .mockReturnValueOnce(query([]))
    .mockReturnValueOnce(query([{ repo: repository, installation }]));

  await expect(githubAccessibleRepositories()).resolves.toEqual([]);
});

test('ordinary access checks do not reconcile complete local inventory', async () => {
  select
    .mockReturnValueOnce(query([installation]))
    .mockReturnValueOnce(query([{ repo: repository, installation }]));

  await githubAccessibleRepositories();
  expect(reconcile).not.toHaveBeenCalled();
});

test('explicit picker refresh reconciles installations with complete local inventory', async () => {
  select
    .mockReturnValueOnce(query([installation]))
    .mockReturnValueOnce(query([{ repo: repository, installation }]))
    .mockReturnValueOnce(query([{ repo: repository, installation }]));

  await githubAccessibleRepositories(true);
  expect(reconcile).toHaveBeenCalledWith('10');
});
