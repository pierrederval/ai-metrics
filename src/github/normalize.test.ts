import { expect,test } from 'vitest';
import { normalizeCheck,normalizeFile } from './normalize';
test('normalizes renamed files and rejects unsupported check conclusions',()=>{
 expect(normalizeFile({filename:'src/x.ts',previous_filename:'tests/x.ts',status:'renamed',additions:0,deletions:0})).toMatchObject({previousPath:'tests/x.ts',changeType:'renamed'});
 expect(()=>normalizeCheck({id:1,name:'unit',head_sha:'a',status:'completed',conclusion:'mystery',app:{id:1},started_at:null,completed_at:null})).toThrow();
});
test('correlates Actions jobs without counting check runs twice and retains attempts',async()=>{
 const {Octokit}=await import('octokit');const {collectChecks}=await import('./collect-checks');
 const raw={id:11,name:'unit',head_sha:'a',status:'completed',conclusion:'success',app:{id:1},started_at:'2026-01-01T00:03:00Z',completed_at:'2026-01-01T00:04:00Z'};
 const fakeFetch:typeof fetch=async input=>{
  const url=String(input);
  const data=url.includes('/check-runs')?{total_count:1,check_runs:[raw]}:url.includes('/attempts/')?{total_count:1,jobs:[{id:22,check_run_url:'https://api.github.com/repos/o/r/check-runs/11',name:'unit',status:'completed',conclusion:url.includes('/attempts/1/')?'failure':'success',started_at:url.includes('/attempts/1/')?'2026-01-01T00:01:00Z':'2026-01-01T00:03:00Z',completed_at:url.includes('/attempts/1/')?'2026-01-01T00:02:00Z':'2026-01-01T00:04:00Z'}]}:{total_count:1,workflow_runs:[{id:33,name:'CI',run_attempt:2}]};
  const response=new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;
 };
 const checks=await collectChecks(new Octokit({request:{fetch:fakeFetch}}),'o','r','a',[]);
 expect(checks).toHaveLength(2);expect(checks.map(c=>c.conclusion)).toEqual(['failure','success']);expect(checks.map(c=>c.execution)).toEqual([1,2]);
});
