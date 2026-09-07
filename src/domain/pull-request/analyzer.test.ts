import { expect, test } from 'vitest';
import { analyzePullRequest } from './analyzer';
import type { CiCheck, Conclusion, PullRequestFacts } from './types';
export const at = (n: number) => new Date(Date.UTC(2026,0,1,0,n)).toISOString();
export const check = (sha: string, conclusion: Conclusion | null, n = 1, name = 'unit'): CiCheck => ({id:`${sha}-${name}-${n}`,sha,appId:'1',name,execution:n,status:conclusion ? 'completed':'in_progress',conclusion,queuedAt:at(n),startedAt:at(n),completedAt:conclusion?at(n+1):null});
export const facts = (checks: CiCheck[]): PullRequestFacts => ({openedAt:at(0),mergedAt:null,closedAt:at(20),checks,files:[],revisions:[...new Set(checks.map(c=>c.sha))].map((sha,i,a)=>({sha,previousSha:a[i-1]??null,observedAt:at(i*4),files:[],diffComplete:true})),historyComplete:true,issues:[]});
const policy = {version:1,gates:[{appId:'1',name:'unit'}]};
test('first attempt green has clean green and one attempt',()=>{
 expect(analyzePullRequest(facts([check('a','success')]),policy).metrics).toMatchObject({firstPassGreen:true,eventuallyGreen:true,cleanGreen:true,ciAttemptCount:1,attemptsToGreen:1,timeToFirstGreenSeconds:60});
});
test.each([
 [['failure','success'],false,true,2],
 [['failure','failure','success'],false,true,3],
 [['failure','failure'],false,false,null],
 [['skipped'],false,false,null], [['neutral'],false,false,null],
] as [Conclusion[],boolean,boolean,number|null][])('evaluates sequence %j',(sequence,first,green,count)=>{
 const result=analyzePullRequest(facts(sequence.map((c,i)=>check(String(i),c,i*4+1))),policy).metrics;
 expect(result).toMatchObject({firstPassGreen:first,eventuallyGreen:green,attemptsToGreen:count});
});
test('successful rerun preserves first failure and one SHA attempt',()=>{
 expect(analyzePullRequest(facts([check('a','failure'),check('a','success',3)]),policy).metrics).toMatchObject({firstPassGreen:false,eventuallyGreen:true,attemptsToGreen:1,ciAttemptCount:1});
});
test('missing required gate and incomplete history are unknown',()=>{
 expect(analyzePullRequest(facts([check('a','success')]),{version:1,gates:[...policy.gates,{appId:'1',name:'lint'}]}).metrics.firstPassGreen).toBeNull();
 const f=facts([check('a','success')]);f.historyComplete=false;
 expect(analyzePullRequest(f,policy).metrics).toMatchObject({firstPassGreen:null,eventuallyGreen:true,cleanGreen:null});
});
test('unconfigured policy never reports vacuous success',()=>expect(analyzePullRequest(facts([]),{version:0,gates:[]}).metrics).toMatchObject({firstPassGreen:null,eventuallyGreen:null,evidenceStatus:'unconfigured'}));
test.each(['tests/foo.spec.ts','src/foo.ts','package.json'])('detects subsequent revision changes in %s',path=>{
 const f=facts([check('a','failure'),check('b','success',5)]);
 f.revisions[1].files=[{path,changeType:'modified',additions:1,deletions:0}];
 expect(analyzePullRequest(f,policy).metrics.harnessChangedAfterFailure).toBe(path!=='src/foo.ts');
});
test('rename out of test directory still counts as harness mutation',()=>{
 const f=facts([check('a','failure'),check('b','success',5)]);
 f.revisions[1].files=[{path:'src/fixture.ts',previousPath:'tests/fixture.ts',changeType:'renamed',additions:0,deletions:0}];
 expect(analyzePullRequest(f,policy).metrics.cleanGreen).toBe(false);
});
test('unknown revision diff does not assert a clean repair',()=>{
 const f=facts([check('a','failure'),check('b','success',5)]);f.revisions[1].diffComplete=false;
 expect(analyzePullRequest(f,policy).metrics.harnessChangedAfterFailure).toBeNull();
});
test('duplicates and input permutations leave analysis unchanged',()=>{
 const f=facts([check('a','failure'),check('b','success',5)]);
 expect(analyzePullRequest({...f,checks:[...f.checks,...f.checks].reverse(),revisions:[...f.revisions].reverse()},policy)).toEqual(analyzePullRequest(f,policy));
});
test('concurrent rerun prevents green while another required gate completes',()=>{
 const f=facts([check('a','success',1),check('a','failure',3),check('a','success',3,'lint')]);
 f.checks[1].completedAt=at(6);
 expect(analyzePullRequest(f,{version:1,gates:[...policy.gates,{appId:'1',name:'lint'}]}).metrics.eventuallyGreen).toBe(false);
});
test('missing start timestamps do not invent time to green',()=>{
 const f=facts([check('a','success')]);f.checks[0].startedAt=null;
 expect(analyzePullRequest(f,policy).metrics.timeToFirstGreenSeconds).toBeNull();
});
