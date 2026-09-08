import { expect, test } from 'vitest';
import { summarizeImport, isActiveImport } from './progress';
test('zero PRs completes, partial evidence is explicit', () => {
  expect(summarizeImport([])).toEqual({ state: 'complete', total: 0, completed: 0, failed: 0 });
  expect(
    summarizeImport([
      { number: 1, state: 'complete' },
      { number: 2, state: 'failed' },
    ]),
  ).toEqual({ state: 'partial', total: 2, completed: 1, failed: 1 });
  expect(summarizeImport([{ number: 1, state: 'failed' }]).state).toBe('failed');
  expect(summarizeImport([{ number: 1, state: 'pending' }]).state).toBe('importing');
  for (const state of ['queued', 'discovering', 'importing'] as const)
    expect(isActiveImport(state)).toBe(true);
  for (const state of ['partial', 'complete', 'failed'] as const)
    expect(isActiveImport(state)).toBe(false);
});
