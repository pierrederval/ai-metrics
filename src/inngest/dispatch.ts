import { eq } from 'drizzle-orm';
import { db } from '../db';
import { githubEvents } from '../db/schema';
import { inngest } from './client';
export type SendEvent = (event: {
  id: string;
  name: string;
  data: { eventId: string };
}) => Promise<unknown>;
export async function dispatchEvent(id: string, send: SendEvent = (event) => inngest.send(event)) {
  const [event] = await db().select().from(githubEvents).where(eq(githubEvents.id, id));
  if (!event) throw new Error('Raw event missing');
  if (event.dispatchedAt || event.processedAt) return;
  await send({
    id: event.deliveryId,
    name: 'github/webhook.received',
    data: { eventId: event.id },
  });
  await db().update(githubEvents).set({ dispatchedAt: new Date() }).where(eq(githubEvents.id, id));
}
