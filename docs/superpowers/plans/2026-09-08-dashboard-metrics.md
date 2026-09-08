# Overview and Repository Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship real aggregate and per-repository dashboards with review-aware PR outcomes, recovered CI outcomes, date filtering, Free history access, and durable historical collection.

**Architecture:** Persist raw review and workflow-attempt evidence separately from existing advanced gate projections. A shared server-side history-access boundary feeds pure classifiers and date aggregation; both dashboards render that same output. Reuse durable import infrastructure for independent, checkpointed background history work.

**Tech Stack:** Next.js 16.3, React 19, TypeScript, PostgreSQL/Drizzle, Octokit, Inngest, Vitest; existing Fieldnote CSS.

**Spec:** `docs/superpowers/specs/2026-09-08-dashboard-metrics-design.md`

## Global Constraints

- Free access means the latest 100 PRs per repository by creation time, with a stable ID tie-breaker.
- It limits how far back the user can view, not what is collected.
- Import the latest 100 first, then backfill one year of PR activity in the background.
- Aggregate raw numerators and denominators across accessible repositories; never average repository percentages.
- Presets are rolling Last 7, 30, and 90 days, default 7, with a custom range.
- Use UTC calendar days initially and display the timezone.
- Evaluate PR outcomes as they stood at merge; preserve unknown when evidence is insufficient.
- CI: green first attempt; amber recovered after rerun; rust failed. Pending, cancelled, skipped, neutral, and unknown remain outside the denominator.
- No billing, issue collection, source checkout, CI/review configuration, or external interest notifications.
- Read repository AGENTS.md and relevant installed Next guides before application changes. Verify GitHub endpoint contracts using official documentation when implementing collectors; do not infer workflow outcomes from job totals.
- Keep real credentials out of Git, test fixtures, logs, issue bodies, and reports. Preserve pre-existing README.md and next-env.d.ts changes.

---

## Phase 0 — Save and hand off (documentation only)

- [x] Approve and save the design spec.
- [x] Preserve the interactive preview at `docs/superpowers/previews/2026-09-08-fieldnote-metrics.html`.
- [x] Save this phased plan and the execution prompt beside it.
- [x] Link GitHub issue #5 and publish the planning package on `codex/dashboard-metrics-design`.

Tracking issue: https://github.com/pierrederval/ai-metrics/issues/5

Onboarding PR #4 is merged. Start implementation from updated `origin/main`, then bring across only the planning commits from `codex/dashboard-metrics-design` if they are not already on main. Do not replay onboarding commits. The planning branch is not an instruction to deploy.

### Execution and ownership

Execute the phases in dependency order. Use one implementer per bounded task with spec-compliance and code-quality review before moving on. Only parallelize the pure classifier work and collection work after agreeing the Phase 1 types; they have different file ownership. The coordinator owns integration, tests, and issue progress. Do not create additional user-owned chats automatically.

Commit each passing task with the suggested message. Update this checklist and the issue with phase outcomes and material deviations. Do not merge or deploy without a subsequent request.

## File and interface map

New modules:
- `src/domain/dashboard/types.ts`: evidence, classification, range, and dashboard DTO contracts.
- `src/domain/dashboard/classify.ts`: pure PR and CI classifications.
- `src/domain/dashboard/range.ts`, `aggregate.ts`: UTC ranges and weighted daily summaries.
- `src/github/collect-reviews.ts`, `collect-workflow-attempts.ts`: paginated source evidence.
- `src/db/queries/dashboard-evidence.ts`: idempotent raw-evidence persistence and loading.
- `src/db/queries/history-access.ts`: the only visible-PR selection boundary.
- `src/db/queries/basic-dashboard.ts`: authorized evidence to aggregate DTO.
- `src/db/queries/history-backfill.ts`, `src/github/discover-history.ts`: durable cursor and bounded discovery.
- `src/inngest/functions/backfill-history.ts`: recoverable history worker.
- `src/components/dashboard/{date-range,kpi-cards,daily-charts,coverage-notice}.tsx`: shared presentation.
- `src/components/history/expand-history.tsx`, `src/app/history/actions.ts`: interest CTA.
- `src/app/repos/page.tsx`: connected repository directory.

Modify existing schema, PR sync, webhook handler, worker registration, dashboard/detail routes, sidebar, and scoped style rules. Keep advanced gate analysis and its types intact. Generate the next migration from the actual schema; do not guess its sequence after concurrent changes.

### Shared types (Phase 1)

```ts
export type CiOutcome = 'first-pass' | 'recovered' | 'failed' |
  'pending' | 'cancelled' | 'skipped' | 'neutral' | 'unknown';
export type PrOutcome = 'first-pass' | 'not-first-pass' | 'ineligible' | 'unknown';
export type Range = { start: string; endExclusive: string; days: number };
export type WorkflowAttempt = {
  repositoryId: string; runId: string; attempt: number; headSha: string;
  status: string; conclusion: string | null; startedAt: string | null;
  completedAt: string | null;
};
export type ReviewEvent = {
  id: string; reviewerId: string; state: string; commitSha: string | null;
  occurredAt: string; kind: 'review' | 'requested' | 'dismissed' | 'request-removed';
};
export type PrEvidence = {
  id: string; repositoryId: string; openedAt: string; mergedAt: string | null;
  mergeHeadSha: string | null; reviewExpected: boolean | null;
  ciExpected: boolean | null; chronologyComplete: boolean;
  reviewsComplete: boolean; ciComplete: boolean;
  reviews: ReviewEvent[]; attempts: WorkflowAttempt[];
};
export type Rate = { numerator: number; denominator: number; excluded: number;
  value: number | null };
export type Day = { date: string; merged: number; firstPass: Rate;
  ci: Record<CiOutcome, number>; coverage: 'complete' | 'partial' | 'unknown' };
export type DashboardData = {
  range: Range; days: Day[]; previousDays: Day[];
  visiblePrCount: number; coverage: 'complete' | 'partial' | 'unknown';
};
```

The implementation may add provenance fields but must update every consumer and test together. Coverage means evidence and date completeness, not merely a finished import run.

## Phase 1 — Evidence schema and history access

**Files:** create types and `history-access.ts`, `history-access.integration.test.ts`; modify `src/db/schema.ts`; generate migration and metadata; create migration integration test.

**Interfaces:** `visiblePrIds(repositoryIds: string[]): Promise<string[]>` returns at most 100 per repository, before date filtering. Callers supply repositories already authorized through existing access helpers. No public caller can pass a paid-plan flag. The future entitlement seam is server-owned; Free is the only active product entitlement in this release.

- [x] Write an integration fixture with 101 PRs in each of two repositories, including equal creation dates. Assert IDs 1–100 per repository survive and the oldest cannot be fetched through the new boundary. Keep all 202 persisted records.
- [x] Run `pnpm exec vitest run --config vitest.integration.config.ts src/db/history-access.integration.test.ts`; expect failure before implementation.
- [x] Add review events with source IDs, workflow attempts unique on `(repository_id, run_id, attempt)`, and evidence completeness/provenance. Reuse existing CI tables only if their unique keys preserve every attempt; otherwise introduce explicit evidence tables. Add interest rows unique on `(user_id, feature)` and backfill runs/items with persisted cutoff, cursor, status, retry time, and error category.
- [x] Implement ranking before filtering using the SQL shape below. Apply dates only after ranked visibility is resolved. Wire direct PR-page authorization through the same boundary so stored hidden PRs cannot leak.

```sql
WITH ranked AS (
 SELECT id, repository_id,
 row_number() OVER (PARTITION BY repository_id ORDER BY opened_at DESC, id DESC) AS rank
 FROM pull_requests WHERE repository_id = ANY($1)
)
SELECT id FROM ranked WHERE rank <= 100;
```

- [x] Run migration and access tests; verify the existing onboarding integration suite still passes. Commit `feat: persist dashboard evidence and enforce free history access`.

## Phase 2 — Pure outcome classification

**Files:** create `classify.ts`, `classify.test.ts` under `src/domain/dashboard`.

**Interfaces:** `classifyWorkflow(attempts: WorkflowAttempt[], asOf: string): CiOutcome`; `classifyMergedPr(evidence: PrEvidence): PrOutcome`. No database or GitHub calls.

- [x] Write table-driven cases for first success, failure then successful rerun, repeated failure, later pending rerun, cancelled/skipped/neutral, missing attempt 1, and attempts after cutoff.

```ts
const attempt = (n: number, conclusion: string): WorkflowAttempt => ({
 repositoryId:'r', runId:'w', attempt:n, headSha:'s', status:'completed',
 conclusion, startedAt:`2026-09-01T0${n}:00:00Z`,
 completedAt:`2026-09-01T0${n}:10:00Z`,
});
expect(classifyWorkflow([attempt(1,'failure'),attempt(2,'success')],
 '2026-09-02T00:00:00Z')).toBe('recovered');
```

- [x] Add PR fixtures: review-only approval; CI-only first success; both pass; changes requested followed by approval; ordinary comments; dismissed approval; neither; missing chronology; post-merge success; earlier failed revision. Use complete evidence only where the fixture explicitly establishes it.
- [x] Run `pnpm exec vitest run src/domain/dashboard/classify.test.ts`; verify red.
- [x] Filter source events at merge/as-of first; resolve reviews by reviewer and dismissal events; require valid approval and no unresolved Changes requested when review applies. Missing historical request/dismissal knowledge remains unknown. Determine CI outcome from workflow attempt conclusions, never job counts. Unknown attempt history cannot establish first-pass. Keep merge-head identity distinct from the merge commit SHA.
- [x] Run tests to green; commit `feat: classify review and workflow outcomes from historical evidence`.

## Phase 3 — Collect real review and attempt history

**Files:** new collectors and their unit tests; `dashboard-evidence.ts` plus integration test; modify `sync-pull-request.ts`, `handle-event.ts`, and GitHub setup docs.

**Interfaces:** `collectReviews(client: Octokit, owner: string, repo: string, number: number): Promise<{ events: ReviewEvent[]; complete: boolean; issues: string[] }>`; `collectWorkflowAttempts(client: Octokit, repositoryId: string, owner: string, repo: string, shas: string[]): Promise<{ attempts: WorkflowAttempt[]; complete: boolean; issues: string[] }>`; `persistDashboardEvidence(evidence: PrEvidence): Promise<void>`.

- [x] Mock multiple review pages, dismissed reviews, review requests, run_attempt > 1, unavailable attempts, and duplicate workflows shared across SHAs. Assert source timestamps survive normalization and missing histories set `complete: false`.
- [x] Run collector tests before implementation and confirm red.
- [x] Use paginated reviews plus available timeline/webhook evidence for request and dismissal transitions. Use workflow-run attempt endpoints for attempt-level status and timestamps. Validate current Octokit signatures against installed types and official GitHub docs. Persist source identities idempotently; do not overwrite a richer history with an incomplete response.
- [x] Integrate collection into PR hydration while retaining existing advanced check collection. Track independent completeness dimensions; unavailable review evidence must not discard known CI evidence. Retry transient and rate-limit failures; record 404/410 historical unavailability as incomplete evidence. Never turn a 403 into “no CI”.
- [x] Route review submissions/dismissals/requests and workflow updates to PR hydration with the existing tracking guard. Document additional event subscriptions; preserve read-only permissions and report any newly necessary permission before changing the GitHub App.
- [x] Test a duplicate hydration produces identical row counts and results; run `pnpm test` and affected integration tests. Commit `feat: collect review and workflow attempt evidence`.

## Phase 4 — One-year backfill without slowing first import

**Files:** new history query/worker/discovery modules and tests; modify `sync-repository.ts` worker completion, `src/inngest/events.ts`, `src/app/api/inngest/route.ts`, and reconciler registration.

**Interfaces:** `discoverHistoryPage(repositoryId: string, cutoff: string, page: number): Promise<{ numbers: number[]; nextPage: number | null }>`; `ensureHistoryBackfill(repositoryId: string): Promise<string>` returns a stable active run ID; worker event `{ repositoryId: string; backfillId: string }`.

- [x] Test a PR created two years ago but updated/merged within the cutoff is included. Test descending update pagination stops after cutoff, duplicate pages do not duplicate work, and suspended repositories cannot collect.
- [x] Run the new unit/integration tests to red.
- [x] Discover with paginated repository pulls sorted by updated descending, all states, avoiding capped search results. Persist one calendar-year cutoff at run creation. Save discovered items and cursor transactionally before dispatch; enqueue follow-on work by stable IDs. A changed source list may repeat records, so deduplicate and perform a final reconciliation sweep.
- [x] Start backfill after initial import completion and expose its own progress. Reuse PR hydration as a child operation. Persist retry times for rate limits and recover undispatched work with a reconciler. Bound concurrency per installation and let fresh activity/initial imports run ahead of background work. Recheck access/tracking for every page and hydration.
- [x] Verify restart resumes pending items, successful work is not repeated unnecessarily, initial import success survives backfill failure, and older records remain stored but hidden through Phase 1 access. Commit `feat: backfill one year of repository history durably`.

## Phase 5 — Shared range and aggregate queries

**Files:** new `range.ts`, `aggregate.ts` and unit tests; `basic-dashboard.ts` and integration test; modify legacy dashboard query callers only where they feed basic dashboards.

**Interfaces:** `resolveRange(input: { days?: number; from?: string; to?: string }, now: Date): Range`; `aggregateDays(evidence: PrEvidence[], range: Range): Day[]`; `loadBasicDashboard(repositoryIds: string[], range: Range): Promise<DashboardData>`.

- [x] Write date and empty-day tests before implementation:

```ts
const r=resolveRange({days:30},new Date('2026-09-08T12:00:00Z'));
expect(r).toEqual({start:'2026-08-10T00:00:00.000Z',
 endExclusive:'2026-09-09T00:00:00.000Z',days:30});
expect(aggregateDays([],r)).toHaveLength(30);
```

- [x] Test 7 and 90 positions, leap days, invalid custom dates, weighted percentages (1/1 plus 0/9 is 10%, not 50%), duplicate workflow linkage, null denominators, merge cutoff, and equal preceding period.
- [x] Run unit tests and confirm red. Implement UTC date iteration and counts by mergedAt; classify workflows as of endExclusive, bucket each by its latest terminal completion timestamp, and separately count non-denominator states. For a latest pending rerun use pending rather than the earlier successful result.
- [x] Resolve visible PR IDs before loading evidence for both periods. Derive coverage from import progress, evidence completeness, and hidden/undiscovered history. Never claim date-complete coverage solely from the oldest imported PR's creation date. Suppress comparisons that cannot be supported.
- [x] Verify each visible period total equals its daily numerators and denominators. Test an older PR cannot reappear via custom dates, aggregate joins, or direct records. Commit `feat: aggregate authorized dashboard metrics by UTC date`.

## Phase 6 — Three real pages and approved charts

**Files:** shared dashboard components and tests; modify `src/app/dashboard/page.tsx`, `src/app/repos/[repoId]/page.tsx`, `src/components/sidebar.tsx`, `src/app/style.css`; create `src/app/repos/page.tsx` and route tests.

**Interfaces:** presentation consumes `DashboardData`; date-range component changes validated URL search parameters; daily-charts renders `Day[]`. Repository list consumes currently authorized tracked repositories and sync/evidence metadata. No browser-side entitlement filtering.

- [x] Write route/rendering tests for dedicated repository navigation, repository scope, retained range, three KPI cards, and actual chart-position counts:

```ts
expect(days).toHaveLength(30);
// Render DailyCharts with these days; assert each metric exposes 30 dated positions.
// A missing denominator must render a labelled gap, not a full rust failure bar.
```

- [x] Run route/component tests to red. Reuse Fieldnote shell/style tokens and implement URL range controls. Show UTC and partial-today labels. Render real metric numerators, denominator exclusions, comparison deltas, and coverage notices.
- [x] Implement full-height percent stacks: CI first-pass/recovered/failed; first-pass PR green/not-first-pass with a distinct local legend. Count bars use a count axis. Render all 7/30/90 daily positions with adaptive date ticks, responsive sizing, and keyboard/touch details. Unknown/empty days stay gaps. Honour reduced motion and preserve focus through navigation.
- [x] Replace the repository anchor with `/repos`; selected navigation reflects the page. Link actual GitHub URLs and expose last successful fetch versus a failed last attempt. Advisory state must say “detected”, not assert absent configuration. Preserve advanced gate detail separately from the basic KPIs.
- [x] Test Overview totals equal combined repository totals, both pages enforce the same Free window, and no mock data appears in live mode. Commit `feat: add overview and repository evidence dashboards`.

## Phase 7 — Expand-history interest flow

**Files:** new CTA component/action/tests; modify coverage notice and schema query implementation for Phase 1 interest table.

**Interface:** `registerHistoryInterest(): Promise<{ status: 'registered' }>` authenticates internally and upserts `(userId, 'expanded-history')`; accepts no client-supplied user ID or entitlement.

- [x] Write action tests for signed-out rejection, duplicate submission, and persistence failure. Verify failure never displays success and success never grants expanded access.
- [x] Run tests to red; implement idempotent insert and server action, then accessible coming-soon dialog with pending, success, retry, Escape, focus return, and explicit close controls. Do not send email or create billing records.
- [x] Test reopening the panel reflects registered state and hidden PRs remain inaccessible. Commit `feat: register interest in expanded repository history`.

## Phase 8 — Verification and release handoff

**Files:** `docs/validation-dashboard-metrics.md`, `docs/github-app.md`, `docs/architecture.md`, README sections directly affected.

- [x] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:integration`. Run production build with valid production-shaped non-secret test configuration; never print real local secrets. Do not blindly change local live configuration for build validation.
- [x] Browser-check 1024px and 390px layouts, date controls and complete bar counts, repository navigation, tooltips/keyboard/touch, Free notices, denied access, pending/partial/empty states, and interest error recovery. Verify screenshot colours against the approved preview. Prototype sample numbers are not expected live values.
- [x] Live-smoke GitHub import on an authorized repository, verify attempt and review source identities, and disclose historical limitations. Do not bypass unknown outcomes to make cards look populated.
- [ ] Get final independent spec and code review; resolve findings and rerun only affected checks. Document migration order, worker/event registration, backfill operations, required GitHub subscriptions, observed validation and remaining limitations.
- [ ] Open an implementation PR linked to the tracking issue with before/after screenshots and verification. Keep local secrets and unrelated changes out. Leave merge/deploy to the user.

## Self-review

Coverage: navigation/layout → Phase 6; review/CI semantics → Phases 2–3; retained one-year history → Phase 4; Free access → Phases 1 and 5; date/weighted charts → Phases 5–6; interest CTA → Phase 7; migration, operational and browser validation → Phase 8. Raw evidence, access selection, aggregation, and presentation each have separate ownership. All shared signatures are defined above. Endpoint fidelity and incomplete historical knowledge are verification responsibilities, not permission to invent data.
