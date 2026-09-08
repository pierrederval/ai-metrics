import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
vi.mock('server-only', () => ({}));
const fixture = vi.hoisted(() => ({ userId: 'invite-owner', demo: false }));
vi.mock('../auth/session', () => ({ currentUser: async () => ({ id: fixture.userId }) }));
vi.mock('../lib/env', () => ({
  env: () => ({ DEMO_MODE: fixture.demo ? 'true' : 'false' }),
  integrationEnv: () => ({ TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32) }),
}));
import { normalizeEmail } from './invitation-policy';
import {
  createInvitation,
  acceptInvitation,
  resendInvitation,
  revokeInvitation,
} from './invitations';
import { changeMemberRole, removeMember } from './members';
import { closeDb, db } from '../db';
import {
  users,
  workspaces,
  workspaceMemberships,
  workspaceInvitations,
  invitationDeliveries,
} from '../db/schema';
import { decrypt } from '../auth/crypto';
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
async function token(id: string) {
  const rows = await db()
    .select()
    .from(invitationDeliveries)
    .where(
      and(eq(invitationDeliveries.invitationId, id), eq(invitationDeliveries.state, 'queued')),
    );
  expect(rows).toHaveLength(1);
  return decrypt(rows[0].encryptedToken!, 'ab'.repeat(32));
}
async function age(id: string, ms = 61000) {
  await db()
    .update(invitationDeliveries)
    .set({ createdAt: new Date(Date.now() - ms) })
    .where(eq(invitationDeliveries.invitationId, id));
}
test('email normalization preserves plus aliases', () => {
  expect(normalizeEmail(' Person+team@Example.com ')).toBe('person+team@example.com');
});
test('creation validates input and queues encrypted token with seven day expiry', async () => {
  await expect(createInvitation(wid, 'x\r\nBcc: victim@example.com')).rejects.toThrow();
  const start = Date.now();
  const { id } = await createInvitation(wid, ' Person+team@Example.com ');
  const secret = await token(id);
  const [row] = await db()
    .select()
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.id, id));
  expect(secret).toMatch(/^[\w-]{43}$/);
  expect(row.tokenHash).not.toBe(secret);
  expect(row.email).toBe('person+team@example.com');
  expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(start + 7 * 86400000);
});
test('acceptance requires verified matching email and binds replay to original identity', async () => {
  const { id } = await createInvitation(wid, 'person@example.com');
  const secret = await token(id);
  fixture.userId = ids[1];
  await expect(acceptInvitation(secret, [])).rejects.toThrow();
  await expect(acceptInvitation(secret, ['other@example.com'])).rejects.toThrow();
  await expect(acceptInvitation(secret, [' PERSON@example.com '])).resolves.toEqual({
    workspaceId: wid,
  });
  await expect(acceptInvitation(secret, ['person@example.com'])).resolves.toEqual({
    workspaceId: wid,
  });
  fixture.userId = ids[2];
  await expect(acceptInvitation(secret, ['person@example.com'])).rejects.toThrow();
});
test('acceptance expires at the exact boundary', async () => {
  const { id } = await createInvitation(wid, 'person@example.com');
  const secret = await token(id);
  const now = new Date();
  await db()
    .update(workspaceInvitations)
    .set({ expiresAt: now })
    .where(eq(workspaceInvitations.id, id));
  vi.spyOn(Date, 'now').mockReturnValue(now.getTime());
  fixture.userId = ids[1];
  try {
    await expect(acceptInvitation(secret, ['person@example.com'])).rejects.toThrow();
  } finally {
    vi.restoreAllMocks();
  }
});
test('duplicate create reuses open row, cooldown prevents sends, resend invalidates old token', async () => {
  const first = await createInvitation(wid, 'person@example.com');
  const old = await token(first.id);
  await expect(resendInvitation(first.id)).rejects.toThrow();
  await age(first.id);
  expect(await createInvitation(wid, 'PERSON@example.com')).toEqual(first);
  const fresh = await token(first.id);
  expect(fresh).not.toBe(old);
  fixture.userId = ids[1];
  await expect(acceptInvitation(old, ['person@example.com'])).rejects.toThrow();
  await expect(acceptInvitation(fresh, ['person@example.com'])).resolves.toEqual({
    workspaceId: wid,
  });
});
test('revocation is terminal and cancels queued secrets', async () => {
  const { id } = await createInvitation(wid, 'person@example.com');
  const secret = await token(id);
  await revokeInvitation(id);
  await expect(resendInvitation(id)).rejects.toThrow();
  fixture.userId = ids[1];
  await expect(acceptInvitation(secret, ['person@example.com'])).rejects.toThrow();
  const [delivery] = await db()
    .select()
    .from(invitationDeliveries)
    .where(eq(invitationDeliveries.invitationId, id));
  expect(delivery.encryptedToken).toBeNull();
  expect(delivery.state).toBe('cancelled');
});
test('existing owner invitation acceptance does not demote or duplicate membership', async () => {
  const { id } = await createInvitation(wid, 'owner@example.com');
  const secret = await token(id);
  await Promise.all([
    acceptInvitation(secret, ['owner@example.com']),
    acceptInvitation(secret, ['owner@example.com']),
  ]);
  const rows = await db()
    .select()
    .from(workspaceMemberships)
    .where(eq(workspaceMemberships.workspaceId, wid));
  expect(rows).toHaveLength(1);
  expect(rows[0].role).toBe('owner');
});
test('owner hourly limit is serialized across workspaces', async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 24 }, (_, i) => createInvitation(wids[i % 2], `person${i}@example.com`)),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(20);
  expect(
    await db()
      .select()
      .from(invitationDeliveries)
      .where(eq(invitationDeliveries.requestedBy, ids[0])),
  ).toHaveLength(20);
});
test('workspace daily limit counts all owners and cancelled deliveries', async () => {
  const { id } = await createInvitation(wid, 'person@example.com');
  await age(id, 2 * 3600000);
  await db()
    .insert(invitationDeliveries)
    .values(
      Array.from({ length: 99 }, (_, i) => ({
        id: `invite-limit-${i}`,
        invitationId: id,
        workspaceId: wid,
        requestedBy: ids[1],
        encryptedToken: null,
        state: 'cancelled' as const,
        createdAt: new Date(Date.now() - 2 * 3600000),
      })),
    );
  await expect(createInvitation(wid, 'another@example.com')).rejects.toThrow();
});
test('expired open invitation can be renewed', async () => {
  const first = await createInvitation(wid, 'person@example.com');
  await age(first.id);
  await db()
    .update(workspaceInvitations)
    .set({ expiresAt: new Date(0) })
    .where(eq(workspaceInvitations.id, first.id));
  expect(await createInvitation(wid, 'person@example.com')).toEqual(first);
});
test('concurrent owner demotions and removals preserve a last owner', async () => {
  await db()
    .insert(workspaceMemberships)
    .values({ workspaceId: wid, userId: ids[1], role: 'owner' });
  const results = await Promise.allSettled([
    changeMemberRole(wid, ids[1], 'member'),
    removeMember(wid, ids[0]),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const owners = await db()
    .select()
    .from(workspaceMemberships)
    .where(and(eq(workspaceMemberships.workspaceId, wid), eq(workspaceMemberships.role, 'owner')));
  expect(owners).toHaveLength(1);
});
test('members, outsiders and demo cannot manage invitations or roles', async () => {
  const { id } = await createInvitation(wid, 'person@example.com');
  fixture.userId = ids[1];
  for (const mutation of [
    () => createInvitation(wid, 'x@example.com'),
    () => resendInvitation(id),
    () => revokeInvitation(id),
    () => removeMember(wid, ids[0]),
    () => changeMemberRole(wid, ids[0], 'member'),
  ])
    await expect(mutation()).rejects.toThrow();
  fixture.userId = ids[0];
  fixture.demo = true;
  await expect(createInvitation(wid, 'x@example.com')).rejects.toThrow();
});

test('two concurrent removals cannot remove both owners', async () => {
  await db()
    .insert(workspaceMemberships)
    .values({ workspaceId: wid, userId: ids[1], role: 'owner' });
  const results = await Promise.allSettled([removeMember(wid, ids[1]), removeMember(wid, ids[0])]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    await db()
      .select()
      .from(workspaceMemberships)
      .where(
        and(eq(workspaceMemberships.workspaceId, wid), eq(workspaceMemberships.role, 'owner')),
      ),
  ).toHaveLength(1);
});

test('workspace daily remaining slot is serialized across owners', async () => {
  const { id } = await createInvitation(wid, 'person@example.com');
  await age(id, 2 * 3600000);
  await db()
    .insert(invitationDeliveries)
    .values(
      Array.from({ length: 98 }, (_, i) => ({
        id: `invite-limit-${i}`,
        invitationId: id,
        workspaceId: wid,
        requestedBy: ids[1],
        encryptedToken: null,
        state: 'cancelled' as const,
        createdAt: new Date(Date.now() - 2 * 3600000),
      })),
    );
  await db()
    .insert(workspaceMemberships)
    .values({ workspaceId: wid, userId: ids[1], role: 'owner' });
  const first = createInvitation(wid, 'first@example.com');
  fixture.userId = ids[1];
  const second = createInvitation(wid, 'second@example.com');
  const results = await Promise.allSettled([first, second]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});

test('member role transitions authorize internally and removed members cannot replay acceptance', async () => {
  const { id } = await createInvitation(wid, 'person@example.com');
  const secret = await token(id);
  fixture.userId = ids[1];
  await acceptInvitation(secret, ['person@example.com']);
  await expect(createInvitation(wid, 'other@example.com')).rejects.toThrow();
  await expect(changeMemberRole(wid, ids[1], 'owner')).rejects.toThrow();
  fixture.userId = ids[0];
  await changeMemberRole(wid, ids[1], 'owner');
  await changeMemberRole(wid, ids[1], 'member');
  await removeMember(wid, ids[1]);
  fixture.userId = ids[1];
  await expect(acceptInvitation(secret, ['person@example.com'])).rejects.toThrow();
});

test('resend cooldown allows exactly sixty seconds and preserves rate ledger', async () => {
  const { id } = await createInvitation(wid, 'person@example.com');
  const now = Date.now();
  await db()
    .update(invitationDeliveries)
    .set({ createdAt: new Date(now - 60000) })
    .where(eq(invitationDeliveries.invitationId, id));
  vi.spyOn(Date, 'now').mockReturnValue(now);
  try {
    await resendInvitation(id);
  } finally {
    vi.restoreAllMocks();
  }
  const deliveries = await db()
    .select()
    .from(invitationDeliveries)
    .where(eq(invitationDeliveries.invitationId, id));
  expect(deliveries).toHaveLength(2);
  expect(
    deliveries.filter((row) => row.state === 'cancelled' && row.encryptedToken === null),
  ).toHaveLength(1);
});
