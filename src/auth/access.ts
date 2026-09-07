import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { repositories } from '../db/schema';
import { env } from '../lib/env';
import { redirect, notFound } from 'next/navigation';
export async function accessibleRepositories(){
 if(env().DEMO_MODE!=='true') redirect('/api/auth/login');
 return (await db().select().from(repositories).where(and(eq(repositories.isDemo,true),eq(repositories.active,true)))).map(r=>({...r,canAdmin:false}));
}
export async function requireRepository(id:string,admin=false){
 const repo=(await accessibleRepositories()).find(r=>r.id===id);
 if(!repo||(admin&&!repo.canAdmin)) notFound();return repo;
}
