# Versioned repository readiness grader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship reproducible repository assessments and the approved rarity card.

**Architecture:** Pure rubric evaluation consumes a bounded GitHub snapshot at a pinned SHA. Inngest stores durable immutable runs and evidence; workspace authorization gates requests and reads. Presentation is separate from scoring so future rubrics can change without rewriting card components.

**Tech Stack:** Next.js 16.3.4, React 19.2.8, TypeScript, PostgreSQL, Drizzle, Inngest, Vitest; GitHub REST and Resend REST through existing server-side fetch/Octokit.

**Spec:** `docs/superpowers/specs/2026-09-08-workspaces-grader-design.md`

## Global Constraints

- Keep Fieldnote’s current visual style; Railway is a feature reference only.
- Use existing Next.js 16.3.4, React 19.2.8, PostgreSQL, Drizzle, Vitest, and Inngest conventions; do not upgrade dependencies for this work.
- Read relevant installed guides in `node_modules/next/dist/docs/` before application code changes.
- GitHub is the only sign-in provider. Resend delivers workspace invitations.
- Workspace membership grants access to every connected repository’s analytics and grading evidence, including private repositories.
- Owner manages settings, invitations, and members; Member reads analytics and runs graders. Connecting repositories additionally requires current GitHub administrator permission.
- Every completed grade preserves its commit SHA, rubric version, evaluator version, results, and evidence. Never silently recompute historical grades.
- No repository code execution, LLM grading, harness grading, or deployment grading in v0.1.
- Never include secrets, invitation tokens, GitHub credentials, or raw repository files in logs or client props.


## Execution preparation

- [ ] Read the spec and saved preview; the user approved the five-check, 20-points-per-check initial policy at execution time.
- [ ] Inspect `git status --short`; preserve existing README.md and next-env.d.ts changes. Read AGENTS.md and installed Next guides for layouts, cookies, route handlers, server actions, and authentication. Use the executing skill's workspace isolation workflow at execution time.
- [ ] Use `pnpm exec vitest run <unit-test-path>` for unit tests and `pnpm exec vitest run --config vitest.integration.config.ts <integration-test-path>` for database tests. Integration configuration refuses databases whose names do not end in `_test`.

## File ownership and task order

The file lists below are the ownership map. Create files only when their task is implemented. Existing `src/db/schema.ts` remains the schema registry; domain policies are pure, DB services own transactions, auth wrappers resolve the caller, UI never grants access. Complete tasks sequentially. Each numbered implementation item is a separate small edit/check, not one large coding step.

**Dependency:** complete `2026-09-08-team-workspaces.md` first. A linked workspace member may request a run; no personal GitHub grant is required to read/run it.

### Task 1: Versioned rubric and pure evaluator

**Files:** Create `src/domain/grading/types.ts`, `src/domain/grading/readiness-v01.ts`, `src/domain/grading/readiness-v01.test.ts`.

**Interfaces:**
Produces `SourceDocument={path:string;blobSha:string;text:string}`; `RepositorySnapshot={sha:string;complete:boolean;documents:SourceDocument[]}`; `CheckResult={id:string;points:number;maxPoints:number;status:'pass'|'fail';paths:string[];lineRanges:Array<{path:string;start:number;end:number}>;explanation:string}`; `GradeResult={score:number|null;checks:CheckResult[];rubricVersion:string;evaluatorVersion:string;incompleteReason?:string}`; `evaluateReadiness(snapshot:RepositorySnapshot):GradeResult`.

- [x] **Write the first regression test** in the listed test file, using Vitest imports and the named production imports. Database cases use the existing integration setup and cleanup conventions.

```ts
test('incomplete evidence cannot receive a zero or perfect score', () => {
  expect(evaluateReadiness({sha:'abc',complete:false,documents:[]}).score).toBeNull();
});
test('empty complete repo scores zero', () => {
  expect(evaluateReadiness({sha:'abc',complete:true,documents:[]}).score).toBe(0);
});
```

- [x] **Run red:** `pnpm exec vitest run src/domain/grading/readiness-v01.test.ts`. Expected: missing export/module or failing assertion; fix harness errors before implementation.

- [x] Define types above and export frozen rubric `{family:'agent-readiness',version:'0.1.0',evaluatorVersion:'1.0.0'}` with the five exact 20-point checks in the spec. Keep evidence paths and line ranges per match.

```ts
const score = snapshot.complete ? checks.reduce((sum, check) => sum + check.points, 0) : null;
return {score, checks, rubricVersion:'0.1.0', evaluatorVersion:'1.0.0'};
```

- [x] Implement fenced-code/heading scanning as a line state machine: ATX heading depth bounds sections; headings inside fences do not count. Record original line numbers. Recognize backtick or tilde fences; nonempty body required. Do not execute or obey document text.
- [x] Add fixtures for either instruction file, both without double count, empty files, README filename casing, docs extensions, valid/absent setup and test sections, fenced fake headings and all five checks yielding 100. State prominently that file/documentation evidence is not semantic quality certification.


- [x] **Run green:** `pnpm exec vitest run src/domain/grading/readiness-v01.test.ts`. Expected: all task cases pass. Run `pnpm typecheck` and fix integration signatures before continuing.
- [x] **Commit only this task’s listed files**, including generated migration metadata when applicable: `git commit -m "feat: define reproducible readiness rubric v0.1"`. Stage paths explicitly; do not stage unrelated changes.

### Task 2: Bounded pinned-SHA GitHub collector

**Files:** Create `src/github/collect-readiness.ts`, `src/github/collect-readiness.test.ts`.

**Interfaces:**
Consumes installationClient and Task 1 types. Produces `collectReadiness(repositoryId:string,sha?:string):Promise<RepositorySnapshot>`; absent SHA resolves default branch exactly once; supplied SHA must be reused. Repository/installation lookup uses existing schema, not caller-provided owner strings.

- [x] **Write the first regression test** in the listed test file, using Vitest imports and the named production imports. Database cases use the existing integration setup and cleanup conventions.

```ts
test('all blob requests use the resolved commit tree', async () => {
  // Mock installationClient: default branch resolves abc; tree abc references blob b1.
  const snapshot = await collectReadiness('fixture-repo','abc');
  expect(snapshot.sha).toBe('abc');
  expect(snapshot.documents[0].blobSha).toBe('b1');
});
```

- [x] **Run red:** `pnpm exec vitest run src/github/collect-readiness.test.ts`. Expected: missing export/module or failing assertion; fix harness errors before implementation.

- [x] Fetch commit and Git tree with installation credentials. For recursive truncation walk subtrees breadth-first, count entries, maintain path prefix. Select regular UTF-8 rubric files only; skip mode 120000 and gitlinks. Fetch by immutable blob SHA.

```ts
const limits = {entries:10000, documents:200, fileBytes:128*1024, totalBytes:2*1024*1024};
const regular = entry.mode === '100644' || entry.mode === '100755';
// Bound bytes before decoding; preserve path and blob SHA in SourceDocument.
```

- [x] Mark snapshot incomplete when relevant files exceed caps, cannot decode, or tree traversal cannot complete. Treat GitHub 403/429/5xx as retryable collection errors where appropriate; deleted/empty repositories get explicit safe failure reasons, never fabricated zero. Bound request timeouts and concurrency to four blob requests.
- [x] Add mocked cases for branch moving after SHA resolution, nested docs, truncated trees, symlinks, binary/oversize relevant files, empty repo, missing README confirmed by tree, rate limiting and installation revocation. Validate no unrelated files are downloaded.


- [x] **Run green:** `pnpm exec vitest run src/github/collect-readiness.test.ts`. Expected: all task cases pass. Run `pnpm typecheck` and fix integration signatures before continuing.
- [x] **Commit only this task’s listed files**, including generated migration metadata when applicable: `git commit -m "feat: collect bounded readiness evidence at a pinned commit"`. Stage paths explicitly; do not stage unrelated changes.

### Task 3: Durable immutable grade runs

**Files:** Modify `src/db/schema.ts`, `src/inngest/events.ts`, `src/app/api/inngest/route.ts`; create `src/db/queries/grade-runs.ts`, `src/db/grade-runs.integration.test.ts`, `src/inngest/dispatch-grade.ts`, `src/inngest/functions/grade-repository.ts`, `src/inngest/functions/reconcile-grades.ts`; generate migration metadata.

**Interfaces:**
Produces `requestGrade(repositoryId:string):Promise<{id:string;state:string}>`, `latestGrade(repositoryId:string):Promise<GradeResult & {id:string;sha:string;computedAt:Date}|null>`, `dispatchGrade(runId:string):Promise<void>`. Event `repository/grade.requested` has `{runId:string}`. Task 4 calls authorized requestGrade; service requires requireRepository before request/read. Worker loads run server-side.

- [x] **Write the first regression test** in the listed test file, using Vitest imports and the named production imports. Database cases use the existing integration setup and cleanup conventions.

```ts
test('concurrent clicks share one active run', async () => {
  const [a,b] = await Promise.all([requestGrade('fixture-repo'),requestGrade('fixture-repo')]);
  expect(a.id).toBe(b.id);
});
```

- [x] **Run red:** `pnpm exec vitest run --config vitest.integration.config.ts src/db/grade-runs.integration.test.ts`. Expected: missing export/module or failing assertion; fix harness errors before implementation.

- [x] Add rubric definitions keyed family/version with immutable definition JSON and evaluator version. Add grade_runs: id, repositoryId, family, rubricVersion, evaluatorVersion, requestedBy, requestedWorkspaceId, retryOf, state, sha nullable until resolved, result JSON, safe error, dispatchedAt, createdAt, startedAt, completedAt. Checked states queued/running/complete/failed; score constraint 0–100. Unique partial index on repository/family when queued/running.
- [x] Use insert-conflict/select for active run dedup; new retry links failed ID. Register immutable rubric with insert-on-conflict-do-nothing and verify stored definition equals code; changed definitions require a new version. Persist SHA in its own durable worker step before collection.

```ts
await inngest.send({id:runId,name:'repository/grade.requested',data:{runId}});
// Finish with a conditional update WHERE id = runId AND state = 'running'.
// Store only check evidence metadata, not snapshot.documents text.
```

- [x] Worker loads pinned rubric, validates active installation and current requesting-workspace link, collects/evaluates, and commits result exactly once. Terminal incomplete collection stores failed/no score. Bounded retries keep same SHA; on final failure update state. Reconciler resends undispatched queued runs; stable event IDs close acknowledgment gaps. Terminal state is immutable in service updates.
- [x] Test concurrency, duplicate delivery, failure before dispatch acknowledgment, SHA reuse, revoked workspace link before start, immutable completed result, two rubric versions, and failed run retry as a new ID. Latest completed result remains visible when newer run fails. Latest reads must enforce workspace access; no workspace-specific secrets in repo-wide result.


- [x] **Run green:** `pnpm exec vitest run --config vitest.integration.config.ts src/db/grade-runs.integration.test.ts`. Expected: all task cases pass. Run `pnpm typecheck` and fix integration signatures before continuing.
- [x] **Commit only this task’s listed files**, including generated migration metadata when applicable: `git commit -m "feat: persist and execute versioned repository grades"`. Stage paths explicitly; do not stage unrelated changes.

### Task 4: Rarity presentation and report UI

**Files:** Create `src/domain/grading/presentation.ts`, `src/domain/grading/presentation.test.ts`, `src/components/grading/grade-card.tsx`, `src/components/grading/grade-card.css`, `src/components/grading/report.tsx`, `src/app/repos/[repoId]/grading/actions.ts`, `src/app/repos/[repoId]/grading/page.tsx`, `src/app/api/repos/[repoId]/grades/[runId]/route.ts`; modify `src/app/repos/[repoId]/page.tsx`, `src/app/dashboard/page.tsx`.

**Interfaces:**
Produces `gradePresentation(score:number):{label:string;finish:'common'|'shimmer'|'bronze'|'silver'|'gold'|'rainbow';color:string;symbol:'circle'|'star';count:number}`; `GradeCard({score,repositoryName,sha,rubricVersion}: {score:number;repositoryName:string;sha:string;rubricVersion:string})`; `runGrade(repositoryId:string):Promise<{runId:string}>`. Reads Task 3 latestGrade and queries active run separately. Poll route verifies requireRepository and run.repositoryId equality before returning sanitized status.

- [ ] **Write the first regression test** in the listed test file, using Vitest imports and the named production imports. Database cases use the existing integration setup and cleanup conventions.

```ts
test.each([[49,'common'],[50,'shimmer'],[69,'shimmer'],[70,'bronze'],[79,'bronze'],[80,'silver'],[89,'silver'],[90,'gold'],[99,'gold'],[100,'rainbow']])('score %s has finish %s',(score,finish)=>{
  expect(gradePresentation(Number(score)).finish).toBe(finish);
});
```

- [ ] **Run red:** `pnpm exec vitest run src/domain/grading/presentation.test.ts`. Expected: missing export/module or failing assertion; fix harness errors before implementation.

- [ ] Implement exact boundaries and symbols in spec. Reject nonfinite, fractional and out-of-range scores. Share color between score, arrow and rarity marker; mediocre color is #548eae. Null result renders an ungraded status outside GradeCard.

```ts
const finish = score === 100 ? 'rainbow' : score >= 90 ? 'gold' : score >= 80 ? 'silver' : score >= 70 ? 'bronze' : score >= 50 ? 'shimmer' : 'common';
```

- [ ] Port approved card appearance into isolated component CSS, retaining compact proportions. White/blue/bronze/silver/gold scale uses actual percentage positions; 100 rainbow is card-only. Use SVG circles/stars, data-finish attribute, readable labels and accessible score text. Below 50 stays flat red. Pointer sheen is optional and disabled for reduced motion. No demo slider in production.
- [ ] Repo report displays checks, points, explanations, pinned evidence links, rubric/evaluator version and timestamp. Keep old report alongside progress/errors. Member Run grader queues and polls until terminal state; initial/no-permission/network/failed states have clear copy. Link dashboard KPI to repo report; query grade summaries in one batch rather than per-row fetches.
- [ ] Add action/route authorization tests: outsider, wrong repo/run pair, member allowed, disconnected repo denied. Render malicious path/explanation as escaped text. Browser-check 0,49,50,69,70,79,80,89,90,99,100 at mobile/desktop; keyboard, reduced motion, touch fallback and scale labels. Confirm gold only 90–99 and perfect rainbow only 100.


- [ ] **Run green:** `pnpm exec vitest run src/domain/grading/presentation.test.ts`. Expected: all task cases pass. Run `pnpm typecheck` and fix integration signatures before continuing.
- [ ] **Commit only this task’s listed files**, including generated migration metadata when applicable: `git commit -m "feat: render readiness reports and rarity grade cards"`. Stage paths explicitly; do not stage unrelated changes.

### Task 5: Operational fixtures and release verification

**Files:** Modify `scripts/seed.ts`, `docs/railway.md`; create `src/domain/grading/release.test.ts`; update the repository README only around relevant new instructions, preserving unrelated edits.

**Interfaces:**
Consumes evaluator and all completed UI/run services. Produces documentation and deterministic demo fixtures only; no new runtime interface.

- [ ] **Write the first regression test** in the listed test file, using Vitest imports and the named production imports. Database cases use the existing integration setup and cleanup conventions.

```ts
test('a complete foundational fixture reaches 100', () => {
  const documents = [
    {path:'AGENTS.md',blobSha:'a',text:'Follow project conventions.'},
    {path:'README.md',blobSha:'b',text:'# Setup\n```sh\npnpm install\n```\n# Testing\n```sh\npnpm test\n```'},
    {path:'docs/architecture.md',blobSha:'c',text:'# Architecture\nService boundaries.'},
  ];
  expect(evaluateReadiness({sha:'fixture',complete:true,documents}).score).toBe(100);
});
```

- [ ] **Run red:** `pnpm exec vitest run src/domain/grading/release.test.ts`. Expected: missing export/module or failing assertion; fix harness errors before implementation.

- [ ] Seed clearly labeled deterministic demo reports at supported rubric scores, plus fixture-only visual states for browser QA. Never persist arbitrary preview scores as real v0.1 evaluation results.
- [ ] Document GitHub Contents read permission, bounded collector limits, manual trigger, rubric/evaluator version bump process, queue reconciliation, and meaning of 100. No deployment/harness/AI semantic quality claims. Document that rerunning uses a new run, not overwriting prior result.
- [ ] Run full verification and preserve output summary:

```sh
pnpm check
git diff --check
git status --short
```

- [ ] Confirm v0.1 checks against the spec, review tenant isolation for all new routes/actions, and manually inspect all saved UI states. Record any unavailable live GitHub/Resend credentials as untested deployment prerequisites, not passing tests. Do not deploy as part of planning.


- [ ] **Run green:** `pnpm exec vitest run src/domain/grading/release.test.ts`. Expected: all task cases pass. Run `pnpm typecheck` and fix integration signatures before continuing.
- [ ] **Commit only this task’s listed files**, including generated migration metadata when applicable: `git commit -m "docs: validate and document repository readiness grading"`. Stage paths explicitly; do not stage unrelated changes.

## Coverage review

Task 1 defines reproducible evidence scoring; Task 2 bounds and pins collection; Task 3 covers storage, versions, retries and immutable history; Task 4 covers authorization and all approved visual bands; Task 5 covers fixtures and operational validation. Future harness/deployment families are extension points, not hidden work in this release.
