import { inngest } from '../client';
import { prSyncData } from '../events';
import { syncPullRequest } from '../../github/sync-pull-request';
export const syncPullRequestFunction=inngest.createFunction({id:'sync-pull-request',triggers:[{event:'github/pr.sync.requested'}],retries:5,concurrency:{limit:1,key:'event.data.repositoryId + ":" + event.data.number'}},async({event,step})=>{
 const {repositoryId,number}=prSyncData.parse(event.data);
 return step.run('hydrate-and-project-pr',()=>syncPullRequest(repositoryId,number));
});
