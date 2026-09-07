import 'dotenv/config';
import { createHmac, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '../src/db';
import { githubEvents } from '../src/db/schema';
const base = process.env.SMOKE_APP_URL ?? 'http://localhost:3107';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  throw new Error('Smoke test is local only');
const secret = process.env.SMOKE_WEBHOOK_SECRET ?? 'local-smoke-secret',
  deliveryId = `smoke-${randomUUID()}`,
  body = JSON.stringify({ zen: 'Evidence first' });
const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
try {
  const invalid = await fetch(`${base}/api/github/webhook`, {
    method: 'POST',
    headers: {
      'x-github-delivery': `${deliveryId}-invalid`,
      'x-github-event': 'ping',
      'x-hub-signature-256': 'sha256=invalid',
    },
    body,
  });
  if (invalid.status !== 401)
    throw new Error(`Expected signature rejection, got ${invalid.status}`);
  for (let i = 0; i < 2; i++) {
    const response = await fetch(`${base}/api/github/webhook`, {
      method: 'POST',
      headers: {
        'x-github-delivery': deliveryId,
        'x-github-event': 'ping',
        'x-hub-signature-256': signature,
      },
      body,
    });
    if (!response.ok) throw new Error(`Webhook HTTP ${response.status}: ${await response.text()}`);
  }
  for (let i = 0; i < 30; i++) {
    const rows = await db()
      .select()
      .from(githubEvents)
      .where(eq(githubEvents.deliveryId, deliveryId));
    if (rows.length === 1 && rows[0].processedAt && rows[0].disposition === 'processed') {
      console.log(
        'PASS: invalid signature rejected; duplicate stored once; Inngest processed signed ping.',
        { deliveryId },
      );
      process.exitCode = 0;
      break;
    }
    if (i === 29) throw new Error('Timed out waiting for Inngest processing');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  await closeDb();
}
