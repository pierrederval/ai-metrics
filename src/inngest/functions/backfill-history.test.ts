import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  createFunction: vi.fn((config, handler) => ({ config, handler })),
  processHistorySlice: vi.fn(),
  dispatchHistoryBackfill: vi.fn(),
  repositoriesMissingHistory: vi.fn(),
  ensureHistoryBackfill: vi.fn(),
  listHistoryRecovery: vi.fn(),
}));
vi.mock('../client', () => ({ inngest: { createFunction: mocks.createFunction } }));
vi.mock('../../db/queries/history-backfill', () => mocks);
vi.mock('../dispatch-history', () => mocks);
import { historyBackfillFunction, reconcileHistoryBackfills } from './backfill-history';
const functions = [historyBackfillFunction, reconcileHistoryBackfills] as unknown as {
  handler: (args: {
    event?: { data: unknown };
    step: { run: (id: string, fn: () => unknown) => Promise<unknown> };
  }) => Promise<unknown>;
}[];
const step = { run: async (_id: string, fn: () => unknown) => fn() };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DEMO_MODE', 'false');
});
test('checkpoints work before dispatching the next slice', async () => {
  mocks.processHistorySlice.mockImplementation(async () => {
    expect(mocks.dispatchHistoryBackfill).not.toHaveBeenCalled();
  });
  await functions[0].handler({
    event: { data: { repositoryId: 'repo', backfillId: 'history' } },
    step,
  });
  expect(mocks.processHistorySlice).toHaveBeenCalledWith('repo', 'history');
  expect(mocks.dispatchHistoryBackfill).toHaveBeenCalledWith('history');
});
test('reconciliation creates missing runs after completion and continues past failed dispatch', async () => {
  mocks.repositoriesMissingHistory.mockResolvedValue(['repo']);
  mocks.ensureHistoryBackfill.mockResolvedValue('created');
  mocks.listHistoryRecovery.mockResolvedValue(['old', 'another']);
  mocks.dispatchHistoryBackfill
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(undefined);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  await functions[1].handler({ step });
  expect(mocks.ensureHistoryBackfill).toHaveBeenCalledWith('repo');
  expect(mocks.dispatchHistoryBackfill.mock.calls.map((call) => call[0])).toEqual([
    'old',
    'another',
  ]);
  log.mockRestore();
});
