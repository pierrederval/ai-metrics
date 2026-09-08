import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, test } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';
import { db, closeDb } from './index';
import { installations, repositories } from './schema';
import {
  requestRepositoryImport,
  getImport,
  latestImport,
  beginImport,
  saveImportBatch,
  recordImportItem,
  finishImport,
  failImport,
} from './queries/repository-imports';
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
test('concurrent starts and replay preserve one batch and exact counts', async () => {
  const repoId = await seedRepository();
  const [a, b] = await Promise.all([
    requestRepositoryImport(repoId, 'start'),
    requestRepositoryImport(repoId, 'start'),
  ]);
  expect(a.id).toBe(b.id);
  expect(
    (await db().select().from(repositories).where(eq(repositories.id, repoId)))[0]
      .trackingStartedAt,
  ).toBeInstanceOf(Date);
  await beginImport(a.id);
  await saveImportBatch(a.id, [7, 6, 7]);
  await saveImportBatch(a.id, [99]);
  await expect(finishImport(a.id)).rejects.toThrow();
  await recordImportItem(a.id, 7, 'complete');
  await recordImportItem(a.id, 7, 'failed');
  await recordImportItem(a.id, 6, 'failed');
  expect(await finishImport(a.id)).toMatchObject({
    state: 'partial',
    total: 2,
    completed: 1,
    failed: 1,
  });
  const [retry, replay] = await Promise.all([
    requestRepositoryImport(repoId, 'retry', a.id),
    requestRepositoryImport(repoId, 'retry', a.id),
  ]);
  expect(retry.id).toBe(replay.id);
  expect((await getImport(retry.id))?.items).toEqual([
    { number: 6, state: 'pending' },
    { number: 7, state: 'complete' },
  ]);
  await beginImport(retry.id);
  await recordImportItem(retry.id, 6, 'complete');
  expect(await finishImport(retry.id)).toMatchObject({
    state: 'complete',
    completed: 2,
    failed: 0,
  });
  expect((await requestRepositoryImport(repoId, 'retry', a.id)).id).toBe(retry.id);
});
test('zero PRs completes and terminal mutations cannot change a completed run', async () => {
  const repo = await seedRepository();
  expect(await latestImport(repo)).toBeNull();
  expect(await getImport(randomUUID())).toBeNull();
  const run = await requestRepositoryImport(repo, 'start');
  await beginImport(run.id);
  await saveImportBatch(run.id, []);
  const finished = await finishImport(run.id);
  expect(finished).toMatchObject({ state: 'complete', total: 0, completed: 0, failed: 0 });
  expect(finished.finishedAt).not.toBeNull();
  await recordImportItem(run.id, 1, 'failed');
  await failImport(run.id, 'late failure');
  await beginImport(run.id);
  await saveImportBatch(run.id, [1]);
  expect(await latestImport(repo)).toEqual(finished);
  expect((await requestRepositoryImport(repo, 'start')).id).toBe(run.id);
  expect((await requestRepositoryImport(repo, 'refresh')).id).not.toBe(run.id);
});
test('retry validates repository and source state and allows failed discovery to resume', async () => {
  const repo = await seedRepository();
  const other = await seedRepository();
  const run = await requestRepositoryImport(repo, 'start');
  await expect(requestRepositoryImport(other, 'retry', run.id)).rejects.toThrow();
  await expect(requestRepositoryImport(repo, 'retry', run.id)).rejects.toThrow();
  await failImport(run.id, 'Could not discover pull requests');
  const retry = await requestRepositoryImport(repo, 'retry', run.id);
  expect(retry.total).toBeNull();
  expect((await beginImport(retry.id)).snapshot.state).toBe('discovering');
});
test('inactive installation, inactive or demo repository, and untracked refresh are rejected', async () => {
  const repo = await seedRepository();
  await expect(requestRepositoryImport(repo, 'refresh')).rejects.toThrow();
  await db().update(installations).set({ active: false }).where(eq(installations.id, repo));
  await expect(requestRepositoryImport(repo, 'start')).rejects.toThrow();
  await db().update(installations).set({ active: true }).where(eq(installations.id, repo));
  await db().update(repositories).set({ active: false }).where(eq(repositories.id, repo));
  await expect(requestRepositoryImport(repo, 'start')).rejects.toThrow();
  await db()
    .update(repositories)
    .set({ active: true, isDemo: true })
    .where(eq(repositories.id, repo));
  await expect(requestRepositoryImport(repo, 'start')).rejects.toThrow();
});
test('invalid discovery batches are rejected without fixing the batch', async () => {
  const run = await requestRepositoryImport(await seedRepository(), 'start');
  await expect(
    saveImportBatch(
      run.id,
      Array.from({ length: 101 }, (_, i) => i + 1),
    ),
  ).rejects.toThrow();
  await expect(saveImportBatch(run.id, [0])).rejects.toThrow();
  await expect(saveImportBatch(run.id, [1.5])).rejects.toThrow();
  expect((await getImport(run.id))?.snapshot.total).toBeNull();
  await saveImportBatch(run.id, [1]);
  await failImport(run.id, 'Interrupted');
  await recordImportItem(run.id, 1, 'complete');
  expect((await getImport(run.id))?.items).toEqual([{ number: 1, state: 'pending' }]);
});

test('failure preserves success and stale retry cannot displace a newer import', async () => {
  const repo = await seedRepository();
  const first = await requestRepositoryImport(repo, 'start');
  await saveImportBatch(first.id, [1, 2]);
  await recordImportItem(first.id, 1, 'complete');
  await failImport(first.id, 'Import interrupted');
  expect((await getImport(first.id))?.snapshot).toMatchObject({
    state: 'failed',
    completed: 1,
    failed: 0,
    total: 2,
  });
  const refresh = await requestRepositoryImport(repo, 'refresh');
  await expect(requestRepositoryImport(repo, 'retry', first.id)).rejects.toThrow();
  await failImport(first.id, 'Late message');
  await finishImport(first.id);
  expect((await latestImport(repo))?.id).toBe(refresh.id);
  expect((await getImport(first.id))?.snapshot.message).toBe('Import interrupted');
  await saveImportBatch(refresh.id, []);
  await finishImport(refresh.id);
  await expect(requestRepositoryImport(repo, 'retry', refresh.id)).rejects.toThrow();
});
