// Trusted server persistence; callers exposing progress must authorize repository access.
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../index';
import {
  historyBackfills as runs,
  historyBackfillItems as items,
  installations,
  repositories,
  repositoryImports,
  githubEvents,
} from '../schema';
import { assertTrackedRepository } from '../../github/repositories';
import { discoverHistoryPage } from '../../github/discover-history';
import { syncPullRequest } from '../../github/sync-pull-request';

const active = ['queued', 'discovering', 'importing', 'retrying'];
const cursorSchema = z.object({
  page: z.number().int().positive().nullable(),
  sweep: z.number().int().min(0).max(1),
  revision: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative().default(0),
});
export function historyCursor(cursor: string | null) {
  return cursorSchema.parse(cursor ? JSON.parse(cursor) : { page: 1, sweep: 0, revision: 0 });
}
function yearAgo(now: Date) {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  if (cutoff.getUTCMonth() !== now.getUTCMonth()) cutoff.setUTCDate(0);
  return cutoff;
}
export async function ensureHistoryBackfill(
  repositoryId: string,
  now = new Date(),
): Promise<string> {
  await assertTrackedRepository(repositoryId);
  return db().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`history:${repositoryId}`},0))`,
    );
    // A completed initial backfill is retained; refresh imports must not launch another year scan.
    const [existing] = await tx
      .select()
      .from(runs)
      .where(eq(runs.repositoryId, repositoryId))
      .orderBy(desc(runs.createdAt), desc(runs.id))
      .limit(1);
    if (existing) return existing.id;
    const id = randomUUID();
    await tx.insert(runs).values({
      id,
      repositoryId,
      cutoff: yearAgo(now),
      status: 'queued',
      cursor: JSON.stringify(historyCursor(null)),
    });
    return id;
  });
}
export async function getHistoryBackfill(id: string) {
  const [run] = await db()
    .select({
      run: runs,
      total: sql<number>`count(${items.number})::int`,
      completed: sql<number>`count(*) filter (where ${items.status} = 'complete')::int`,
      failed: sql<number>`count(*) filter (where ${items.status} = 'failed')::int`,
    })
    .from(runs)
    .leftJoin(items, eq(items.backfillId, runs.id))
    .where(eq(runs.id, id))
    .groupBy(runs.id);
  if (!run) return null;
  return {
    ...run.run,
    cutoff: run.run.cutoff.toISOString(),
    cursor: historyCursor(run.run.cursor),
    retryAt: run.run.retryAt?.toISOString() ?? null,
    total: run.total,
    completed: run.completed,
    failed: run.failed,
  };
}
export async function latestHistoryBackfill(repositoryId: string) {
  const [run] = await db()
    .select({ id: runs.id })
    .from(runs)
    .where(eq(runs.repositoryId, repositoryId))
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .limit(1);
  return run ? getHistoryBackfill(run.id) : null;
}
export async function listHistoryRecovery(now = new Date()): Promise<string[]> {
  return (
    await db()
      .select({ id: runs.id })
      .from(runs)
      .innerJoin(repositories, eq(repositories.id, runs.repositoryId))
      .innerJoin(installations, eq(installations.id, repositories.installationId))
      .where(
        and(
          inArray(runs.status, active),
          or(isNull(runs.retryAt), lte(runs.retryAt, now)),
          or(
            isNull(runs.dispatchedAt),
            lte(runs.dispatchedAt, new Date(now.getTime() - 15 * 60000)),
          ),
          eq(repositories.active, true),
          eq(repositories.isDemo, false),
          isNotNull(repositories.trackingStartedAt),
          eq(installations.active, true),
        ),
      )
      .orderBy(asc(runs.updatedAt), asc(runs.id))
      .limit(100)
  ).map((run) => run.id);
}
// Also closes the crash window between finishing an initial import and creating its backfill.
export async function repositoriesMissingHistory(): Promise<string[]> {
  return (
    await db()
      .selectDistinct({ id: repositories.id })
      .from(repositories)
      .innerJoin(installations, eq(installations.id, repositories.installationId))
      .innerJoin(repositoryImports, eq(repositoryImports.repositoryId, repositories.id))
      .leftJoin(runs, eq(runs.repositoryId, repositories.id))
      .where(
        and(
          isNull(runs.id),
          inArray(repositoryImports.state, ['complete', 'partial']),
          eq(repositories.active, true),
          eq(repositories.isDemo, false),
          isNotNull(repositories.trackingStartedAt),
          eq(installations.active, true),
        ),
      )
      .limit(100)
  ).map((repo) => repo.id);
}
const errorSchema = z.object({
  status: z.number().optional(),
  message: z.string().optional(),
  response: z.object({ headers: z.record(z.string(), z.unknown()).optional() }).optional(),
});
function retry(error: unknown, now: Date, failures: number) {
  const parsed = errorSchema.safeParse(error);
  const status = parsed.success ? parsed.data.status : undefined;
  const headers = parsed.success ? (parsed.data.response?.headers ?? {}) : {};
  const limited =
    status === 429 ||
    (status === 403 &&
      (headers['retry-after'] !== undefined ||
        headers['x-ratelimit-remaining'] === '0' ||
        (parsed.success &&
          /secondary rate limit|abuse detection/i.test(parsed.data.message ?? ''))));
  let delay = Math.min(86400000, (limited ? 60000 : 300000) * 2 ** Math.min(failures, 11));
  const after = Number(headers['retry-after']);
  const reset = Number(headers['x-ratelimit-reset']);
  if (limited && Number.isFinite(after) && after > 0) delay = Math.max(delay, after * 1000);
  if (limited && Number.isFinite(reset) && reset > 0)
    delay = Math.max(delay, reset * 1000 - now.getTime() + 1000);
  return {
    retryAt: new Date(now.getTime() + delay),
    errorCategory: limited
      ? 'rate-limit'
      : status === 403 || status === 404
        ? 'access'
        : 'transient',
    status,
  };
}
export interface HistoryDependencies {
  discover?: typeof discoverHistoryPage;
  hydrate?: (repositoryId: string, number: number) => Promise<unknown>;
  now?: () => Date;
}
export async function processHistorySlice(
  repositoryId: string,
  backfillId: string,
  dependencies: HistoryDependencies = {},
): Promise<void> {
  const now = dependencies.now?.() ?? new Date();
  await db().transaction(async (tx) => {
    const [context] = await tx
      .select({ run: runs, repo: repositories, installation: installations })
      .from(runs)
      .innerJoin(repositories, eq(repositories.id, runs.repositoryId))
      .innerJoin(installations, eq(installations.id, repositories.installationId))
      .where(eq(runs.id, backfillId));
    if (!context || context.run.repositoryId !== repositoryId)
      throw new Error('History backfill unavailable');
    // Nonblocking, automatically released on process/connection failure. No row lock spans API work.
    const [lock] = await tx.execute<{ acquired: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${`history-installation:${context.installation.id}`},0)) as acquired`,
    );
    if (!lock.acquired) return;
    const [run] = await tx.select().from(runs).where(eq(runs.id, backfillId));
    if (!active.includes(run.status) || (run.retryAt && run.retryAt > now)) return;
    const cursor = historyCursor(run.cursor);
    const update = async (values: Partial<typeof runs.$inferInsert>) => {
      await tx
        .update(runs)
        .set({
          ...values,
          cursor: JSON.stringify({ ...cursor, revision: cursor.revision + 1 }),
          updatedAt: now,
          dispatchedAt: null,
        })
        .where(eq(runs.id, backfillId));
    };
    try {
      await assertTrackedRepository(repositoryId);
    } catch {
      await update({
        status: 'retrying',
        retryAt: new Date(now.getTime() + 300000),
        errorCategory: 'access',
      });
      return;
    }
    const [installationPause] = await tx
      .select({ retryAt: runs.retryAt })
      .from(runs)
      .innerJoin(repositories, eq(repositories.id, runs.repositoryId))
      .where(
        and(
          eq(repositories.installationId, context.installation.id),
          eq(runs.errorCategory, 'rate-limit'),
          gt(runs.retryAt, now),
        ),
      )
      .orderBy(desc(runs.retryAt))
      .limit(1);
    if (installationPause) {
      await update({
        status: 'retrying',
        retryAt: installationPause.retryAt,
        errorCategory: 'rate-limit',
      });
      return;
    }
    const [foregroundImport] = await tx
      .select({ id: repositoryImports.id })
      .from(repositoryImports)
      .innerJoin(repositories, eq(repositories.id, repositoryImports.repositoryId))
      .where(
        and(
          eq(repositories.installationId, context.installation.id),
          inArray(repositoryImports.state, ['queued', 'discovering', 'importing']),
        ),
      )
      .limit(1);
    const [freshEvent] = await tx
      .select({ id: githubEvents.id })
      .from(githubEvents)
      .where(
        and(
          eq(githubEvents.installationId, context.installation.githubInstallationId),
          isNull(githubEvents.processedAt),
          sql`${githubEvents.disposition} <> 'failed'`,
        ),
      )
      .limit(1);
    if (foregroundImport || freshEvent) {
      await update({
        status: 'retrying',
        retryAt: new Date(now.getTime() + 60000),
        errorCategory: 'foreground',
      });
      return;
    }
    const [item] = await tx
      .select()
      .from(items)
      .where(
        and(
          eq(items.backfillId, backfillId),
          inArray(items.status, ['pending', 'importing', 'retrying']),
        ),
      )
      .orderBy(asc(items.number))
      .limit(1);
    try {
      if (item) {
        // The existing collector rechecks access and tracking before every PR hydration.
        await (dependencies.hydrate ?? syncPullRequest)(repositoryId, item.number);
        await tx
          .update(items)
          .set({ status: 'complete', retryAt: null, errorCategory: null, updatedAt: now })
          .where(and(eq(items.backfillId, backfillId), eq(items.number, item.number)));
        cursor.failures = 0;
        await update({ status: 'importing', retryAt: null, errorCategory: null });
      } else if (cursor.page !== null) {
        const page = await (dependencies.discover ?? discoverHistoryPage)(
          repositoryId,
          run.cutoff.toISOString(),
          cursor.page,
        );
        const numbers = [...new Set(page.numbers)];
        if (numbers.some((n) => !Number.isSafeInteger(n) || n <= 0 || n > 2147483647))
          throw new Error('Invalid history page');
        if (numbers.length)
          await tx
            .insert(items)
            .values(
              numbers.map((number) => ({
                backfillId,
                number,
                sourceUpdatedAt: page.sourceUpdatedAt?.[number]
                  ? new Date(page.sourceUpdatedAt[number])
                  : null,
              })),
            )
            .onConflictDoUpdate({
              target: [items.backfillId, items.number],
              set: {
                status: 'pending',
                sourceUpdatedAt: sql`excluded.source_updated_at`,
                retryAt: null,
                errorCategory: null,
                updatedAt: now,
              },
              setWhere: sql`excluded.source_updated_at is not null and (${items.sourceUpdatedAt} is null or excluded.source_updated_at > ${items.sourceUpdatedAt})`,
            });
        cursor.failures = 0;
        cursor.page = page.nextPage;
        if (cursor.page === null && cursor.sweep === 0) {
          cursor.page = 1;
          cursor.sweep = 1;
        }
        // Items and next page commit together before any dispatch/hydration.
        await update({
          status: 'discovering',
          retryAt: null,
          errorCategory: null,
          startedAt: run.startedAt ?? now,
        });
      } else {
        const [failed] = await tx
          .select({ number: items.number })
          .from(items)
          .where(and(eq(items.backfillId, backfillId), eq(items.status, 'failed')))
          .limit(1);
        await update({
          status: failed ? 'partial' : 'complete',
          retryAt: null,
          errorCategory: null,
          finishedAt: now,
        });
      }
    } catch (error) {
      const failure = retry(error, dependencies.now?.() ?? new Date(), cursor.failures);
      cursor.failures += 1;
      const terminalItem = item && failure.status === 404;
      if (item)
        await tx
          .update(items)
          .set({
            status: terminalItem ? 'failed' : 'retrying',
            retryAt: terminalItem ? null : failure.retryAt,
            errorCategory: failure.errorCategory,
            updatedAt: now,
          })
          .where(and(eq(items.backfillId, backfillId), eq(items.number, item.number)));
      await update({
        status: terminalItem ? 'importing' : 'retrying',
        retryAt: terminalItem ? null : failure.retryAt,
        errorCategory: failure.errorCategory,
      });
    }
  });
}
