export interface RepositoryGrant { githubRepositoryId:string; installationId:string; admin:boolean }
export function authorizeRepository(repository:{githubRepositoryId:string;installationId:string;active:boolean;isDemo:boolean},grants:RepositoryGrant[],admin=false){
 return repository.active&&!repository.isDemo&&grants.some(g=>g.githubRepositoryId===repository.githubRepositoryId&&g.installationId===repository.installationId&&(!admin||g.admin));
}
