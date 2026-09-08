import { and, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '../db';
import { historyBackfills } from '../db/schema';
import { historyCursor } from '../db/queries/history-backfill';
import { inngest } from './client';
export type SendHistoryEvent = (event: {
  id: string;
  name: 'github/history.sync.requested';
  data: { repositoryId: string; backfillId: string };
}) => Promise<unknown>;
export async function dispatchHistoryBackfill(
  backfillId: string,
  send: SendHistoryEvent = (event) => inngest.send(event),
  now = new Date(),
): Promise<void> {
  const [run] = await db()
    .select()
    .from(historyBackfills)
    .where(
      and(
        eq(historyBackfills.id, backfillId),
        inArray(historyBackfills.status, ['queued', 'discovering', 'importing', 'retrying']),
        or(isNull(historyBackfills.retryAt), lte(historyBackfills.retryAt, now)),
      ),
    );
  if (!run) return;
  if (run.dispatchedAt && run.dispatchedAt.getTime() > now.getTime() - 15 * 60000) return;
  // Revision IDs deduplicate send acknowledgement gaps; stale recovery adds a time slot
  // so a completed/crashed Inngest run can be redelivered after event deduplication.
  const recovery = run.dispatchedAt ? `:recover:${Math.floor(now.getTime() / 900000)}` : '';
  await send({
    id: `history:${run.id}:${historyCursor(run.cursor).revision}${recovery}`,
    name: 'github/history.sync.requested',
    data: { repositoryId: run.repositoryId, backfillId: run.id },
  });
  // A fast worker may already have checkpointed the next slice; do not hide its dispatch.
  await db()
    .update(historyBackfills)
    .set({ dispatchedAt: now })
    .where(
      and(
        eq(historyBackfills.id, run.id),
        run.cursor === null
          ? isNull(historyBackfills.cursor)
          : eq(historyBackfills.cursor, run.cursor),
      ),
    );
}
