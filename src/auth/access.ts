import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { repositories,installations } from '../db/schema';
import { env } from '../lib/env';
import { notFound } from 'next/navigation';
import { userClient } from './session';
import { authorizeRepository,type RepositoryGrant } from './authorization';
export async function accessibleRepositories(){
 if(env().DEMO_MODE==='true') return (await db().select().from(repositories).where(and(eq(repositories.isDemo,true),eq(repositories.active,true)))).map(r=>({...r,canAdmin:false}));
 const client=await userClient();
 const installs=await client.paginate(client.rest.apps.listInstallationsForAuthenticatedUser,{per_page:100});
 const grants:RepositoryGrant[]=[];
 for(const installation of installs){
  if(installation.suspended_at)continue;
  const repos=await client.paginate(client.rest.apps.listInstallationReposForAuthenticatedUser,{installation_id:installation.id,per_page:100});
  for(const repo of repos)grants.push({githubRepositoryId:String(repo.id),installationId:String(installation.id),admin:repo.permissions?.admin===true});
 }
 const available=await db().select({repo:repositories,installation:installations}).from(repositories).innerJoin(installations,eq(installations.id,repositories.installationId)).where(and(eq(repositories.active,true),eq(installations.active,true),eq(repositories.isDemo,false)));
 return available.filter(({repo,installation})=>authorizeRepository({...repo,installationId:installation.githubInstallationId},grants)).map(({repo,installation})=>({...repo,canAdmin:authorizeRepository({...repo,installationId:installation.githubInstallationId},grants,true)}));
}
export async function requireRepository(id:string,admin=false){const repo=(await accessibleRepositories()).find(r=>r.id===id);if(!repo||(admin&&!repo.canAdmin))notFound();return repo;}
