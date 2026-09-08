import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, closeDb } from './index';
import {
  installations,
  repositories,
  githubEvents,
  historyBackfills,
  historyBackfillItems,
  foregroundHydrations,
} from './schema';
import { handleGithubEvent } from '../github/handle-event';
import { processEvent } from '../inngest/process-event';
import {
  runForegroundHydration,
  finishForegroundHydration,
  listForegroundRecovery,
  queueForegroundHydration,
} from './queries/foreground-hydration';
import {
  ensureHistoryBackfill,
  getHistoryBackfill,
  processHistorySlice,
} from './queries/history-backfill';
const { send } = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../inngest/client', () => ({ inngest: { send } }));
const id = `foreground-${randomUUID()}`;
let backfillId: string;
beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });
  await db()
    .insert(installations)
    .values({ id, githubInstallationId: id, accountLogin: 'test', accountType: 'Organization' });
  await db().insert(repositories).values({
    id,
    installationId: id,
    githubRepositoryId: id,
    owner: 'test',
    name: 'test',
    defaultBranch: 'main',
    isPrivate: true,
    trackingStartedAt: new Date(),
  });
  await db()
    .insert(githubEvents)
    .values({
      id,
      deliveryId: id,
      installationId: id,
      repositoryId: id,
      eventName: 'pull_request',
      payload: { pull_request: { number: 1 } },
    });
  backfillId = await ensureHistoryBackfill(id);
});
afterAll(async () => {
  await db().delete(foregroundHydrations).where(eq(foregroundHydrations.repositoryId, id));
  await db().delete(historyBackfillItems).where(eq(historyBackfillItems.backfillId, backfillId));
  await db().delete(historyBackfills).where(eq(historyBackfills.repositoryId, id));
  await db().delete(githubEvents).where(eq(githubEvents.id, id));
  await db().delete(repositories).where(eq(repositories.id, id));
  await db().delete(installations).where(eq(installations.id, id));
  await closeDb();
});
test('processed raw event keeps queued, running and retrying foreground hydration ahead of background work', async () => {
  await processEvent(id, handleGithubEvent);
  const [raw] = await db().select().from(githubEvents).where(eq(githubEvents.id, id));
  expect(raw.processedAt).not.toBeNull();
  const data = send.mock.calls[0][0].data;
  const discover = vi.fn().mockResolvedValue({ numbers: [], nextPage: null });
  const now = () => new Date(Date.now() + 120000);
  await processHistorySlice(id, backfillId, { discover, now });
  expect(discover).not.toHaveBeenCalled();
  let reject!: (error: Error) => void;
  const hydrate = vi.fn(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const pending = runForegroundHydration(data, 'run', hydrate);
  await vi.waitFor(() => expect(hydrate).toHaveBeenCalled());
  await processHistorySlice(id, backfillId, { discover, now: () => new Date(Date.now() + 240000) });
  expect(discover).not.toHaveBeenCalled();
  const rejection = expect(pending).rejects.toThrow('requires retry');
  reject(new Error('transient'));
  await rejection;
  await processHistorySlice(id, backfillId, { discover, now: () => new Date(Date.now() + 360000) });
  expect(discover).not.toHaveBeenCalled();
  expect(await listForegroundRecovery(new Date(Date.now() + 1200000))).toEqual(
    expect.arrayContaining([expect.objectContaining({ repositoryId: id, number: 1 })]),
  );
  await db()
    .update(foregroundHydrations)
    .set({ retryAt: new Date(0) })
    .where(eq(foregroundHydrations.id, data.hydrationId));
  await runForegroundHydration(data, 'run', async () => 'done');
  await processHistorySlice(id, backfillId, { discover, now: () => new Date(Date.now() + 480000) });
  expect(discover).toHaveBeenCalledTimes(1);
  expect((await getHistoryBackfill(backfillId))?.errorCategory).toBeNull();
  // Terminal callback must not turn successful hydration into a failed one.
  await finishForegroundHydration(data, 'failed');
});

test('a late failure cannot close a newer execution or another queued work item for the same PR', async () => {
  const old = await queueForegroundHydration({
    repositoryId: id,
    number: 2,
    sourceEventId: `${id}-old`,
  });
  const newer = await queueForegroundHydration({
    repositoryId: id,
    number: 2,
    sourceEventId: `${id}-new`,
  });
  await db()
    .update(foregroundHydrations)
    .set({ status: 'retrying', executionId: 'replacement' })
    .where(eq(foregroundHydrations.id, old.hydrationId));
  await finishForegroundHydration(old, 'failed', 'obsolete');
  let [job] = await db()
    .select()
    .from(foregroundHydrations)
    .where(eq(foregroundHydrations.id, old.hydrationId));
  expect(job.status).toBe('retrying');
  await finishForegroundHydration(old, 'failed', 'replacement');
  [job] = await db()
    .select()
    .from(foregroundHydrations)
    .where(eq(foregroundHydrations.id, newer.hydrationId));
  expect(job.status).toBe('queued');
});

test('foreground recovery and repeated worker delivery respect the persisted GitHub retry deadline', async () => {
  const work = await queueForegroundHydration({
    repositoryId: id,
    number: 3,
    sourceEventId: `${id}-limited`,
  });
  const hydrate = vi
    .fn()
    .mockRejectedValue({ status: 429, response: { headers: { 'retry-after': '3600' } } });
  await expect(runForegroundHydration(work, 'limited', hydrate)).rejects.toBeDefined();
  const [job] = await db()
    .select()
    .from(foregroundHydrations)
    .where(eq(foregroundHydrations.id, work.hydrationId));
  expect(job).toMatchObject({
    status: 'retrying',
    errorCategory: 'rate-limit',
    retryAt: expect.any(Date),
  });
  await expect(runForegroundHydration(work, 'duplicate', hydrate)).rejects.toBeDefined();
  expect(hydrate).toHaveBeenCalledTimes(1);
  expect(await listForegroundRecovery(new Date(Date.now() + 1200000))).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ hydrationId: work.hydrationId })]),
  );
});

test('recovery picks up dispatch gaps but leaves a recently active execution alone', async () => {
  const work = await queueForegroundHydration({
    repositoryId: id,
    number: 4,
    sourceEventId: `${id}-gap`,
  });
  expect(await listForegroundRecovery(new Date(Date.now() + 120000))).toEqual(
    expect.arrayContaining([expect.objectContaining({ hydrationId: work.hydrationId })]),
  );
  await db()
    .update(foregroundHydrations)
    .set({
      status: 'importing',
      executionId: 'active',
      dispatchedAt: new Date(Date.now() - 3600000),
      updatedAt: new Date(),
    })
    .where(eq(foregroundHydrations.id, work.hydrationId));
  expect(await listForegroundRecovery(new Date(Date.now() + 120000))).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ hydrationId: work.hydrationId })]),
  );
  expect(await listForegroundRecovery(new Date(Date.now() + 1200000))).toEqual(
    expect.arrayContaining([expect.objectContaining({ hydrationId: work.hydrationId })]),
  );
});
