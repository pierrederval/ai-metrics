import { expect, test } from 'vitest';
import { matchCommitTrailers, matchPullRequestBody } from './markers';

test('a Claude co-author trailer is matched and the message is not returned', () => {
  const markers = matchCommitTrailers(
    'abc123',
    'fix: thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
  );
  expect(markers).toEqual([{ agent: 'claude-code', source: 'commit-trailer', ref: 'abc123' }]);
});

test('marker matching is case insensitive', () => {
  expect(matchCommitTrailers('abc', 'co-authored-by: claude opus 5 <x@y>')).toHaveLength(1);
});

test('an ordinary human co-author is not an agent', () => {
  expect(matchCommitTrailers('abc', 'Co-authored-by: Dana <dana@example.com>')).toEqual([]);
});

test('one commit citing an agent twice yields one marker', () => {
  const markers = matchCommitTrailers(
    'abc',
    'Generated with Claude Code\n\nCo-Authored-By: Claude <x@y>',
  );
  expect(markers).toEqual([{ agent: 'claude-code', source: 'commit-trailer', ref: 'abc' }]);
});

test('a null pull-request body yields no markers', () => {
  expect(matchPullRequestBody(null)).toEqual([]);
});

test('a pull-request body marker records its source', () => {
  expect(matchPullRequestBody('Generated with [Claude Code](https://claude.com/claude-code)')).toEqual(
    [{ agent: 'claude-code', source: 'pr-body', ref: 'body' }],
  );
});
