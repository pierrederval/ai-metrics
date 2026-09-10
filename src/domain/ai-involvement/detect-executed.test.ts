import { expect, test, vi } from 'vitest';
import { detectExecuted, type PullRequestRow } from './detect-executed';
import type { AgentId } from './types';

// Agent ids are persisted as jsonb and outlive the code that wrote them, so a
// stale row can carry an id the current catalogue no longer knows. JSON.parse
// (rather than a type assertion) reproduces that: the value genuinely arrives
// untyped, the same way a persisted marker does when it is read back.
const retiredAgent: AgentId = JSON.parse('"retired-agent"');

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

test('a marker whose agent is not in the catalogue is skipped, not thrown', () => {
  // Agent ids are persisted in pull_requests.agent_markers and outlive the code
  // that wrote them: a catalogue entry can be renamed or removed while old rows
  // still carry it. That must degrade, not fail the whole repository's recompute.
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const result = detectExecuted({
    ...empty,
    pullRequests: [
      pr('1', {
        headRef: 'codex/one',
        markers: [{ agent: retiredAgent, source: 'pr-body', ref: 'body' }],
      }),
    ],
  });
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ agent: 'codex', occurrences: 1 });
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain('retired-agent');
  warn.mockRestore();
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
