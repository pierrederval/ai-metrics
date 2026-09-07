import { beforeAll, afterAll, expect, test } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';
import { db, closeDb } from './index';
import * as s from './schema';
import { persistPr, setGatePolicy } from './queries/persist-pr';
const instant='2026-01-01T00:00:00.000Z';
beforeAll(async()=>{
 await migrate(db(),{migrationsFolder:'drizzle'});
 await db().insert(s.installations).values({id:'test-install',githubInstallationId:'test-install',accountLogin:'test',accountType:'User'}).onConflictDoNothing();
 await db().insert(s.repositories).values({id:'test-repo',installationId:'test-install',githubRepositoryId:'test-repo',owner:'test',name:'test',defaultBranch:'main',isPrivate:true}).onConflictDoNothing();
});
afterAll(closeDb);
test('replayed and concurrent facts produce one PR and one projection',async()=>{
 const input={id:'test-pr',repositoryId:'test-repo',githubPrId:'test-pr',githubPrNumber:1,title:'test',state:'closed',authorLogin:'test',headSha:'abc',baseSha:'base',openedAt:new Date(instant),sourceUpdatedAt:new Date(instant),facts:{openedAt:instant,mergedAt:null,closedAt:instant,checks:[],files:[],revisions:[],historyComplete:true,issues:[]}};
 await Promise.all([persistPr(input),persistPr(input)]);
 expect(await db().select().from(s.pullRequests).where(eq(s.pullRequests.id,input.id))).toHaveLength(1);
 const projections=await db().select().from(s.prMetrics).where(eq(s.prMetrics.pullRequestId,input.id));expect(projections).toHaveLength(1);expect(projections[0].firstPassGreen).toBeNull();
 const version=await setGatePolicy('test-repo',[{appId:'1',name:'unit'}]);
 const [updated]=await db().select().from(s.prMetrics).where(eq(s.prMetrics.pullRequestId,input.id));expect(updated.gatePolicyVersion).toBe(version);
});
