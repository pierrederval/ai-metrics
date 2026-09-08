import { beforeEach, expect, test, vi } from 'vitest';
import { notFound, redirect } from 'next/navigation';
const { session, authorize, getImport } = vi.hoisted(() => ({
  session: vi.fn(),
  authorize: vi.fn(),
  getImport: vi.fn(),
}));
vi.mock('../../../../../../auth/session', () => ({ hasCurrentSession: session }));
vi.mock('../../../../../../auth/access', () => ({ requireRepository: authorize }));
vi.mock('../../../../../../db/queries/repository-imports', () => ({ getImport }));
import { GET } from './route';
const snapshot = {
  id: 'run',
  repositoryId: 'repo',
  state: 'queued',
  total: null,
  completed: 0,
  failed: 0,
  message: null,
  createdAt: '2026-09-08T00:00:00.000Z',
  finishedAt: null,
};
const call = () =>
  GET(new Request('http://localhost/api/repos/repo/imports/run'), {
    params: Promise.resolve({ repoId: 'repo', runId: 'run' }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue(true);
  getImport.mockResolvedValue({
    snapshot,
    items: [{ number: 1, state: 'pending' }],
    secret: 'credentials',
  });
});
test('unauthenticated status returns private 401 before access or run lookup', async () => {
  session.mockResolvedValue(false);
  const response = await call();
  expect(response.status).toBe(401);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(authorize).not.toHaveBeenCalled();
  expect(getImport).not.toHaveBeenCalled();
});
test('reader receives only snapshot after current repository authorization', async () => {
  const response = await call();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(snapshot);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(authorize).toHaveBeenCalledWith('repo');
  expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(getImport.mock.invocationCallOrder[0]);
});
test.each([null, { snapshot: { ...snapshot, repositoryId: 'other' } }])(
  'missing or foreign run returns private 404',
  async (run) => {
    getImport.mockResolvedValue(run);
    const response = await call();
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  },
);
test('revoked access retains framework 404 and never reads the run', async () => {
  authorize.mockImplementationOnce(() => notFound());
  await expect(call()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  expect(getImport).not.toHaveBeenCalled();
});
test('expired authorization redirects propagate', async () => {
  authorize.mockImplementationOnce(() => redirect('/api/auth/login'));
  await expect(call()).rejects.toThrow('NEXT_REDIRECT');
});
test('GitHub transport failures return safe private 503', async () => {
  authorize.mockRejectedValueOnce(new Error('secret transport error'));
  const response = await call();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: 'Import status is temporarily unavailable. Try again.',
  });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(getImport).not.toHaveBeenCalled();
});
