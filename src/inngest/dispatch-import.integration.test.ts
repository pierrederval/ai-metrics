import * as imports from '../db/queries/repository-imports';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, test, vi } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, closeDb } from '../db';
import { installations, repositories, repositoryImports } from '../db/schema';
import { inArray } from 'drizzle-orm';
import {
  requestRepositoryImport,
  listUndispatchedImports,
  beginImport,
  failImport,
} from '../db/queries/repository-imports';
import { dispatchImport } from './dispatch-import';
beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });
});
afterAll(closeDb);
async function seedRepository() {
  const id = randomUUID();
  await db()
    .insert(installations)
    .values({ id, githubInstallationId: id, accountLogin: 'test', accountType: 'User' });
  await db().insert(repositories).values({
    id,
    installationId: id,
    githubRepositoryId: id,
    owner: 'test',
    name: 'repo',
    defaultBranch: 'main',
    isPrivate: true,
  });
  return id;
}

test('dispatch failure retains a recoverable queued run', async () => {
  const id = await seedRepository();
  const run = await requestRepositoryImport(id, 'start');
  await expect(
    dispatchImport(run.id, async () => {
      throw new Error('offline');
    }),
  ).rejects.toThrow('offline');
  expect(await listUndispatchedImports()).toContain(run.id);
  const send = vi.fn().mockResolvedValue(undefined);
  await dispatchImport(run.id, send);
  await dispatchImport(run.id, send);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith({
    id: run.id,
    name: 'github/repository.sync.requested',
    data: { repositoryId: id, runId: run.id },
  });
  expect(await listUndispatchedImports()).not.toContain(run.id);
});
test('running and terminal imports are not dispatched', async () => {
  const run = await requestRepositoryImport(await seedRepository(), 'start');
  const send = vi.fn();
  await beginImport(run.id);
  await dispatchImport(run.id, send);
  await failImport(run.id, 'Interrupted');
  await dispatchImport(run.id, send);
  expect(send).not.toHaveBeenCalled();
  expect(await listUndispatchedImports()).not.toContain(run.id);
});

test('acknowledged send followed by marker failure resends the same identity', async () => {
  const id = await seedRepository();
  const run = await requestRepositoryImport(id, 'start');
  const send = vi.fn().mockResolvedValue(undefined);
  const mark = vi
    .spyOn(imports, 'markImportDispatched')
    .mockRejectedValueOnce(new Error('connection lost'));
  try {
    await expect(dispatchImport(run.id, send)).rejects.toThrow('connection lost');
    expect(await listUndispatchedImports()).toContain(run.id);
    await dispatchImport(run.id, send);
    expect(send.mock.calls).toEqual([
      [
        {
          id: run.id,
          name: 'github/repository.sync.requested',
          data: { repositoryId: id, runId: run.id },
        },
      ],
      [
        {
          id: run.id,
          name: 'github/repository.sync.requested',
          data: { repositoryId: id, runId: run.id },
        },
      ],
    ]);
    expect(await listUndispatchedImports()).not.toContain(run.id);
  } finally {
    mark.mockRestore();
  }
});

test('outbox is capped at the oldest 100 queued imports', async () => {
  const ids = Array.from({ length: 101 }, () => randomUUID());
  await db()
    .insert(installations)
    .values(
      ids.map((id) => ({
        id,
        githubInstallationId: id,
        accountLogin: 'test',
        accountType: 'User',
      })),
    );
  try {
    await db()
      .insert(repositories)
      .values(
        ids.map((id) => ({
          id,
          installationId: id,
          githubRepositoryId: id,
          owner: 'test',
          name: 'repo',
          defaultBranch: 'main',
          isPrivate: true,
        })),
      );
    await db()
      .insert(repositoryImports)
      .values(
        ids.map((id, index) => ({
          id,
          repositoryId: id,
          state: 'queued' as const,
          createdAt: new Date(index * 1000),
        })),
      );
    expect(await listUndispatchedImports()).toEqual(ids.slice(0, 100));
  } finally {
    await db().delete(repositoryImports).where(inArray(repositoryImports.id, ids));
    await db().delete(repositories).where(inArray(repositories.id, ids));
    await db().delete(installations).where(inArray(installations.id, ids));
  }
});
