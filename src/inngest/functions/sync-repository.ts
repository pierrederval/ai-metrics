import { eq } from 'drizzle-orm';
import { inngest } from '../client';
import { repositorySyncData } from '../events';
import { latestPullRequests } from '../../github/sync-repository';
import { syncPullRequestFunction } from './sync-pull-request';
import { db } from '../../db';
import { repositories } from '../../db/schema';
export const syncRepositoryFunction=inngest.createFunction({id:'sync-repository',triggers:[{event:'github/repository.sync.requested'}],retries:5,singleton:{key:'event.data.repositoryId',mode:'skip'},onFailure:async({event,error})=>{
 const {repositoryId}=repositorySyncData.parse(event.data.event.data);await db().update(repositories).set({syncStatus:'failed',syncError:error.message,updatedAt:new Date()}).where(eq(repositories.id,repositoryId));
}},async({event,step})=>{
 const {repositoryId}=repositorySyncData.parse(event.data);
 const numbers=await step.run('list-latest-100',async()=>{
  await db().update(repositories).set({syncStatus:'running',syncProgress:0,syncError:null,updatedAt:new Date()}).where(eq(repositories.id,repositoryId));
  return latestPullRequests(repositoryId);
 });
 const failures:string[]=[];let completed=0;
 for(const number of numbers){
  try{await step.invoke(`sync-pr-${number}`,{function:syncPullRequestFunction,data:{repositoryId,number}});completed++;}
  catch{failures.push(`#${number}: synchronization failed; inspect Inngest run and retry import`);}
  await step.run(`progress-${number}`,()=>db().update(repositories).set({syncProgress:completed,updatedAt:new Date()}).where(eq(repositories.id,repositoryId)));
 }
 await step.run('finish-import',()=>db().update(repositories).set({syncStatus:failures.length?'partial':'complete',syncError:failures.length?failures.join('\n'):null,updatedAt:new Date()}).where(eq(repositories.id,repositoryId)));
 return {completed,total:numbers.length,failures};
});
