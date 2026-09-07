import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { githubEvents } from '../db/schema';
export type StoredEvent = typeof githubEvents.$inferSelect;
export type EventHandler = (event: StoredEvent) => Promise<'processed' | 'unsupported'>;
export async function processEvent(id: string, handle: EventHandler) {
  const claimed = await db()
    .update(githubEvents)
    .set({
      leaseUntil: new Date(Date.now() + 300000),
      disposition: 'processing',
      processingError: null,
    })
    .where(
      sql`${githubEvents.id}=${id} and ${githubEvents.processedAt} is null and (${githubEvents.leaseUntil} is null or ${githubEvents.leaseUntil}<now())`,
    )
    .returning();
  if (!claimed.length) {
    const [existing] = await db().select().from(githubEvents).where(eq(githubEvents.id, id));
    if (existing?.processedAt) return 'duplicate';
    throw new Error('Event is leased; retry after lease expires');
  }
  const event = claimed[0];
  try {
    const disposition = await handle(event);
    await db()
      .update(githubEvents)
      .set({
        processedAt: new Date(),
        leaseUntil: null,
        disposition,
        processingError:
          disposition === 'unsupported'
            ? `Unsupported event/action: ${event.eventName}/${event.action ?? ''}`
            : null,
      })
      .where(eq(githubEvents.id, id));
    return disposition;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Processing failed';
    console.error('GitHub event failed', {
      deliveryId: event.deliveryId,
      repositoryId: event.repositoryId,
      eventName: event.eventName,
      error: message,
    });
    await db()
      .update(githubEvents)
      .set({ processingError: message, leaseUntil: null, disposition: 'retrying' })
      .where(eq(githubEvents.id, id));
    throw error;
  }
}
