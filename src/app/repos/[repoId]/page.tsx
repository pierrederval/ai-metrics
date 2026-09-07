import { saveGates,requestImport } from './actions';
import { gateKey } from '../../../domain/pull-request/types';
import { requireRepository } from '../../../auth/access';
import { currentPolicy, prRows } from '../../../db/queries/dashboard';
import { MetricCards } from '../../../components/metrics';
import { PrTable } from '../../../components/pr-table';
import { failureBreakdown } from '../../../metrics/aggregate';
export const dynamic='force-dynamic';
export default async function Repository({params}:{params:Promise<{repoId:string}>}){
 const {repoId}=await params,repo=await requireRepository(repoId),rows=await prRows([repoId]),policy=await currentPolicy(repoId);
 const candidates=[...new Map([...policy.gates,...rows.flatMap(r=>r.pr.facts.checks)].map(g=>[gateKey(g),{appId:g.appId,name:g.name}])).values()];
 const failures=failureBreakdown(rows.map(r=>r.pr),policy);
 return <><h1>{repo.owner}/{repo.name}</h1><p>{rows.length} PRs analyzed · Gate policy v{policy.version} · Import: {repo.syncStatus} ({repo.syncProgress})</p>{repo.syncError&&<p role="alert">{repo.syncError}</p>}<div>{repo.canAdmin&&<form action={requestImport.bind(null,repoId)}><button>Import latest 100 PRs / retry</button></form>}</div><MetricCards metrics={rows.map(r=>r.metrics.projection)}/><h2>Required gates</h2><p>{policy.gates.map(g=>`${g.name} (app ${g.appId})`).join(', ')||'Not configured — outcomes remain unknown.'}</p>{repo.canAdmin&&<form action={saveGates.bind(null,repoId)}>{candidates.map(g=><label key={gateKey(g)}><input type="checkbox" name="gate" value={JSON.stringify(g)} defaultChecked={policy.gates.some(p=>gateKey(p)===gateKey(g))}/> {g.name} (app {g.appId})</label>)}<button>Save policy and recompute PRs</button></form>}<h2>Failures by check name</h2><table><thead><tr><th>Gate</th><th>Failures</th><th>Affected PRs</th><th>Failure rate</th></tr></thead><tbody>{failures.map(f=><tr key={`${f.appId}:${f.checkName}`}><td>{f.checkName} <small>app {f.appId}</small></td><td>{f.failureCount}</td><td>{f.affectedPrCount}</td><td>{(f.failureRate*100).toFixed(1)}% / {f.total} executions</td></tr>)}</tbody></table><h2>Pull requests</h2><PrTable rows={rows}/></>;
}
