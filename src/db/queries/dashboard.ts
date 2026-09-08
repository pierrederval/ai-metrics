import { eq, inArray, desc } from 'drizzle-orm';
import { db } from '..';
import { pullRequests, prMetrics, gatePolicies } from '../schema';
import { visiblePrIds } from './history-access';
export async function prRows(repositoryIds: string[]) {
  if (!repositoryIds.length) return [];
  const visibleIds = await visiblePrIds(repositoryIds);
  if (!visibleIds.length) return [];
  return db()
    .select({ pr: pullRequests, metrics: prMetrics })
    .from(pullRequests)
    .innerJoin(prMetrics, eq(prMetrics.pullRequestId, pullRequests.id))
    .where(inArray(pullRequests.id, visibleIds))
    .orderBy(desc(pullRequests.openedAt));
}
export async function currentPolicy(repositoryId: string) {
  const [policy] = await db()
    .select()
    .from(gatePolicies)
    .where(eq(gatePolicies.repositoryId, repositoryId))
    .orderBy(desc(gatePolicies.version))
    .limit(1);
  return policy ?? { version: 0, gates: [] };
}
