import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { currentUser } from '../auth/session';
import { db } from '../db';
import { workspaceMemberships, workspaces } from '../db/schema';
import { env } from '../lib/env';
import type { Role } from './store';

export type WorkspaceTransaction = Parameters<
  Parameters<ReturnType<typeof db>['transaction']>[0]
>[0];

export async function mutationUser() {
  if (env().DEMO_MODE === 'true') throw new Error('Workspace unavailable');
  return currentUser();
}

// Every workspace mutation takes this lock before checking membership.
export async function lockWorkspace(tx: WorkspaceTransaction, workspaceId: string) {
  const rows = await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .for('update');
  if (!rows.length) throw new Error('Workspace unavailable');
}
export async function authorizeOwner(
  tx: WorkspaceTransaction,
  workspaceId: string,
  userId: string,
) {
  const [actor] = await tx
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId),
      ),
    );
  if (actor?.role !== 'owner') throw new Error('Workspace unavailable');
}
async function mutateMember(workspaceId: string, userId: string, role?: Role) {
  const actor = await mutationUser();
  await db().transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    await authorizeOwner(tx, workspaceId, actor.id);
    const target = and(
      eq(workspaceMemberships.workspaceId, workspaceId),
      eq(workspaceMemberships.userId, userId),
    );
    const [member] = await tx.select().from(workspaceMemberships).where(target);
    if (!member) throw new Error('Member unavailable');
    if (member.role === 'owner' && role !== 'owner') {
      const [owners] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            eq(workspaceMemberships.role, 'owner'),
          ),
        );
      if (owners.count <= 1) throw new Error('Workspace must retain an owner');
    }
    if (role) await tx.update(workspaceMemberships).set({ role }).where(target);
    else await tx.delete(workspaceMemberships).where(target);
  });
}
export async function changeMemberRole(
  workspaceId: string,
  userId: string,
  role: Role,
): Promise<void> {
  if (role !== 'owner' && role !== 'member') throw new Error('Invalid role');
  await mutateMember(workspaceId, userId, role);
}
export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  await mutateMember(workspaceId, userId);
}
