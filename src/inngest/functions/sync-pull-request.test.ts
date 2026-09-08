import { expect, test, vi } from 'vitest';
import { RetryAfterError } from 'inngest';
import { GithubCollectionRetryError } from '../../github/retry-errors';
const mocks = vi.hoisted(() => ({
  createFunction: vi.fn((config, handler) => ({ config, handler })),
  runForegroundHydration: vi.fn(),
  finishForegroundHydration: vi.fn(),
}));
vi.mock('../client', () => ({ inngest: { createFunction: mocks.createFunction } }));
vi.mock('../../db/queries/foreground-hydration', () => mocks);
import './sync-pull-request';
const { handler, config } = mocks.createFunction.mock.results[0].value;
const data = { repositoryId: 'repo', number: 1, hydrationId: 'work', sourceEventId: 'source' };
test('foreground worker forwards a stable execution identity and honors sanitized retry deadlines', async () => {
  const error = new GithubCollectionRetryError([
    { status: 403, errorCategory: 'rate-limit', retryAt: '2026-09-20T00:00:00.000Z' },
  ]);
  mocks.runForegroundHydration.mockRejectedValueOnce(error);
  const result = handler({
    event: { data },
    runId: 'execution',
    step: { run: async (_name: string, fn: () => unknown) => fn() },
  });
  await expect(result).rejects.toBeInstanceOf(RetryAfterError);
  await expect(result).rejects.toMatchObject({ retryAfter: '2026-09-20T00:00:00.000Z' });
  expect(mocks.runForegroundHydration).toHaveBeenCalledWith(data, 'execution');
});
test('exhausted failure closes only its own lifecycle execution', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  await config.onFailure({
    event: { data: { event: { data }, run_id: 'failed-execution' } },
    error: new Error('failed'),
  });
  expect(mocks.finishForegroundHydration).toHaveBeenCalledWith(data, 'failed', 'failed-execution');
  log.mockRestore();
});
