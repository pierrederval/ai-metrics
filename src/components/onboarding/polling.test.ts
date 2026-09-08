import { afterEach, expect, test, vi } from 'vitest';
import { pollDelay, progressPercent, startPolling } from './polling';
import type { ImportSnapshot } from '../../domain/import/types';
const run: ImportSnapshot = {
  id: 'r',
  repositoryId: 'repo',
  state: 'discovering',
  total: null,
  completed: 0,
  failed: 0,
  message: null,
  createdAt: '2026-09-08T00:00:00.000Z',
  finishedAt: null,
};
afterEach(() => vi.useRealTimers());
test('unknown and empty totals never invent a percentage', () => {
  expect(progressPercent(run)).toBeNull();
  expect(progressPercent({ ...run, state: 'complete', total: 0 })).toBeNull();
  expect(progressPercent({ ...run, state: 'importing', total: 100, completed: 24 })).toBe(24);
  expect(progressPercent({ ...run, state: 'partial', total: 100, completed: 90, failed: 10 })).toBe(
    90,
  );
});
test('polling backs off with a ceiling', () => {
  expect(pollDelay(0)).toBe(2000);
  expect(pollDelay(1)).toBe(4000);
  expect(pollDelay(10)).toBe(30000);
});
function fixture(fetcher: typeof fetch) {
  let hidden = false;
  let changed = () => {};
  const updates: Array<{ snapshot: ImportSnapshot; connection: string }> = [];
  const stop = startPolling(run, (snapshot, connection) => updates.push({ snapshot, connection }), {
    fetch: fetcher,
    hidden: () => hidden,
    subscribe: (listener) => {
      changed = listener;
      return () => {
        changed = () => {};
      };
    },
  });
  return {
    updates,
    stop,
    visibility: (value: boolean) => {
      hidden = value;
      changed();
    },
  };
}
test.each([401, 404])('stops on %s before attempting HTML parsing', async (status) => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('<html>Unavailable</html>', { status }));
  const f = fixture(fetcher);
  await vi.advanceTimersByTimeAsync(60000);
  expect(f.updates.at(-1)?.connection).toBe(status === 401 ? 'signed-out' : 'unavailable');
  expect(fetcher).toHaveBeenCalledTimes(1);
  f.stop();
});
test('retains progress across invalid responses, recovers, and stops at terminal snapshot', async () => {
  vi.useFakeTimers();
  const complete = { ...run, state: 'complete', total: 2, completed: 2 };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('oops', { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ...run, completed: 'invalid' }))
    .mockResolvedValueOnce(Response.json(complete));
  const f = fixture(fetcher);
  await vi.advanceTimersByTimeAsync(0);
  expect(f.updates.at(-1)).toEqual({ snapshot: run, connection: 'reconnecting' });
  await vi.advanceTimersByTimeAsync(4000);
  expect(f.updates.at(-1)?.snapshot).toEqual(run);
  await vi.advanceTimersByTimeAsync(8000);
  expect(f.updates.at(-1)).toEqual({ snapshot: complete, connection: 'connected' });
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetcher).toHaveBeenCalledTimes(3);
  f.stop();
});
test('one outstanding request; hiding aborts, resuming restarts, disposal ignores late results', async () => {
  vi.useFakeTimers();
  const requests: Array<{ signal: AbortSignal; resolve: (response: Response) => void }> = [];
  const fetcher: typeof fetch = (_url, options) =>
    new Promise((resolve) => requests.push({ signal: options!.signal!, resolve }));
  const f = fixture(fetcher);
  await vi.advanceTimersByTimeAsync(60000);
  expect(requests).toHaveLength(1);
  f.visibility(true);
  expect(requests[0].signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(60000);
  expect(requests).toHaveLength(1);
  requests[0].resolve(Response.json(run));
  await vi.advanceTimersByTimeAsync(0);
  f.visibility(false);
  expect(requests).toHaveLength(2);
  f.stop();
  expect(requests[1].signal.aborted).toBe(true);
  requests[1].resolve(Response.json({ ...run, state: 'complete' }));
  await vi.advanceTimersByTimeAsync(60000);
  expect(f.updates).toEqual([]);
  expect(requests).toHaveLength(2);
});
