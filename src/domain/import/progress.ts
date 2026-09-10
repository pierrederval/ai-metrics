import type { ImportItem, ImportState } from './types';
export const isActiveImport = (state: ImportState) =>
  state === 'queued' || state === 'discovering' || state === 'importing';
// Refresh must not be offered while an import is in flight, nor after a failed
// or partial one. Refresh inserts a NEW run, and only the latest run may be
// retried, so offering Refresh over a failed or partial import destroys the
// Retry path beside it — and for a partial import, retry preserves the items
// already collected where refresh rediscovers all 100 from scratch.
export const canRefreshImport = (state: ImportState | null) =>
  state === null || state === 'complete';
export function summarizeImport(items: ImportItem[]) {
  const completed = items.filter((i) => i.state === 'complete').length;
  const failed = items.filter((i) => i.state === 'failed').length;
  const total = items.length;
  const state: ImportState =
    completed + failed < total
      ? 'importing'
      : failed === 0
        ? 'complete'
        : completed === 0
          ? 'failed'
          : 'partial';
  return { state, total, completed, failed };
}
