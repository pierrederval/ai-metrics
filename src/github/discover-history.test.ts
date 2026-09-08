import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ assertTrackedRepository: vi.fn(), repositoryClient: vi.fn() }));
vi.mock('./repositories', () => mocks);
import { discoverHistoryPage } from './discover-history';
const list = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  mocks.repositoryClient.mockResolvedValue({
    repo: { owner: 'org', name: 'repo' },
    client: { rest: { pulls: { list } } },
  });
});
test('includes old PRs updated within cutoff and stops at the first older update', async () => {
  list.mockResolvedValue({
    data: [
      { number: 8, created_at: '2024-01-01', updated_at: '2026-08-01T00:00:00Z' },
      { number: 9, created_at: '2025-01-01', updated_at: '2025-09-08T00:00:00Z' },
      { number: 3, created_at: '2024-01-01', updated_at: '2025-09-07T23:59:59Z' },
    ],
  });
  expect(await discoverHistoryPage('repo', '2025-09-08T00:00:00Z', 2)).toEqual({
    numbers: [8, 9],
    nextPage: null,
    sourceUpdatedAt: { 8: '2026-08-01T00:00:00Z', 9: '2025-09-08T00:00:00Z' },
  });
  expect(list).toHaveBeenCalledWith({
    owner: 'org',
    repo: 'repo',
    state: 'all',
    sort: 'updated',
    direction: 'desc',
    per_page: 100,
    page: 2,
  });
});
test('continues beyond the search API 1000 result cap', async () => {
  list.mockResolvedValue({
    data: Array.from({ length: 100 }, (_, n) => ({
      number: n + 1001,
      updated_at: '2026-01-01T00:00:00Z',
    })),
  });
  expect((await discoverHistoryPage('repo', '2025-09-08T00:00:00Z', 11)).nextPage).toBe(12);
});
test('untracked or suspended repository collects no page', async () => {
  mocks.assertTrackedRepository.mockRejectedValue(new Error('Repository is not tracked'));
  await expect(discoverHistoryPage('repo', '2025-09-08T00:00:00Z', 1)).rejects.toThrow(
    'not tracked',
  );
  expect(list).not.toHaveBeenCalled();
});
