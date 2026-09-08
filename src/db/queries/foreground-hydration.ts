import { captureGithubRetry, GithubCollectionRetryError } from '../../github/retry-errors';
import { and, eq, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { db } from '../index';
import { foregroundHydrations as jobs, installations, repositories } from '../schema';
import { syncPullRequest } from '../../github/sync-pull-request';
export interface ForegroundHydrationData {
  repositoryId: string;
  number: number;
  hydrationId?: string;
  sourceEventId?: string;
}
function workId(data: ForegroundHydrationData, runId?: string) {
  return (
    data.hydrationId ??
    (data.sourceEventId ? `foreground:${data.sourceEventId}:${data.number}` : `invocation:${runId}`)
  );
}
export async function queueForegroundHydration(data: ForegroundHydrationData, runId?: string) {
  if (!data.hydrationId && !data.sourceEventId && !runId)
    throw new Error('Hydration identity required');
  const id = workId(data, runId);
  await db()
    .insert(jobs)
    .values({
      id,
      repositoryId: data.repositoryId,
      number: data.number,
      sourceEventId: data.sourceEventId,
    })
    .onConflictDoNothing();
  const [job] = await db().select().from(jobs).where(eq(jobs.id, id));
  if (job.repositoryId !== data.repositoryId || job.number !== data.number)
    throw new Error('Hydration unavailable');
  return { ...data, hydrationId: id };
}
export async function finishForegroundHydration(
  data: ForegroundHydrationData,
  status: 'complete' | 'failed',
  runId?: string,
) {
  if (!runId) return;
  await db()
    .update(jobs)
    .set({
      status,
      ...(status === 'complete' ? { retryAt: null, errorCategory: null } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobs.id, workId(data, runId)),
        eq(jobs.repositoryId, data.repositoryId),
        eq(jobs.number, data.number),
        eq(jobs.executionId, runId),
        inArray(jobs.status, ['queued', 'importing', 'retrying']),
      ),
    );
}
export async function runForegroundHydration(
  data: ForegroundHydrationData,
  runId: string,
  hydrate: (repositoryId: string, number: number) => Promise<unknown> = syncPullRequest,
): Promise<unknown> {
  const work = await queueForegroundHydration(data, runId);
  const [existing] = await db().select().from(jobs).where(eq(jobs.id, work.hydrationId));
  if (['complete', 'failed'].includes(existing.status)) return;
  if (existing.retryAt && existing.retryAt > new Date())
    throw new GithubCollectionRetryError([
      {
        errorCategory: existing.errorCategory === 'rate-limit' ? 'rate-limit' : 'transient',
        retryAt: existing.retryAt.toISOString(),
      },
    ]);
  const [claimed] = await db()
    .update(jobs)
    .set({ status: 'importing', executionId: runId, updatedAt: new Date() })
    .where(
      and(eq(jobs.id, work.hydrationId), inArray(jobs.status, ['queued', 'importing', 'retrying'])),
    )
    .returning();
  if (!claimed) return;
  try {
    const result = await hydrate(data.repositoryId, data.number);
    await finishForegroundHydration(work, 'complete', runId);
    return result;
  } catch (error) {
    const failure = captureGithubRetry(error);
    await db()
      .update(jobs)
      .set({
        status: 'retrying',
        retryAt: new Date(failure.retryAt),
        errorCategory: failure.errorCategory,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobs.id, work.hydrationId),
          eq(jobs.executionId, runId),
          eq(jobs.status, 'importing'),
        ),
      );
    throw error instanceof GithubCollectionRetryError
      ? error
      : new GithubCollectionRetryError([failure]);
  }
}
export async function markForegroundDispatched(id: string, now = new Date()) {
  await db().update(jobs).set({ dispatchedAt: now }).where(eq(jobs.id, id));
}
export async function listForegroundRecovery(now = new Date()) {
  return db()
    .select({
      hydrationId: jobs.id,
      repositoryId: jobs.repositoryId,
      number: jobs.number,
      sourceEventId: jobs.sourceEventId,
    })
    .from(jobs)
    .innerJoin(repositories, eq(repositories.id, jobs.repositoryId))
    .innerJoin(installations, eq(installations.id, repositories.installationId))
    .where(
      and(
        inArray(jobs.status, ['queued', 'importing', 'retrying']),
        or(isNull(jobs.retryAt), lte(jobs.retryAt, now)),
        or(
          and(isNull(jobs.dispatchedAt), lte(jobs.updatedAt, new Date(now.getTime() - 60000))),
          and(
            lte(jobs.dispatchedAt, new Date(now.getTime() - 900000)),
            lte(jobs.updatedAt, new Date(now.getTime() - 900000)),
          ),
        ),
        eq(repositories.active, true),
        isNotNull(repositories.trackingStartedAt),
        eq(installations.active, true),
      ),
    )
    .limit(100);
}
