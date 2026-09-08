import { z } from 'zod';
import type { ImportSnapshot } from '../../domain/import/types';
import { isActiveImport } from '../../domain/import/progress';
export type Connection = 'connected' | 'reconnecting' | 'signed-out' | 'unavailable';
export const pollDelay = (failures: number) => Math.min(30000, 2000 * 2 ** Math.min(failures, 4));
export const progressPercent = (run: ImportSnapshot) =>
  run.total === null || run.total === 0 ? null : Math.min(100, (100 * run.completed) / run.total);
const snapshotSchema = z.object({
  id: z.string().min(1),
  repositoryId: z.string().min(1),
  state: z.enum(['queued', 'discovering', 'importing', 'complete', 'partial', 'failed']),
  total: z.number().int().nonnegative().nullable(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  message: z.string().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});
export function startPolling(
  initial: ImportSnapshot,
  update: (snapshot: ImportSnapshot, connection: Connection) => void,
  environment: {
    fetch: typeof fetch;
    hidden: () => boolean;
    subscribe: (listener: () => void) => () => void;
  },
) {
  let snapshot = initial,
    failures = 0,
    stopped = !isActiveImport(initial.state),
    disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  function cancel() {
    clearTimeout(timer);
    request?.abort();
    request = undefined;
  }
  async function poll() {
    if (stopped || disposed || environment.hidden() || request) return;
    const controller = new AbortController();
    request = controller;
    try {
      const response = await environment.fetch(
        `/api/repos/${encodeURIComponent(initial.repositoryId)}/imports/${encodeURIComponent(initial.id)}`,
        { cache: 'no-store', signal: controller.signal },
      );
      if (controller.signal.aborted || disposed) return;
      // Next owns revoked-access 404 pages, so inspect status before JSON/content type.
      if (response.status === 401 || response.status === 404) {
        stopped = true;
        update(snapshot, response.status === 401 ? 'signed-out' : 'unavailable');
        return;
      }
      if (
        !response.ok ||
        response.redirected ||
        !response.headers.get('content-type')?.includes('application/json')
      )
        throw new Error('Invalid status response');
      const next = snapshotSchema.parse(await response.json());
      if (next.id !== initial.id || next.repositoryId !== initial.repositoryId)
        throw new Error('Foreign snapshot');
      if (controller.signal.aborted || disposed) return;
      snapshot = next;
      failures = 0;
      stopped = !isActiveImport(snapshot.state);
      update(snapshot, 'connected');
    } catch {
      if (controller.signal.aborted || disposed) return;
      failures++;
      update(snapshot, 'reconnecting');
    } finally {
      if (request === controller) {
        request = undefined;
        if (!stopped && !disposed && !environment.hidden())
          timer = setTimeout(poll, pollDelay(failures));
      }
    }
  }
  const unsubscribe = environment.subscribe(() => {
    cancel();
    if (!environment.hidden()) void poll();
  });
  void poll();
  return () => {
    disposed = true;
    cancel();
    unsubscribe();
  };
}
