import {
  listForegroundRecovery,
  markForegroundDispatched,
} from '../../db/queries/foreground-hydration';
import { sql, eq } from 'drizzle-orm';
import { db } from '../../db';
import { githubEvents } from '../../db/schema';
import { inngest } from '../client';
import { dispatchEvent } from '../dispatch';
export const reconcileEvents = inngest.createFunction(
  { id: 'reconcile-github-events', triggers: [{ cron: '*/5 * * * *' }] },
  async ({ step }) => {
    if (process.env.DEMO_MODE === 'true') return { demo: true };
    const events = await step.run('find-stale-events', () =>
      db()
        .select()
        .from(githubEvents)
        .where(
          sql`${githubEvents.processedAt} is null and ${githubEvents.disposition}<>'failed' and (${githubEvents.dispatchedAt} is null or ${githubEvents.receivedAt}<now()-interval '15 minutes') and (${githubEvents.leaseUntil} is null or ${githubEvents.leaseUntil}<now())`,
        )
        .limit(100),
    );
    for (const event of events)
      await step.run(`dispatch-${event.id}`, async () => {
        if (!event.dispatchedAt) await dispatchEvent(event.id);
        else
          await inngest.send({
            id: `reconcile:${event.id}:${Math.floor(Date.now() / 900000)}`,
            name: 'github/webhook.received',
            data: { eventId: event.id },
          });
      });
    const hydration = await step.run('find-stale-hydrations', listForegroundRecovery);
    for (const job of hydration)
      await step.run(`recover-hydration-${job.hydrationId}`, async () => {
        await inngest.send({
          id: `recover:${job.hydrationId}:${Math.floor(Date.now() / 900000)}`,
          name: 'github/pr.sync.requested',
          data: { ...job, sourceEventId: job.sourceEventId ?? undefined },
        });
        await markForegroundDispatched(job.hydrationId);
      });
    return { count: events.length, hydrations: hydration.length };
  },
);
export async function markFailed(id: string, message: string) {
  await db()
    .update(githubEvents)
    .set({ disposition: 'failed', processingError: message, leaseUntil: null })
    .where(eq(githubEvents.id, id));
}
