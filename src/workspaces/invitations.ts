import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { encrypt, tokenHash } from '../auth/crypto';
import { db } from '../db';
import { invitationDeliveries, workspaceInvitations, workspaceMemberships } from '../db/schema';
import { emailEnv, integrationEnv } from '../lib/env';
import { normalizeEmail } from './invitation-policy';
import { authorizeOwner, lockWorkspace, mutationUser, type WorkspaceTransaction } from './members';

import { EmailDeliveryError } from '../email/resend';

const invalid = () => new Error('Invitation unavailable');
async function lockSending(tx: WorkspaceTransaction, workspaceId: string, ownerId: string) {
  // Owner-wide lock comes first, so one owner cannot exceed the hourly quota across workspaces.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`workspace-invites:${ownerId}`}, 0))`,
  );
  await lockWorkspace(tx, workspaceId);
  await authorizeOwner(tx, workspaceId, ownerId);
}
async function cancelDeliveries(tx: WorkspaceTransaction, invitationId: string) {
  await tx
    .update(invitationDeliveries)
    .set({ state: 'cancelled', encryptedToken: null, encryptedPayload: null })
    .where(
      and(
        eq(invitationDeliveries.invitationId, invitationId),
        sql`${invitationDeliveries.state} != 'sent'`,
      ),
    );
}
async function issue(
  tx: WorkspaceTransaction,
  workspaceId: string,
  ownerId: string,
  email: string,
  existing?: typeof workspaceInvitations.$inferSelect,
) {
  if (!emailEnv()) throw new EmailDeliveryError('email_unavailable');
  const now = Date.now();
  const [hour] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(invitationDeliveries)
    .where(
      and(
        eq(invitationDeliveries.requestedBy, ownerId),
        gte(invitationDeliveries.createdAt, new Date(now - 3600000)),
      ),
    );
  const [day] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(invitationDeliveries)
    .where(
      and(
        eq(invitationDeliveries.workspaceId, workspaceId),
        gte(invitationDeliveries.createdAt, new Date(now - 86400000)),
      ),
    );
  if (hour.count >= 20 || day.count >= 100) throw new Error('Invitation rate limit reached');
  if (existing) {
    if (existing.acceptedAt || existing.revokedAt) throw invalid();
    const [latest] = await tx
      .select()
      .from(invitationDeliveries)
      .where(eq(invitationDeliveries.invitationId, existing.id))
      .orderBy(desc(invitationDeliveries.createdAt))
      .limit(1);
    if (latest && latest.createdAt.getTime() > now - 60000)
      throw new Error('Please wait before resending');
    await cancelDeliveries(tx, existing.id);
  }
  const id = existing?.id ?? randomUUID();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  const digest = tokenHash(token);
  const encryptedToken = encrypt(token, integrationEnv().TOKEN_ENCRYPTION_KEY);
  if (existing)
    await tx
      .update(workspaceInvitations)
      .set({ tokenHash: digest, expiresAt })
      .where(eq(workspaceInvitations.id, id));
  else
    await tx
      .insert(workspaceInvitations)
      .values({ id, workspaceId, email, invitedBy: ownerId, tokenHash: digest, expiresAt });
  await tx.insert(invitationDeliveries).values({
    id: randomUUID(),
    invitationId: id,
    workspaceId,
    requestedBy: ownerId,
    encryptedToken,
    createdAt: new Date(now),
  });
  return { id };
}
export async function createInvitation(
  workspaceId: string,
  email: string,
): Promise<{ id: string }> {
  const actor = await mutationUser();
  const normalized = normalizeEmail(email);
  return db().transaction(async (tx) => {
    await lockSending(tx, workspaceId, actor.id);
    const [existing] = await tx
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          eq(workspaceInvitations.email, normalized),
          isNull(workspaceInvitations.acceptedAt),
          isNull(workspaceInvitations.revokedAt),
        ),
      )
      .for('update');
    return issue(tx, workspaceId, actor.id, normalized, existing);
  });
}
export async function resendInvitation(id: string): Promise<void> {
  const actor = await mutationUser();
  const [hint] = await db()
    .select({ workspaceId: workspaceInvitations.workspaceId })
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.id, id));
  if (!hint) throw invalid();
  await db().transaction(async (tx) => {
    await lockSending(tx, hint.workspaceId, actor.id);
    const [invitation] = await tx
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.id, id))
      .for('update');
    if (!invitation) throw invalid();
    await issue(tx, hint.workspaceId, actor.id, invitation.email, invitation);
  });
}
export async function revokeInvitation(id: string): Promise<void> {
  const actor = await mutationUser();
  const [hint] = await db()
    .select({ workspaceId: workspaceInvitations.workspaceId })
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.id, id));
  if (!hint) throw invalid();
  await db().transaction(async (tx) => {
    await lockWorkspace(tx, hint.workspaceId);
    await authorizeOwner(tx, hint.workspaceId, actor.id);
    const [invitation] = await tx
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.id, id))
      .for('update');
    if (!invitation || invitation.acceptedAt) throw invalid();
    if (!invitation.revokedAt)
      await tx
        .update(workspaceInvitations)
        .set({ revokedAt: new Date() })
        .where(eq(workspaceInvitations.id, id));
    await cancelDeliveries(tx, id);
  });
}
// Only server callers may supply freshly fetched GitHub verified emails; never expose as an action.
export async function acceptInvitation(
  token: string,
  verifiedEmails: string[],
): Promise<{ workspaceId: string }> {
  const actor = await mutationUser();
  if (!/^[\w-]{43}$/.test(token)) throw invalid();
  const digest = tokenHash(token);
  const [hint] = await db()
    .select({ workspaceId: workspaceInvitations.workspaceId })
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.tokenHash, digest));
  if (!hint) throw invalid();
  return db().transaction(async (tx) => {
    await lockWorkspace(tx, hint.workspaceId);
    // Requery the digest under the workspace lock: concurrent resend invalidates the lookup.
    const [invitation] = await tx
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.tokenHash, digest))
      .for('update');
    if (
      !invitation ||
      invitation.revokedAt ||
      invitation.expiresAt.getTime() <= Date.now() ||
      !verifiedEmails.some((email) => normalizeEmail(email) === invitation.email)
    )
      throw invalid();
    if (invitation.acceptedAt) {
      const [member] = await tx
        .select()
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, hint.workspaceId),
            eq(workspaceMemberships.userId, actor.id),
          ),
        );
      if (invitation.acceptedBy !== actor.id || !member) throw invalid();
      return { workspaceId: hint.workspaceId };
    }
    await tx
      .insert(workspaceMemberships)
      .values({ workspaceId: hint.workspaceId, userId: actor.id, role: 'member' })
      .onConflictDoNothing();
    await tx
      .update(workspaceInvitations)
      .set({ acceptedAt: new Date(), acceptedBy: actor.id })
      .where(eq(workspaceInvitations.id, invitation.id));
    await cancelDeliveries(tx, invitation.id);
    return { workspaceId: hint.workspaceId };
  });
}
