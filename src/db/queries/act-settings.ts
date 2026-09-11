import { eq } from 'drizzle-orm';
import { db } from '../index';
import { repositories } from '../schema';

// A repository we cannot find is off, not an error: callers are asking
// whether Act may run, and the answer for an unknown repository is no.
export async function actEnabled(repositoryId: string): Promise<boolean> {
  const [row] = await db()
    .select({ enabled: repositories.actEnabled })
    .from(repositories)
    .where(eq(repositories.id, repositoryId));
  return row?.enabled ?? false;
}

export async function setActEnabled(repositoryId: string, enabled: boolean): Promise<void> {
  await db()
    .update(repositories)
    .set({ actEnabled: enabled, updatedAt: new Date() })
    .where(eq(repositories.id, repositoryId));
}
