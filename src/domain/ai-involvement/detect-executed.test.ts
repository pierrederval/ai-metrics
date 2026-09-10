import { expect, test } from 'vitest';
import { detectExecuted, type PullRequestRow } from './detect-executed';

const pr = (id: string, over: Partial<PullRequestRow> = {}): PullRequestRow => ({
  id,
  authorLogin: 'dana',
  headRef: null,
  markers: [],
  occurredAt: '2026-09-08T00:00:00Z',
  ...over,
});
const empty = { pullRequests: [], checks: [], commits: [], reviews: [] };

test('no rows produce no detections', () => {
  expect(detectExecuted(empty)).toEqual([]);
});

test('a branch prefix on two pull requests counts two occurrences', () => {
  const result = detectExecuted({
    ...empty,
    pullRequests: [pr('1', { headRef: 'codex/one' }), pr('2', { headRef: 'codex/two' })],
  });
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ agent: 'codex', signal: 'executed', occurrences: 2 });
  expect(result[0].evidence).toEqual([{ source: 'branch-prefix', value: 'codex/', prCount: 2 }]);
});

test('two sources for one agent produce one detection with distinct-PR occurrences', () => {
  const result = detectExecuted({
    ...empty,
    pullRequests: [
      pr('1', {
        headRef: 'codex/one',
        markers: [{ agent: 'codex', source: 'pr-body', ref: 'body' }],
      }),
    ],
  });
  expect(result).toHaveLength(1);
  expect(result[0].occurrences).toBe(1);
  expect(result[0].evidence).toHaveLength(2);
});

test('an unknown check application is ignored', () => {
  const result = detectExecuted({
    ...empty,
    pullRequests: [pr('1')],
    checks: [{ pullRequestId: '1', appId: '999999', occurredAt: null }],
  });
  expect(result).toEqual([]);
});

test('first and last seen ignore null timestamps', () => {
  const result = detectExecuted({
    ...empty,
    pullRequests: [
      pr('1', { headRef: 'codex/a', occurredAt: '2026-09-01T00:00:00Z' }),
      pr('2', { headRef: 'codex/b', occurredAt: '2026-09-09T00:00:00Z' }),
    ],
  });
  expect(result[0].firstSeenAt).toBe('2026-09-01T00:00:00Z');
  expect(result[0].lastSeenAt).toBe('2026-09-09T00:00:00Z');
});

test('a row referencing an absent pull request is discarded', () => {
  const result = detectExecuted({
    ...empty,
    commits: [{ pullRequestId: 'missing', authorLogin: 'claude[bot]', occurredAt: null }],
  });
  expect(result).toEqual([]);
});

test('detections are ordered by occurrences descending then agent ascending', () => {
  const result = detectExecuted({
    ...empty,
    pullRequests: [
      pr('1', { headRef: 'codex/a' }),
      pr('2', { headRef: 'codex/b' }),
      pr('3', { headRef: 'claude/a' }),
    ],
  });
  expect(result.map((detection) => detection.agent)).toEqual(['codex', 'claude-code']);
});
