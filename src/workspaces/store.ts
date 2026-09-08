import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { workspaceMemberships, workspaces } from '../db/schema';

export type Role = 'owner' | 'member';
export type Workspace = { id: string; name: string };

export const workspaceName = z.string().trim().min(1).max(80);

export async function ensureDefaultWorkspace(userId: string): Promise<Workspace> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select id from users where id = ${userId} for update`);

    const [existing] = await tx
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.defaultForUserId, userId))
      .limit(1);
    if (existing) return existing;

    const workspace = {
      id: randomUUID(),
      name: 'Personal workspace',
    };
    await tx.insert(workspaces).values({ ...workspace, defaultForUserId: userId });
    await tx.insert(workspaceMemberships).values({
      workspaceId: workspace.id,
      userId,
      role: 'owner',
    });
    return workspace;
  });
}

export async function createWorkspace(userId: string, name: string): Promise<Workspace> {
  const workspace = { id: randomUUID(), name: workspaceName.parse(name) };
  return db().transaction(async (tx) => {
    await tx.execute(sql`select id from users where id = ${userId} for update`);
    await tx.insert(workspaces).values(workspace);
    await tx.insert(workspaceMemberships).values({
      workspaceId: workspace.id,
      userId,
      role: 'owner',
    });
    return workspace;
  });
}

export async function listWorkspaces(userId: string): Promise<Array<Workspace & { role: Role }>> {
  return db()
    .select({ id: workspaces.id, name: workspaces.name, role: workspaceMemberships.role })
    .from(workspaceMemberships)
    .innerJoin(workspaces, and(eq(workspaceMemberships.workspaceId, workspaces.id)))
    .where(eq(workspaceMemberships.userId, userId))
    .orderBy(asc(workspaces.createdAt), asc(workspaces.id));
}
