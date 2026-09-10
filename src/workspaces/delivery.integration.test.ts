import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
vi.mock('server-only', () => ({}));
const fixture = vi.hoisted(() => ({ userId: 'invite-owner', demo: false }));
vi.mock('../auth/session', () => ({ currentUser: async () => ({ id: fixture.userId }) }));
vi.mock('../lib/env', () => ({
  emailEnv: () => ({ RESEND_API_KEY: 'test', RESEND_FROM_EMAIL: 'team@example.com' }),
  env: () => ({ DEMO_MODE: fixture.demo ? 'true' : 'false' }),
  integrationEnv: () => ({ TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32), APP_URL: 'https://example.com' }),
}));
import { deliverInvitation, dispatchInvitation, reconcileInvitationDeliveries } from './delivery';
const send = vi.hoisted(() => vi.fn());
vi.mock('../inngest/client', () => ({ inngest: { send } }));
vi.mock('../email/resend', async (original) => ({
  ...(await original<typeof import('../email/resend')>()),
  sendInvitationEmail: sendEmail,
}));
const sendEmail = vi.hoisted(() => vi.fn());
import { createInvitation, revokeInvitation } from './invitations';
import { closeDb, db } from '../db';
import {
  users,
  workspaces,
  workspaceMemberships,
  workspaceInvitations,
  invitationDeliveries,
} from '../db/schema';
const ids = ['invite-owner', 'invite-member', 'invite-other'];
const wids = ['invite-workspace', 'invite-workspace-2'];
const wid = wids[0];
beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });
});
async function cleanup() {
  await db().delete(invitationDeliveries).where(inArray(invitationDeliveries.workspaceId, wids));
  await db().delete(workspaceInvitations).where(inArray(workspaceInvitations.workspaceId, wids));
  await db().delete(workspaceMemberships).where(inArray(workspaceMemberships.workspaceId, wids));
  await db().delete(workspaces).where(inArray(workspaces.id, wids));
  await db().delete(users).where(inArray(users.id, ids));
}
beforeEach(async () => {
  fixture.userId = ids[0];
  fixture.demo = false;
  await cleanup();
  await db()
    .insert(users)
    .values(ids.map((id) => ({ id, login: id, credentials: 'fixture' })));
  await db()
    .insert(workspaces)
    .values(wids.map((id) => ({ id, name: 'Invitation fixture' })));
  await db()
    .insert(workspaceMemberships)
    .values(wids.map((workspaceId) => ({ workspaceId, userId: ids[0], role: 'owner' as const })));
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});
async function delivery() {
  const { id } = await createInvitation(wid, 'person@example.com');
  const [row] = await db()
    .select()
    .from(invitationDeliveries)
    .where(eq(invitationDeliveries.invitationId, id));
  return row;
}
test('duplicate dispatch and crash before acknowledgment keep stable event ID', async () => {
  const row = await delivery();
  send.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ ids: [] });
  await expect(dispatchInvitation(row.id)).rejects.toThrow();
  await dispatchInvitation(row.id);
  await dispatchInvitation(row.id);
  expect(send.mock.calls.slice(-2).map((c) => c[0])).toEqual(
    Array(2).fill({
      id: `invitation-${row.id}`,
      name: 'workspace/invitation.send.requested',
      data: { deliveryId: row.id },
    }),
  );
});
test('revoke before send cancels without contacting provider', async () => {
  sendEmail.mockClear();
  const row = await delivery();
  await revokeInvitation(row.invitationId);
  await deliverInvitation(row.id);
  expect(sendEmail).not.toHaveBeenCalled();
});
test('transient retries preserve immutable payload and stop after six attempts', async () => {
  const { EmailDeliveryError } = await import('../email/resend');
  sendEmail.mockReset().mockRejectedValue(new EmailDeliveryError('email_network', true));
  const row = await delivery();
  for (let i = 0; i < 6; i++) {
    await deliverInvitation(row.id).catch(() => {});
    await db().update(workspaces).set({ name: 'renamed' }).where(eq(workspaces.id, wid));
  }
  await deliverInvitation(row.id);
  const [saved] = await db()
    .select()
    .from(invitationDeliveries)
    .where(eq(invitationDeliveries.id, row.id));
  expect(saved.state).toBe('failed');
  expect(saved.encryptedPayload).toBeNull();
  expect(saved.encryptedToken).toBeNull();
  expect(sendEmail).toHaveBeenCalledTimes(6);
  expect(new Set(sendEmail.mock.calls.map((c) => JSON.stringify(c[0]))).size).toBe(1);
});
test('reconciliation terminates abandoned worker and wipes secrets', async () => {
  const row = await delivery();
  await db()
    .update(invitationDeliveries)
    // One minute past the 24h deadline: `now()` is Postgres's clock, so a 1ms
    // margin is lost to host/container skew.
    .set({ createdAt: new Date(Date.now() - 86400000 - 60000), dispatchedAt: new Date() })
    .where(eq(invitationDeliveries.id, row.id));
  await reconcileInvitationDeliveries();
  const [saved] = await db()
    .select()
    .from(invitationDeliveries)
    .where(eq(invitationDeliveries.id, row.id));
  expect(saved.state).toBe('failed');
  expect(saved.encryptedToken).toBeNull();
});
test('duplicate successful delivery sends once and wipes encrypted payload', async () => {
  sendEmail.mockReset().mockResolvedValue({ id: 'provider' });
  const row = await delivery();
  await Promise.all([deliverInvitation(row.id), deliverInvitation(row.id).catch(() => {})]);
  await deliverInvitation(row.id);
  const [saved] = await db()
    .select()
    .from(invitationDeliveries)
    .where(eq(invitationDeliveries.id, row.id));
  expect(saved.state).toBe('sent');
  expect(saved.providerId).toBe('provider');
  expect(saved.encryptedToken).toBeNull();
  expect(saved.encryptedPayload).toBeNull();
  expect(sendEmail).toHaveBeenCalledTimes(1);
});
test('permanent provider failure ends delivery immediately', async () => {
  const { EmailDeliveryError } = await import('../email/resend');
  sendEmail.mockReset().mockRejectedValue(new EmailDeliveryError('email_provider', false));
  const row = await delivery();
  await deliverInvitation(row.id);
  await deliverInvitation(row.id);
  const [saved] = await db()
    .select()
    .from(invitationDeliveries)
    .where(eq(invitationDeliveries.id, row.id));
  expect(saved.state).toBe('failed');
  expect(saved.attempts).toBe(1);
  expect(sendEmail).toHaveBeenCalledTimes(1);
});
test('delivery expiring while waiting for workspace lock fails before provider send', async () => {
  sendEmail.mockReset().mockResolvedValue({ id: 'provider' });
  const row = await delivery();
  const deadline = row.createdAt.getTime() + 86400000;
  const clock = vi.spyOn(Date, 'now').mockReturnValue(deadline - 1);
  const { lockWorkspace } = await import('./members');
  let release!: () => void;
  let locked!: () => void;
  const lockReady = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const releaseLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  const blocker = db().transaction(async (tx) => {
    await lockWorkspace(tx, wid);
    locked();
    await releaseLock;
  });
  await lockReady;
  const pending = deliverInvitation(row.id);
  try {
    let claimed = false;
    for (let i = 0; i < 100; i++) {
      const [current] = await db()
        .select()
        .from(invitationDeliveries)
        .where(eq(invitationDeliveries.id, row.id));
      if (current.state === 'sending' && current.attempts === 1 && current.encryptedPayload) {
        claimed = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(claimed).toBe(true);
    clock.mockReturnValue(deadline);
    release();
    await blocker;
    await pending;
    const [saved] = await db()
      .select()
      .from(invitationDeliveries)
      .where(eq(invitationDeliveries.id, row.id));
    expect(sendEmail.mock.calls.length).toBe(0);
    expect(saved.state).toBe('failed');
    expect(saved.errorCode).toBe('email_failed');
    expect(saved.encryptedToken).toBeNull();
    expect(saved.encryptedPayload).toBeNull();
    expect(saved.leaseUntil).toBeNull();
  } finally {
    release();
    await blocker;
    await pending;
    clock.mockRestore();
  }
});
