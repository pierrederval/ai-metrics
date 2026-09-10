import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  invitationDeliveries as deliveries,
  workspaceInvitations as invitations,
  workspaces,
} from '../db/schema';
import { decrypt, encrypt } from '../auth/crypto';
import { emailEnv, integrationEnv } from '../lib/env';
import { EmailDeliveryError, sendInvitationEmail, type InvitationEmail } from '../email/resend';
import { inngest } from '../inngest/client';
import { lockWorkspace } from './members';
const active = sql`${deliveries.state} in ('queued','sending')`;
const cleared = { encryptedToken: null, encryptedPayload: null, leaseUntil: null };
export async function failInvitationDelivery(id: string) {
  await db()
    .update(deliveries)
    .set({ ...cleared, state: 'failed', errorCode: 'email_failed' })
    .where(and(eq(deliveries.id, id), active));
}
export async function dispatchInvitation(deliveryId: string): Promise<void> {
  const [row] = await db()
    .select()
    .from(deliveries)
    .where(and(eq(deliveries.id, deliveryId), active, isNull(deliveries.dispatchedAt)));
  if (!row) return;
  await inngest.send({
    id: `invitation-${deliveryId}`,
    name: 'workspace/invitation.send.requested',
    data: { deliveryId },
  });
  await db()
    .update(deliveries)
    .set({ dispatchedAt: new Date() })
    .where(eq(deliveries.id, deliveryId));
}
export async function deliverInvitation(deliveryId: string): Promise<void> {
  const key = integrationEnv().TOKEN_ENCRYPTION_KEY;
  const claimed = await db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, deliveryId))
      .for('update');
    if (!row || !['queued', 'sending'].includes(row.state)) return false;
    const now = Date.now();
    if (row.leaseUntil && row.leaseUntil.getTime() > now)
      throw new EmailDeliveryError('email_busy', true);
    if (row.attempts >= 6 || now - row.createdAt.getTime() >= 86400000) {
      await tx
        .update(deliveries)
        .set({ ...cleared, state: 'failed', errorCode: 'email_failed' })
        .where(eq(deliveries.id, deliveryId));
      return false;
    }
    let payload = row.encryptedPayload;
    if (!payload) {
      const [invite] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.id, row.invitationId));
      const [workspace] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, row.workspaceId));
      const config = emailEnv();
      if (!config || !row.encryptedToken || !invite || !workspace) {
        await tx
          .update(deliveries)
          .set({ ...cleared, state: 'failed', errorCode: 'email_unavailable' })
          .where(eq(deliveries.id, deliveryId));
        return false;
      }
      payload = encrypt(
        JSON.stringify({
          deliveryId,
          to: invite.email,
          workspaceName: workspace.name,
          from: config.RESEND_FROM_EMAIL,
          url: new URL(`/invitations/${decrypt(row.encryptedToken, key)}`, integrationEnv().APP_URL)
            .href,
        }),
        key,
      );
    }
    await tx
      .update(deliveries)
      .set({
        encryptedPayload: payload,
        state: 'sending',
        attempts: row.attempts + 1,
        firstAttemptAt: row.firstAttemptAt ?? new Date(now),
        leaseUntil: new Date(now + 60000),
      })
      .where(eq(deliveries.id, deliveryId));
    return true;
  });
  if (!claimed) return;
  // Hold the same locks as revocation/acceptance through the bounded provider call.
  // The payload and attempt count were committed before this transaction can crash.
  let retry = false;
  await db().transaction(async (tx) => {
    const [hint] = await tx.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    if (!hint) return;
    await lockWorkspace(tx, hint.workspaceId);
    const [invite] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.id, hint.invitationId))
      .for('update');
    const [row] = await tx
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, deliveryId))
      .for('update');
    if (!row || row.state !== 'sending') return;
    if (
      !invite ||
      invite.revokedAt ||
      invite.acceptedAt ||
      invite.expiresAt.getTime() <= Date.now()
    ) {
      await tx
        .update(deliveries)
        .set({ ...cleared, state: 'cancelled' })
        .where(eq(deliveries.id, deliveryId));
      return;
    }
    try {
      const payload = JSON.parse(decrypt(row.encryptedPayload!, key)) as InvitationEmail;
      // Claiming precedes lock acquisition; lock waits must not extend the retry window.
      if (Date.now() - row.createdAt.getTime() >= 86400000) {
        await tx
          .update(deliveries)
          .set({ ...cleared, state: 'failed', errorCode: 'email_failed' })
          .where(eq(deliveries.id, deliveryId));
        return;
      }
      const sent = await sendInvitationEmail(payload);
      await tx
        .update(deliveries)
        .set({
          ...cleared,
          state: 'sent',
          sentAt: new Date(),
          providerId: sent.id,
          errorCode: null,
        })
        .where(eq(deliveries.id, deliveryId));
    } catch (error) {
      retry =
        error instanceof EmailDeliveryError &&
        error.retryable &&
        row.attempts < 6 &&
        Date.now() - row.createdAt.getTime() < 86400000;
      await tx
        .update(deliveries)
        .set(
          retry
            ? { state: 'queued', leaseUntil: null, errorCode: 'email_retry' }
            : { ...cleared, state: 'failed', errorCode: 'email_failed' },
        )
        .where(eq(deliveries.id, deliveryId));
    }
  });
  if (retry) throw new EmailDeliveryError('email_retry', true);
}
export async function reconcileInvitationDeliveries() {
  await db()
    .update(deliveries)
    .set({ ...cleared, state: 'failed', errorCode: 'email_failed' })
    .where(and(active, sql`${deliveries.createdAt} <= now() - interval '24 hours'`));
  const rows = await db()
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(and(active, isNull(deliveries.dispatchedAt)))
    .limit(100);
  for (const row of rows) {
    try {
      await dispatchInvitation(row.id);
    } catch {
      /* durable row is retried next minute */
    }
  }
}
