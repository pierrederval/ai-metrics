import { eq, inArray, desc } from 'drizzle-orm';
import { db } from '..';
import { pullRequests, prMetrics, gatePolicies } from '../schema';
export async function prRows(repositoryIds:string[]){
 if(!repositoryIds.length) return [];
 return db().select({pr:pullRequests,metrics:prMetrics}).from(pullRequests).innerJoin(prMetrics,eq(prMetrics.pullRequestId,pullRequests.id)).where(inArray(pullRequests.repositoryId,repositoryIds)).orderBy(desc(pullRequests.openedAt));
}
export async function currentPolicy(repositoryId:string){
 const [policy]=await db().select().from(gatePolicies).where(eq(gatePolicies.repositoryId,repositoryId)).orderBy(desc(gatePolicies.version)).limit(1);
 return policy??{version:0,gates:[]};
}
