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
test('duplicate delivery IDs persist one raw event',async()=>{
 const {persistEvent}=await import('./queries/events');
 const delivery=`duplicate-${Date.now()}`;
 const [a,b]=await Promise.all([persistEvent(delivery,'ping',{hello:'world'},{}),persistEvent(delivery,'ping',{hello:'world'}, {})]);
 expect(a.id).toBe(b.id);expect(await db().select().from(s.githubEvents).where(eq(s.githubEvents.deliveryId,delivery))).toHaveLength(1);
});
test('failed dispatch is recoverable and processing is idempotent',async()=>{
 const {persistEvent}=await import('./queries/events');const {dispatchEvent}=await import('../inngest/dispatch');const {processEvent}=await import('../inngest/process-event');
 const event=await persistEvent(`retry-${Date.now()}`,'ping',{},{});
 await expect(dispatchEvent(event.id,async()=>{throw new Error('network unavailable');})).rejects.toThrow();
 let sent=0;await dispatchEvent(event.id,async()=>{sent++;});await dispatchEvent(event.id,async()=>{sent++;});expect(sent).toBe(1);
 let processed=0;const handler=async()=>{processed++;return 'processed' as const;};
 await processEvent(event.id,handler);await processEvent(event.id,handler);expect(processed).toBe(1);
});
