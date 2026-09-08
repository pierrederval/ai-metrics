import type { ImportItem, ImportState } from './types';
export const isActiveImport = (state: ImportState) =>
  state === 'queued' || state === 'discovering' || state === 'importing';
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
