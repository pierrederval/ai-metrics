import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const fixture = vi.hoisted(() => ({
  userId: 'workspace-access-user',
  cookieWorkspaceId: undefined as string | undefined,
  paginate: vi.fn(),
  setCookie: vi.fn(),
}));

vi.mock('../auth/session', () => ({
  cookieOptions: { httpOnly: true, secure: false, sameSite: 'lax', path: '/' },
  currentUser: async () => ({
    id: fixture.userId,
    login: fixture.userId,
    displayName: null,
    avatarUrl: null,
  }),
  userClient: async () => ({ paginate: fixture.paginate, rest: { apps: {} } }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (fixture.cookieWorkspaceId ? { value: fixture.cookieWorkspaceId } : undefined),
    set: fixture.setCookie,
  }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found');
  },
}));

import { closeDb, db } from '../db';
import {
  installations,
  repositories,
  users,
  workspaceMemberships,
  workspaceRepositories,
  workspaces,
} from '../db/schema';
import {
  accessibleRepositories,
  linkRepository,
  requireRepository,
  requireWorkspace,
  setActiveWorkspace,
  unlinkRepository,
} from './access';

const userIds = ['workspace-access-user', 'workspace-access-other', 'workspace-access-outsider'];
const workspaceIds = ['workspace-access-own', 'workspace-access-other'];
const repositoryId = 'workspace-access-repo';
const installationId = 'workspace-access-installation';

beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });
  await db()
    .insert(users)
    .values(userIds.map((id) => ({ id, login: id, credentials: 'fixture' })));
  await db()
    .insert(workspaces)
    .values([
      { id: workspaceIds[0], name: 'Own workspace', defaultForUserId: userIds[0] },
      { id: workspaceIds[1], name: 'Other workspace' },
    ]);
  await db()
    .insert(workspaceMemberships)
    .values([
      { workspaceId: workspaceIds[0], userId: userIds[0], role: 'owner' },
      { workspaceId: workspaceIds[1], userId: userIds[0], role: 'member' },
      { workspaceId: workspaceIds[1], userId: userIds[1], role: 'owner' },
    ]);
  await db().insert(installations).values({
    id: installationId,
    githubInstallationId: '987654',
    accountLogin: 'fixture',
    accountType: 'Organization',
  });
  await db().insert(repositories).values({
    id: repositoryId,
    installationId,
    githubRepositoryId: '456789',
    owner: 'fixture',
    name: 'workspace-access',
    defaultBranch: 'main',
    isPrivate: true,
  });
  await db().insert(workspaceRepositories).values({
    workspaceId: workspaceIds[1],
    repositoryId,
    connectedBy: userIds[1],
  });
});

beforeEach(() => {
  fixture.userId = userIds[0];
  fixture.cookieWorkspaceId = workspaceIds[0];
  fixture.paginate.mockReset();
  fixture.setCookie.mockReset();
});

afterAll(async () => {
  await db()
    .delete(workspaceRepositories)
    .where(inArray(workspaceRepositories.workspaceId, workspaceIds));
  await db()
    .delete(workspaceMemberships)
    .where(inArray(workspaceMemberships.workspaceId, workspaceIds));
  await db().delete(workspaces).where(inArray(workspaces.id, workspaceIds));
  await db().delete(repositories).where(eq(repositories.id, repositoryId));
  await db().delete(installations).where(eq(installations.id, installationId));
  await db().delete(users).where(inArray(users.id, userIds));
  await closeDb();
});

test('a GitHub-visible repo is not automatically a workspace repo', async () => {
  fixture.paginate
    .mockResolvedValueOnce([{ id: 987654, suspended_at: null }])
    .mockResolvedValueOnce([{ id: 456789, permissions: { admin: true } }]);

  expect(await accessibleRepositories()).toEqual([]);
  await expect(linkRepository(workspaceIds[1], repositoryId)).rejects.toThrow('not found');
});

test('a member reads every active linked repository without a personal GitHub request', async () => {
  fixture.cookieWorkspaceId = workspaceIds[1];

  expect(await accessibleRepositories()).toEqual([
    expect.objectContaining({ id: repositoryId, canAdmin: false }),
  ]);
  expect(fixture.paginate).not.toHaveBeenCalled();
});

test('an explicit workspace id never falls back to another membership', async () => {
  fixture.userId = userIds[1];
  fixture.cookieWorkspaceId = workspaceIds[1];

  await expect(requireWorkspace(workspaceIds[0])).rejects.toThrow('not found');
});

test('an outsider cannot read a linked repository', async () => {
  fixture.userId = userIds[2];
  fixture.cookieWorkspaceId = workspaceIds[1];

  await expect(requireRepository(repositoryId)).rejects.toThrow('not found');
  expect(fixture.paginate).not.toHaveBeenCalled();
});

test('a stale preference falls back to the user default without writing during render', async () => {
  fixture.cookieWorkspaceId = 'deleted-workspace';

  await expect(requireWorkspace()).resolves.toEqual({
    id: workspaceIds[0],
    name: 'Own workspace',
    role: 'owner',
  });
  expect(fixture.setCookie).not.toHaveBeenCalled();
});

test('changing the active workspace changes repository visibility', async () => {
  expect(await accessibleRepositories()).toEqual([]);
  fixture.cookieWorkspaceId = workspaceIds[1];
  expect(await accessibleRepositories()).toEqual([expect.objectContaining({ id: repositoryId })]);
});

test('suspended installations are excluded from member reads', async () => {
  fixture.cookieWorkspaceId = workspaceIds[1];
  await db()
    .update(installations)
    .set({ active: false })
    .where(eq(installations.id, installationId));
  expect(await accessibleRepositories()).toEqual([]);
  await db()
    .update(installations)
    .set({ active: true })
    .where(eq(installations.id, installationId));
});

test('disconnect removes only the selected workspace link', async () => {
  fixture.userId = userIds[1];
  fixture.cookieWorkspaceId = workspaceIds[1];
  await unlinkRepository(workspaceIds[1], repositoryId);
  expect(await accessibleRepositories()).toEqual([]);
  expect(
    await db().select().from(repositories).where(eq(repositories.id, repositoryId)),
  ).toHaveLength(1);
  await db().insert(workspaceRepositories).values({
    workspaceId: workspaceIds[1],
    repositoryId,
    connectedBy: userIds[1],
  });
});

test('an owner can link only a repository with a fresh GitHub admin grant', async () => {
  fixture.paginate
    .mockResolvedValueOnce([{ id: 987654, suspended_at: null }])
    .mockResolvedValueOnce([{ id: 456789, permissions: { admin: true } }]);
  await linkRepository(workspaceIds[0], repositoryId);
  expect(await requireRepository(repositoryId)).toMatchObject({ id: repositoryId });
});

test('the active workspace cookie uses the shared HTTP-only options', async () => {
  await setActiveWorkspace(workspaceIds[0]);
  expect(fixture.setCookie).toHaveBeenCalledWith(
    'fieldnote-workspace',
    workspaceIds[0],
    expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
  );
});
