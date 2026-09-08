import { beforeEach, expect, test, vi } from 'vitest';
import type { ImportExecution } from '../../domain/import/types';
import { summarizeImport } from '../../domain/import/progress';
const mocks = vi.hoisted(() => ({
  ensureHistoryBackfill: vi.fn(),
  dispatchHistoryBackfill: vi.fn(),
  createFunction: vi.fn((config, handler) => ({ config, handler })),
  getImport: vi.fn(),
  beginImport: vi.fn(),
  saveImportBatch: vi.fn(),
  recordImportItem: vi.fn(),
  finishImport: vi.fn(),
  failImport: vi.fn(),
  latestPullRequests: vi.fn(),
  assertTrackedRepository: vi.fn(),
}));
vi.mock('../../db/queries/history-backfill', () => mocks);
vi.mock('../dispatch-history', () => mocks);
vi.mock('../client', () => ({ inngest: { createFunction: mocks.createFunction } }));
vi.mock('../../db/queries/repository-imports', () => mocks);
vi.mock('../../github/sync-repository', () => mocks);
vi.mock('../../github/repositories', () => mocks);
vi.mock('./sync-pull-request', () => ({ syncPullRequestFunction: {} }));
import './sync-repository';
const { config, handler } = mocks.createFunction.mock.results[0].value;
let run: ImportExecution;
const step = { run: vi.fn(async (_id: string, fn: () => unknown) => fn()), invoke: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  run = {
    snapshot: {
      id: 'run',
      repositoryId: 'repo',
      state: 'queued',
      total: null,
      completed: 0,
      failed: 0,
      message: null,
      createdAt: '',
      finishedAt: null,
    },
    items: [],
  };
  mocks.getImport.mockImplementation(async () => run);
  mocks.beginImport.mockImplementation(async () => run);
  mocks.latestPullRequests.mockResolvedValue([2, 1]);
  mocks.saveImportBatch.mockImplementation(async (_id, numbers: number[]) => {
    run.items = numbers.map((number) => ({ number, state: 'pending' }));
    run.snapshot.total = numbers.length;
    return run;
  });
  mocks.recordImportItem.mockImplementation(async (_id, number, state) => {
    run.items.find((item) => item.number === number)!.state = state;
  });
  mocks.finishImport.mockImplementation(async () => ({
    ...run.snapshot,
    ...summarizeImport(run.items),
  }));
  step.invoke.mockResolvedValue(undefined);
});
const execute = (repositoryId = 'repo') =>
  handler({ event: { data: { repositoryId, runId: 'run' } }, step });
test('discovers once and completes the batch', async () => {
  expect(await execute()).toMatchObject({ state: 'complete', total: 2, completed: 2 });
  expect(mocks.latestPullRequests).toHaveBeenCalledTimes(1);
  expect(step.invoke).toHaveBeenCalledTimes(2);
  expect(config.singleton.key).toBe('event.data.runId');
});
test('stored batch only hydrates pending items without discovering again', async () => {
  run.snapshot.total = 3;
  run.items = [
    { number: 1, state: 'complete' },
    { number: 2, state: 'pending' },
    { number: 3, state: 'failed' },
  ];
  expect(await execute()).toMatchObject({ state: 'partial', completed: 2, failed: 1 });
  expect(mocks.latestPullRequests).not.toHaveBeenCalled();
  expect(step.invoke).toHaveBeenCalledTimes(1);
  expect(step.invoke).toHaveBeenCalledWith(
    'pr-2',
    expect.objectContaining({ data: { repositoryId: 'repo', number: 2 } }),
  );
});
test('exhausted child rejection counts a failed item and finishes partial', async () => {
  step.invoke.mockRejectedValueOnce(new Error('private token stack'));
  expect(await execute()).toMatchObject({ state: 'partial', completed: 1, failed: 1 });
});
test('terminal duplicate performs no work', async () => {
  run.snapshot.state = 'complete';
  expect(await execute()).toEqual(run.snapshot);
  expect(mocks.beginImport).not.toHaveBeenCalled();
  expect(mocks.assertTrackedRepository).not.toHaveBeenCalled();
  expect(mocks.latestPullRequests).not.toHaveBeenCalled();
  expect(step.invoke).not.toHaveBeenCalled();
  expect(mocks.finishImport).not.toHaveBeenCalled();
});
test('repository/run mismatch hydrates and mutates nothing', async () => {
  await expect(execute('other')).rejects.toThrow('Import unavailable');
  expect(mocks.beginImport).not.toHaveBeenCalled();
  expect(mocks.latestPullRequests).not.toHaveBeenCalled();
  expect(step.invoke).not.toHaveBeenCalled();
});
test('failure callback rejects mismatched ownership and keeps internal error out of stored message', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = new Error('private stack');
  await config.onFailure({
    event: { data: { event: { data: { repositoryId: 'other', runId: 'run' } } } },
    error,
  });
  expect(mocks.failImport).not.toHaveBeenCalled();
  await config.onFailure({
    event: { data: { event: { data: { repositoryId: 'repo', runId: 'run' } } } },
    error,
  });
  expect(mocks.failImport).toHaveBeenCalledWith(
    'run',
    'We couldn’t finish the import. Please retry.',
  );
  log.mockRestore();
});
test('discovery committed before its step acknowledgement is reused', async () => {
  const stored: ImportExecution = {
    ...run,
    snapshot: { ...run.snapshot, total: 1 },
    items: [{ number: 9, state: 'pending' }],
  };
  mocks.getImport.mockResolvedValueOnce(run).mockResolvedValueOnce(stored);
  run = stored;
  mocks.beginImport.mockResolvedValueOnce({
    ...stored,
    snapshot: { ...stored.snapshot, total: null },
  });
  expect(await execute()).toMatchObject({ completed: 1, total: 1 });
  expect(mocks.latestPullRequests).not.toHaveBeenCalled();
  expect(step.invoke).toHaveBeenCalledWith('pr-9', expect.anything());
});
test('item stays pending while the child invocation is retrying', async () => {
  let resolveChild!: () => void;
  const pending = new Promise<void>((resolve) => {
    resolveChild = resolve;
  });
  mocks.latestPullRequests.mockResolvedValue([1]);
  step.invoke.mockImplementationOnce(() => pending);
  const result = execute();
  await vi.waitFor(() => expect(step.invoke).toHaveBeenCalledTimes(1));
  expect(run.items).toEqual([{ number: 1, state: 'pending' }]);
  expect(mocks.recordImportItem).not.toHaveBeenCalled();
  resolveChild();
  expect(await result).toMatchObject({ completed: 1, failed: 0 });
});

test('initial import success survives failure creating the background run', async () => {
  mocks.ensureHistoryBackfill.mockRejectedValueOnce(new Error('offline'));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await execute()).toMatchObject({ state: 'complete', completed: 2 });
  expect(mocks.ensureHistoryBackfill).toHaveBeenCalledWith('repo');
  expect(mocks.failImport).not.toHaveBeenCalled();
  log.mockRestore();
});
