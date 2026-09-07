import { expect, test } from 'vitest';
import { authorizeRepository } from './authorization';
const repo = { githubRepositoryId: '1', installationId: '2', active: true, isDemo: false };
test('repository and installation identity must both match; admin mutations require admin', () => {
  expect(authorizeRepository(repo, [])).toBe(false);
  expect(
    authorizeRepository(repo, [{ githubRepositoryId: '1', installationId: 'wrong', admin: true }]),
  ).toBe(false);
  const grants = [{ githubRepositoryId: '1', installationId: '2', admin: false }];
  expect(authorizeRepository(repo, grants)).toBe(true);
  expect(authorizeRepository(repo, grants, true)).toBe(false);
  expect(authorizeRepository({ ...repo, active: false }, grants)).toBe(false);
  expect(authorizeRepository({ ...repo, isDemo: true }, grants)).toBe(false);
});
