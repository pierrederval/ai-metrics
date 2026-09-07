import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { repositories,pullRequests } from '../db/schema';
import type { StoredEvent } from '../inngest/process-event';
import { inngest } from '../inngest/client';
import { reconcileInstallation,repositoryClient } from './repositories';
const relatedSchema=z.object({head_sha:z.string(),pull_requests:z.array(z.object({number:z.number()})).optional()});
export async function handleGithubEvent(event:StoredEvent):Promise<'processed'|'unsupported'>{
 if(event.eventName==='ping')return 'processed';
 if(!event.installationId)return 'unsupported';
 if(['installation','installation_repositories'].includes(event.eventName)){
  const ids=await reconcileInstallation(event.installationId);
  if(['created','added','unsuspend','new_permissions_accepted'].includes(event.action??''))for(const repositoryId of ids)await inngest.send({id:`${event.deliveryId}:${repositoryId}`,name:'github/repository.sync.requested',data:{repositoryId}});
  return 'processed';
 }
 if(!['pull_request','check_run','check_suite','workflow_run'].includes(event.eventName)||!event.repositoryId)return 'unsupported';
 let [repo]=await db().select().from(repositories).where(eq(repositories.githubRepositoryId,event.repositoryId));
 if(!repo){await reconcileInstallation(event.installationId);[repo]=await db().select().from(repositories).where(eq(repositories.githubRepositoryId,event.repositoryId));}
 if(!repo||!repo.active) return 'unsupported';
 const numbers=new Set<number>();
 if(event.eventName==='pull_request')numbers.add(z.object({number:z.number().int().positive()}).parse(event.payload.pull_request).number);
 else{
  const entity=relatedSchema.parse(event.payload[event.eventName]);for(const pr of entity.pull_requests??[])numbers.add(pr.number);
  const known=await db().select().from(pullRequests).where(eq(pullRequests.repositoryId,repo.id));for(const pr of known)if(pr.facts.revisions.some(r=>r.sha===entity.head_sha))numbers.add(pr.githubPrNumber);
  if(!numbers.size){const {client}=await repositoryClient(repo.id);const associated=await client.paginate(client.rest.repos.listPullRequestsAssociatedWithCommit,{owner:repo.owner,repo:repo.name,commit_sha:entity.head_sha,per_page:100});for(const pr of associated)numbers.add(pr.number);}
 }
 for(const number of numbers)await inngest.send({id:`${event.deliveryId}:pr:${number}`,name:'github/pr.sync.requested',data:{repositoryId:repo.id,number}});
 return numbers.size?'processed':'unsupported';
}
