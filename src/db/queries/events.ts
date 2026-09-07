import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '..';
import { githubEvents } from '../schema';
export async function persistEvent(
  deliveryId: string,
  eventName: string,
  payload: Record<string, unknown>,
  metadata: { action?: string; installationId?: string; repositoryId?: string },
) {
  await db()
    .insert(githubEvents)
    .values({ id: randomUUID(), deliveryId, eventName, payload, ...metadata })
    .onConflictDoNothing({ target: githubEvents.deliveryId });
  const [event] = await db()
    .select()
    .from(githubEvents)
    .where(eq(githubEvents.deliveryId, deliveryId));
  return event;
}
