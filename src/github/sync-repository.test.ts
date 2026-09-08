import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  assertTrackedRepository: vi.fn(),
  repositoryClient: vi.fn(),
  requestRepositoryImport: vi.fn(),
  dispatchImport: vi.fn(),
}));
vi.mock('./repositories', () => mocks);
vi.mock('../db/queries/repository-imports', () => mocks);
vi.mock('../inngest/dispatch-import', () => mocks);
import { syncRepository, latestPullRequests } from './sync-repository';
beforeEach(() => vi.resetAllMocks());
test('trusted refresh returns the durable run and dispatches it', async () => {
  const snapshot = { id: 'run' };
  mocks.requestRepositoryImport.mockResolvedValue(snapshot);
  expect(await syncRepository('repo')).toBe(snapshot);
  expect(mocks.assertTrackedRepository).toHaveBeenCalledWith('repo');
  expect(mocks.requestRepositoryImport).toHaveBeenCalledWith('repo', 'refresh');
  expect(mocks.dispatchImport).toHaveBeenCalledWith('run');
});
test('untracked refresh creates no run and sends no event', async () => {
  mocks.assertTrackedRepository.mockRejectedValue(new Error('Repository is not tracked'));
  await expect(syncRepository('repo')).rejects.toThrow('not tracked');
  expect(mocks.requestRepositoryImport).not.toHaveBeenCalled();
  expect(mocks.dispatchImport).not.toHaveBeenCalled();
});
test('discovery requests the newest 100 across all PR states by creation date', async () => {
  const list = vi.fn().mockResolvedValue({ data: [{ number: 2 }, { number: 1 }] });
  mocks.repositoryClient.mockResolvedValue({
    repo: { owner: 'owner', name: 'repo' },
    client: { rest: { pulls: { list } } },
  });
  expect(await latestPullRequests('id')).toEqual([2, 1]);
  expect(list).toHaveBeenCalledWith({
    owner: 'owner',
    repo: 'repo',
    state: 'all',
    sort: 'created',
    direction: 'desc',
    per_page: 100,
    page: 1,
  });
});
