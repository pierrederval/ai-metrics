import { describe, expect, it } from 'vitest';
import { attributePullRequests, UNATTRIBUTED } from './attribute';
import type { ExecutedInput, PullRequestRow } from './detect-executed';

const pr = (
  id: string,
  authorLogin = 'someone',
  headRef: string | null = null,
  markers: PullRequestRow['markers'] = [],
): PullRequestRow => ({
  id,
  authorLogin,
  headRef,
  markers,
  occurredAt: '2026-01-01T00:00:00.000Z',
});

const input = (over: Partial<ExecutedInput>): ExecutedInput => ({
  pullRequests: [],
  checks: [],
  commits: [],
  reviews: [],
  ...over,
});

describe('attributePullRequests', () => {
  it('attributes a pull request by its branch prefix', () => {
    const result = attributePullRequests(
      input({ pullRequests: [pr('pr-1', 'someone', 'codex/add-thing')] }),
    );
    expect(result.get('pr-1')).toBe('codex');
  });

  it('reports a pull request with no evidence as unattributed', () => {
    const result = attributePullRequests(input({ pullRequests: [pr('pr-1')] }));
    expect(result.get('pr-1')).toBe(UNATTRIBUTED);
  });

  it('includes every pull request as a key', () => {
    const result = attributePullRequests(
      input({ pullRequests: [pr('pr-1', 'someone', 'codex/x'), pr('pr-2')] }),
    );
    expect([...result.keys()].sort()).toEqual(['pr-1', 'pr-2']);
  });

  it('prefers the agent with more distinct evidence sources', () => {
    // claude-code has branch-prefix only; codex has pr-body AND commit-trailer
    // marker evidence (catalogue.botLogins is empty for every agent in this
    // snapshot, so no real bot login can drive pr-author/commit-author
    // evidence; markers are used instead, matching the existing pattern in
    // detect-executed.test.ts).
    const result = attributePullRequests(
      input({
        pullRequests: [
          pr('pr-1', 'someone', 'claude/refactor', [
            { agent: 'codex', source: 'pr-body', ref: 'body' },
            { agent: 'codex', source: 'commit-trailer', ref: 'trailer' },
          ]),
        ],
      }),
    );
    expect(result.get('pr-1')).toBe('codex');
  });

  it('breaks a tie alphabetically', () => {
    // Two real catalogue agents, each with exactly one distinct evidence
    // source on the same PR: an actual tie, not just repeated identical input.
    const result = attributePullRequests(
      input({
        pullRequests: [
          pr('pr-1', 'someone', null, [
            { agent: 'codex', source: 'pr-body', ref: 'body' },
            { agent: 'claude-code', source: 'commit-trailer', ref: 'trailer' },
          ]),
        ],
      }),
    );
    expect(result.get('pr-1')).toBe('claude-code');
  });

  it('is not order-dependent: reversing the tied evidence gives the same attribution', () => {
    const result = attributePullRequests(
      input({
        pullRequests: [
          pr('pr-1', 'someone', null, [
            { agent: 'claude-code', source: 'commit-trailer', ref: 'trailer' },
            { agent: 'codex', source: 'pr-body', ref: 'body' },
          ]),
        ],
      }),
    );
    expect(result.get('pr-1')).toBe('claude-code');
  });
});
