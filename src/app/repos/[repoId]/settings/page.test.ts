import { beforeEach, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const deps = vi.hoisted(() => ({
  authorize: vi.fn(),
  policy: vi.fn(),
  latest: vi.fn(),
}));
vi.mock('../../../../auth/access', () => ({ requireTrackedRepository: deps.authorize }));
vi.mock('../../../../db/queries/dashboard', () => ({ currentPolicy: deps.policy }));
vi.mock('../../../../db/queries/repository-imports', () => ({ latestImport: deps.latest }));

import Settings from './page';

const call = () => Settings({ params: Promise.resolve({ repoId: 'repo' }) });

const policy = {
  version: 3,
  gates: [
    { appId: '15368', name: 'unit' },
    { appId: '15368', name: 'playwright' },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  deps.authorize.mockResolvedValue({ id: 'repo', owner: 'owner', name: 'repo', canAdmin: true });
  deps.policy.mockResolvedValue(policy);
  deps.latest.mockResolvedValue({
    id: 'run-1',
    repositoryId: 'repo',
    state: 'complete',
    total: 42,
    completed: 42,
    failed: 0,
    message: null,
    createdAt: '2026-09-08T00:00:00.000Z',
    finishedAt: '2026-09-08T00:05:00.000Z',
  });
});

test('renders the required-gates form with its policy version', async () => {
  const html = renderToStaticMarkup(await call());
  expect(html).toContain('Required gates');
  expect(html).toContain('Policy v3');
  expect(html).toContain('unit (app 15368)');
  expect(html).toContain('playwright (app 15368)');
  expect(html).toContain('Save policy and recompute PRs');
});

test('renders the collection state and the refresh control from the import record', async () => {
  const html = renderToStaticMarkup(await call());
  expect(html).toContain('Imported batch: 42 PRs.');
  expect(html).toContain('Refresh latest 100 PRs');
});

test('renders ImportProgress, which carries its own Retry affordance, while an import is incomplete', async () => {
  deps.latest.mockResolvedValue({
    id: 'run-2',
    repositoryId: 'repo',
    state: 'partial',
    total: 100,
    completed: 90,
    failed: 10,
    message: null,
    createdAt: '2026-09-08T00:00:00.000Z',
    finishedAt: '2026-09-08T00:05:00.000Z',
  });
  const html = renderToStaticMarkup(await call());
  // ImportProgress renders its own Retry form for a partial/failed run —
  // unlike the header's Refresh action, this branch is reachable here.
  expect(html).toContain('Retry failed PRs');
});

test('loads only the gate policy and the collection record', async () => {
  await call();
  expect(deps.policy).toHaveBeenCalledWith('repo');
  expect(deps.latest).toHaveBeenCalledWith('repo');
});

test('renders only one h1 worth of identity — the view starts at h2', async () => {
  const html = renderToStaticMarkup(await call());
  expect(html).not.toContain('<h1');
  expect(html).toContain('<h2>Settings</h2>');
});
