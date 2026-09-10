import { expect, test } from 'vitest';
import { railRows } from './rail';
import type { Detection } from '../../domain/ai-involvement/types';

const d = (agent: string, occurrences: number | null, signal = 'executed'): Detection =>
  ({
    agent,
    occurrences,
    signal,
    kind: 'coding-agent',
    evidence: [],
    firstSeenAt: null,
    lastSeenAt: '2026-09-01T00:00:00Z',
  }) as Detection;

test('at most four rows are shown and the rest are counted', () => {
  const result = railRows([d('a', 5), d('b', 4), d('c', 3), d('d', 2), d('e', 1)]);
  expect(result.shown).toHaveLength(4);
  expect(result.hiddenCount).toBe(1);
});

test('executed rows sort before configured rows', () => {
  const result = railRows([d('cursor', null, 'configured'), d('codex', 1)]);
  expect(result.shown.map((row) => row.agent)).toEqual(['codex', 'cursor']);
});

test('four detections hide nothing', () => {
  expect(railRows([d('a', 4), d('b', 3), d('c', 2), d('d', 1)]).hiddenCount).toBe(0);
});

test('no detections show nothing and hide nothing', () => {
  expect(railRows([])).toEqual({ shown: [], hiddenCount: 0 });
});
