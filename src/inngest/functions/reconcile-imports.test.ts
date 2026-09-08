import { expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  createFunction: vi.fn((config, handler) => ({ config, handler })),
  dispatchImport: vi.fn(),
  listUndispatchedImports: vi.fn(),
}));
vi.mock('../client', () => ({ inngest: { createFunction: mocks.createFunction } }));
vi.mock('../dispatch-import', () => mocks);
vi.mock('../../db/queries/repository-imports', () => mocks);
import './reconcile-imports';
test('one failed send leaves reconciliation able to dispatch subsequent queued imports', async () => {
  vi.stubEnv('DEMO_MODE', 'false');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.listUndispatchedImports.mockResolvedValue(['a', 'b']);
  mocks.dispatchImport.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  const { config, handler } = mocks.createFunction.mock.results[0].value;
  expect(config).toMatchObject({
    id: 'reconcile-repository-imports',
    triggers: [{ cron: '* * * * *' }],
  });
  expect(await handler({ step: { run: async (_id: string, fn: () => unknown) => fn() } })).toEqual({
    count: 2,
  });
  expect(mocks.dispatchImport.mock.calls).toEqual([['a'], ['b']]);
  log.mockRestore();
  vi.unstubAllEnvs();
});
