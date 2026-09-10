# Repository Page Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single repository page with a persistent header and five tab routes, led by an Agents view whose delivery numbers are attributable to the agent that produced them.

**Architecture:** A nested layout at `src/app/repos/[repoId]/layout.tsx` owns the breadcrumb, identity, facts line, actions, coverage strip and tab bar; five sibling routes render beneath it. Before any layout work, per-pull-request attribution is derived from the evidence `detectExecuted` already walks and written to the long-dormant `pull_requests.agent_provider` column, which unlocks the cohort table that gives the Agents view its balance.

**Tech Stack:** Next.js 16.3.4 (App Router, React 19.2), Drizzle ORM + Postgres, Vitest (unit + integration), TypeScript 6, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-10-repository-page-architecture-design.md`
**Approved presentation:** `docs/superpowers/previews/2026-09-10-repository-page-architecture.html` (illustrative; its figures are seeded or invented)

## Global Constraints

- **Do not change the rubric, its checks, or its point granularity.** Growing the rubric "is a rubric change with its own version bump and its own comparability consequences, so it is out of scope here and must not be smuggled into this work."
- **Bronze and Gold are explicitly parked by decision, not overlooked.** "the card renders correctly for all six finishes and only four occur. Fixtures and visual checks must cover all six regardless."
- **Do not change any metric definition.** "Metrics get sliced by cohort, not redefined."
- **Do not change detection itself.** Out of scope. Task 1 extracts an existing traversal without altering its rules; the existing `detect-executed.test.ts` suite passing unchanged is the proof.
- **Nothing on the page today is deleted.** "Every section has a destination." The `Advanced gate analysis` accordion is removed because its children move, not because its content goes.
- **Each route loads only what it renders.** `page.tsx` today issues seven queries for one view. "This is the riskiest part of the work."
- **Pull requests with no agent evidence** are "reported as their own figure and never implied to be human" — labelled unattributed, "never folded into a total."
- **Read `AGENTS.md` and the installed guides in `node_modules/next/dist/docs/` before writing app code.** This is not the Next.js in your training data.

## Decisions taken before implementation

These are recorded so a reviewer does not read them as drift.

1. **`Level 1 · Foundations` comes off the card.** The spec (lines 106–109) left this open and required it be decided first. Decided: remove. There is no Level 2 in the product, so the line implies a progression that does not exist. **The preview still shows this line — the implementation deliberately diverges from the preview here.** `src/components/grading/report.tsx:137` has an unrelated `Foundations / Evidence` eyebrow; leave it alone.

2. **`agent_provider` holds one cohort per pull request, not a set.** The spec calls for "writing that agent set back onto the pull request, which is the `agent_provider` column". That column is `text NOT NULL DEFAULT 'unknown'` — a scalar — and the spec requires "the existing metric aggregation groups by it". A cohort table must *partition* the pull requests, or the per-cohort counts stop reconciling with the total. So a multi-agent pull request resolves to one primary agent by a deterministic rule (Task 1), and the full evidence set remains available where it always was, in `repo_ai_detections`.

3. **The existing `'unknown'` default is the unattributed cohort.** No migration and no new column: rows already default to `'unknown'`, and the read layer labels that cohort `Unattributed`. This is why the column being "present and unwritten since the first migration" is usable as-is.

4. **The next-tier block lists every failing check**, sorted by points descending, while its header names the next *reachable* tier. Reachable, not merely the next threshold: with five 20-point checks, a repository at 80 cannot land on 90, so the header reads `Prismatic at 100` — which is exactly what the preview shows at line 785.

5. **Flavour-line copy comes from the spec's table (lines 83–90) verbatim**, not from the preview. The preview's Silver line inserts "this repository"; the spec is the approved copy.

6. **Tabs are links, not buttons.** The preview uses `<button role="tab">` because it is a static mock with client-side switching. The spec requires "Selection is expressed by route, not by client state" and that every view be "linkable, bookmarkable and individually loadable". Tabs render as `next/link` anchors carrying `role="tab"`.

---

## Framework facts that constrain this work

Verified in `node_modules/next/dist/docs/` at 16.3.4. Do not design around remembered Next.js behaviour.

- **`params` is a Promise in layouts and pages** and must be awaited (`01-app/03-api-reference/03-file-conventions/layout.md:60-88`). The existing code already does this.
- **Layouts cannot read `searchParams`** — "Layouts do not rerender on navigation, so they cannot access search params which would otherwise become stale" (`layout.md:178-182`). This is why the date range *cannot* live in the header, independent of the spec's own argument that it misleads there. Only Delivery and Agents read it, from their `page.tsx`.
- **`useSelectedLayoutSegment()`** is how a client component in the layout knows which tab is active (`01-app/03-api-reference/04-functions/use-selected-layout-segment.md`).
- The repo types route props explicitly (`{ params: Promise<{ repoId: string }> } & RangePageProps`) rather than using the global `PageProps`/`LayoutProps` helpers. **Match the repo, not the docs.**
- Every existing route sets `export const dynamic = 'force-dynamic'`. Every new route must too.

---

## File structure

**Domain (pure, unit-tested)**
- Create `src/domain/ai-involvement/attribute.ts` — derives `prId -> AgentId` from the same evidence walk `detectExecuted` uses.
- Modify `src/domain/ai-involvement/detect-executed.ts` — extract the evidence walk into a shared `collectHits`; `detectExecuted` keeps its exact behaviour.
- Create `src/domain/grading/next-tier.ts` — moves, target score, target tier, all arithmetic from `CheckResult[]`.
- Create `src/domain/grading/flavour.ts` — score to flavour line.
- Create `src/domain/cohorts/types.ts` — `CohortRow`, `CohortTable`.

**Data**
- Modify `src/db/queries/ai-involvement.ts` — write attribution inside the existing `recomputeExecutedDetections` transaction.
- Create `src/db/queries/cohorts.ts` — `loadCohorts(repositoryId, range)`, grouped by `agent_provider`, respecting `visiblePrIds`.
- Create `src/db/queries/repository-header.ts` — the layout's single header load.

**Components**
- Create `src/components/repository/tab-bar.tsx` (client) + `tab-bar.css`
- Create `src/components/repository/header.tsx` + `header.css`
- Create `src/components/repository/coverage-strip.tsx` + `coverage-strip.css`
- Create `src/components/cohorts/cohort-table.tsx` + `cohort-table.css`
- Create `src/components/agents/agent-share.tsx`
- Modify `src/components/grading/grade-card.tsx`, `grade-card.css`
- Create `src/components/grading/grade-banner.tsx` — the phone-width compact banner

**Routes**
- Create `src/app/repos/[repoId]/layout.tsx`
- Rewrite `src/app/repos/[repoId]/page.tsx` as the Agents view
- Create `src/app/repos/[repoId]/delivery/page.tsx`
- Create `src/app/repos/[repoId]/settings/page.tsx`
- `grading/` and `ai-involvement/` move unchanged (they gain the layout for free)

---

## Task 1: Derive per-pull-request attribution

Pure domain work. No database, no UI.

**Files:**
- Modify: `src/domain/ai-involvement/detect-executed.ts`
- Create: `src/domain/ai-involvement/attribute.ts`
- Test: `src/domain/ai-involvement/attribute.test.ts`

**Interfaces:**
- Consumes: `ExecutedInput`, `AgentId` from `./detect-executed` and `./types`.
- Produces:
  - `export function collectHits(input: ExecutedInput): AgentHits` (moved out of `detectExecuted`, exported from `detect-executed.ts`)
  - `export const UNATTRIBUTED = 'unknown'` in `attribute.ts`
  - `export type Attribution = AgentId | typeof UNATTRIBUTED`
  - `export function attributePullRequests(input: ExecutedInput): Map<string, Attribution>` — every pull request id in `input.pullRequests` is a key; ids with no evidence map to `UNATTRIBUTED`.

**The rule to implement.** For each pull request, collect the agents with any evidence on it. Rank by number of distinct evidence *sources* on that pull request, descending; break ties alphabetically by `AgentId`. Take the top. No evidence at all gives `UNATTRIBUTED`. Determinism matters: the same input must always produce the same column value, or a recompute churns rows.

- [ ] **Step 1: Extract the evidence walk without changing it**

In `detect-executed.ts`, lift lines 81–121 (the `hits` construction: the pull-request loop, checks, commits, reviews) into an exported function, and have `detectExecuted` call it. Export the `AgentHits` type too.

```typescript
export type { AgentHits };

/** The evidence walk shared by detectExecuted and attributePullRequests. */
export function collectHits(input: ExecutedInput): AgentHits {
  const prIds = new Set(input.pullRequests.map((row) => row.id));
  const checks = input.checks.filter((row) => prIds.has(row.pullRequestId));
  const commits = input.commits.filter((row) => prIds.has(row.pullRequestId));
  const reviews = input.reviews.filter((row) => prIds.has(row.pullRequestId));
  const hits: AgentHits = new Map();
  // ... the four existing loops verbatim, unchanged ...
  return hits;
}

export function detectExecuted(input: ExecutedInput): Detection[] {
  const hits = collectHits(input);
  // ... the existing detections mapping from line 123 onward, unchanged ...
}
```

- [ ] **Step 2: Prove the extraction changed nothing**

Run: `pnpm vitest run src/domain/ai-involvement/detect-executed.test.ts`
Expected: PASS, same test count as before the edit. If a single assertion moves, the extraction was not faithful — revert and redo it. This suite is the only guard against violating the "no change to detection" constraint.

- [ ] **Step 3: Write the failing test**

Create `src/domain/ai-involvement/attribute.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { attributePullRequests, UNATTRIBUTED } from './attribute';
import type { ExecutedInput } from './detect-executed';

const pr = (id: string, authorLogin = 'someone', headRef: string | null = null) => ({
  id,
  authorLogin,
  headRef,
  markers: [],
  occurredAt: '2026-01-01T00:00:00.000Z',
});

const input = (over: Partial<ExecutedInput>): ExecutedInput => ({
  pullRequests: [],
  checks: [],
  commits: [],
  reviews: [],
  ...over,
});

describe('attributePullRequests', () => {
  it('attributes a pull request by its branch prefix', () => {
    const result = attributePullRequests(
      input({ pullRequests: [pr('pr-1', 'someone', 'codex/add-thing')] }),
    );
    expect(result.get('pr-1')).toBe('codex');
  });

  it('reports a pull request with no evidence as unattributed', () => {
    const result = attributePullRequests(input({ pullRequests: [pr('pr-1')] }));
    expect(result.get('pr-1')).toBe(UNATTRIBUTED);
  });

  it('includes every pull request as a key', () => {
    const result = attributePullRequests(
      input({ pullRequests: [pr('pr-1', 'someone', 'codex/x'), pr('pr-2')] }),
    );
    expect([...result.keys()].sort()).toEqual(['pr-1', 'pr-2']);
  });

  it('prefers the agent with more distinct evidence sources', () => {
    // claude-code has branch-prefix only; codex has pr-author AND commit-author.
    const result = attributePullRequests(
      input({
        pullRequests: [pr('pr-1', 'chatgpt-codex-connector', 'claude/refactor')],
        commits: [
          {
            pullRequestId: 'pr-1',
            authorLogin: 'chatgpt-codex-connector',
            occurredAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(result.get('pr-1')).toBe('codex');
  });

  it('breaks a tie alphabetically so recomputes are stable', () => {
    const result = attributePullRequests(
      input({ pullRequests: [pr('pr-1', 'someone', 'claude/x')] }),
    );
    const again = attributePullRequests(
      input({ pullRequests: [pr('pr-1', 'someone', 'claude/x')] }),
    );
    expect(result.get('pr-1')).toBe(again.get('pr-1'));
  });
});
```

Before running, confirm the bot logins and branch prefixes used above actually exist in `src/domain/ai-involvement/catalogue.ts`. If `chatgpt-codex-connector` or the `claude/` prefix is not there, substitute real catalogue values — do not edit the catalogue to suit the test.

- [ ] **Step 4: Run it and watch it fail**

Run: `pnpm vitest run src/domain/ai-involvement/attribute.test.ts`
Expected: FAIL — cannot resolve `./attribute`.

- [ ] **Step 5: Implement**

```typescript
import { collectHits, type ExecutedInput } from './detect-executed';
import type { AgentId } from './types';

/** Matches the pull_requests.agent_provider default that has shipped since 0000. */
export const UNATTRIBUTED = 'unknown';

export type Attribution = AgentId | typeof UNATTRIBUTED;

export function attributePullRequests(input: ExecutedInput): Map<string, Attribution> {
  // Every stored pull request gets a key, so a row that lost its evidence is
  // rewritten to UNATTRIBUTED rather than keeping a stale agent.
  const result = new Map<string, Attribution>(
    input.pullRequests.map((row) => [row.id, UNATTRIBUTED as Attribution]),
  );

  // prId -> agent -> count of distinct evidence sources naming that agent.
  const perPr = new Map<string, Map<AgentId, number>>();
  for (const [agent, bySource] of collectHits(input)) {
    for (const [, byValue] of bySource) {
      const prIds = new Set<string>();
      for (const [, hit] of byValue) for (const prId of hit.prIds) prIds.add(prId);
      for (const prId of prIds) {
        const counts = perPr.get(prId) ?? new Map<AgentId, number>();
        counts.set(agent, (counts.get(agent) ?? 0) + 1);
        perPr.set(prId, counts);
      }
    }
  }

  for (const [prId, counts] of perPr) {
    if (!result.has(prId)) continue; // defensive: hits are already pr-id filtered
    const [top] = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    if (top) result.set(prId, top[0]);
  }

  return result;
}
```

- [ ] **Step 6: Run both suites**

Run: `pnpm vitest run src/domain/ai-involvement/`
Expected: PASS, all files.

- [ ] **Step 7: Commit**

```bash
git add src/domain/ai-involvement/
git commit -m "feat: derive per-pull-request agent attribution"
```

---

## Task 2: Persist attribution to `agent_provider`

**Files:**
- Modify: `src/db/queries/ai-involvement.ts:92-131` (`recomputeExecutedDetections`)
- Test: `src/db/queries/ai-involvement.integration.test.ts` (create if absent; follow the shape of `src/db/queries/repository-records.integration.test.ts`)

**Interfaces:**
- Consumes: `attributePullRequests`, `UNATTRIBUTED` from Task 1.
- Produces: no new export. `recomputeExecutedDetections(repositoryId)` now also writes `pull_requests.agent_provider`.

**Why here.** `recomputeExecutedDetections` already reads exactly the rows attribution needs, inside a transaction that already takes the repository advisory lock. Its four callers — `sync-pull-request.ts:48`, `backfill-history.ts:40`, `sync-repository.ts:71`, `scripts/seed.ts:85` — then keep attribution current for free. Writing it anywhere else means a second read of the same rows and a second lock.

- [ ] **Step 1: Write the failing integration test**

```typescript
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../index';
import * as s from '../schema';
import { recomputeExecutedDetections } from './ai-involvement';
// Reuse whatever fixture helper the existing integration tests use to make a
// repository and pull requests; do not hand-roll inserts if a helper exists.

describe('recomputeExecutedDetections attribution', () => {
  it('writes the derived agent onto each pull request', async () => {
    const { repositoryId } = await seedRepositoryWithPullRequests([
      { githubPrNumber: 1, authorLogin: 'someone', headRef: 'codex/add-thing' },
      { githubPrNumber: 2, authorLogin: 'someone', headRef: 'feature/manual' },
    ]);

    await recomputeExecutedDetections(repositoryId);

    const rows = await db()
      .select({ number: s.pullRequests.githubPrNumber, agent: s.pullRequests.agentProvider })
      .from(s.pullRequests)
      .where(eq(s.pullRequests.repositoryId, repositoryId));

    const byNumber = new Map(rows.map((r) => [r.number, r.agent]));
    expect(byNumber.get(1)).toBe('codex');
    expect(byNumber.get(2)).toBe('unknown');
  });

  it('clears attribution when the evidence disappears', async () => {
    const { repositoryId, prIds } = await seedRepositoryWithPullRequests([
      { githubPrNumber: 1, authorLogin: 'someone', headRef: 'codex/add-thing' },
    ]);
    await recomputeExecutedDetections(repositoryId);

    await db()
      .update(s.pullRequests)
      .set({ headRef: 'feature/manual' })
      .where(eq(s.pullRequests.id, prIds[0]));
    await recomputeExecutedDetections(repositoryId);

    const [row] = await db()
      .select({ agent: s.pullRequests.agentProvider })
      .from(s.pullRequests)
      .where(eq(s.pullRequests.id, prIds[0]));
    expect(row.agent).toBe('unknown');
  });
});
```

Read a neighbouring `*.integration.test.ts` first and copy its setup and teardown exactly. Write `seedRepositoryWithPullRequests` against the existing helpers.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --config vitest.integration.config.ts src/db/queries/ai-involvement.integration.test.ts`
Expected: FAIL — every `agent_provider` still reads `'unknown'`, so the first assertion fails on pull request 1.

- [ ] **Step 3: Implement**

In `recomputeExecutedDetections`, read the rows once and use them for both purposes:

```typescript
const rows = await readRows(tx, repositoryId);
const detections = detectExecuted(rows);
const attribution = attributePullRequests(rows);
```

Then, after the detections are written and before the `repo_detection_state` upsert, write the attribution. Group the ids by agent so this is one statement per distinct agent — typically two or three — rather than one per pull request:

```typescript
const byAgent = new Map<string, string[]>();
for (const [prId, agent] of attribution) {
  byAgent.set(agent, [...(byAgent.get(agent) ?? []), prId]);
}
for (const [agent, prIds] of byAgent) {
  await tx
    .update(s.pullRequests)
    .set({ agentProvider: agent })
    .where(and(eq(s.pullRequests.repositoryId, repositoryId), inArray(s.pullRequests.id, prIds)));
}
```

Add `inArray` to the `drizzle-orm` import on line 1. The `repositoryId` predicate is redundant given the id list but keeps the statement scoped to the locked repository.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run --config vitest.integration.config.ts src/db/queries/ai-involvement.integration.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Confirm the demo seed attributes something**

Run: `pnpm db:seed` then query:
```bash
psql "$DATABASE_URL" -c "select agent_provider, count(*) from pull_requests where repository_id='demo-repository' group by 1 order by 2 desc;"
```
Expected: more than one row. If every row is `unknown`, the seeded demo data carries no agent evidence and the cohort table in Task 4 will have nothing to show — stop and report that before building the table.

- [ ] **Step 6: Commit**

```bash
git add src/db/queries/ai-involvement.ts src/db/queries/ai-involvement.integration.test.ts
git commit -m "feat: write per-pull-request attribution to agent_provider"
```

---

## Task 3: Cohort aggregation query

**Files:**
- Create: `src/domain/cohorts/types.ts`
- Create: `src/db/queries/cohorts.ts`
- Test: `src/db/queries/cohorts.integration.test.ts`

**Interfaces:**
- Consumes: `UNATTRIBUTED` (Task 1), `aggregate` from `src/metrics/aggregate.ts`, `visiblePrIds` from `src/db/queries/history-access.ts`, `Range` from `src/domain/dashboard/types`.
- Produces:
```typescript
export interface CohortRow {
  agent: string;            // AgentId or 'unknown'
  label: string;            // catalogue label, or 'Unattributed'
  attributed: boolean;      // false only for the unattributed cohort
  pullRequestCount: number;
  firstPass: { value: number | null; known: number; unknown: number };
  averageAttempts: number | null;
  clean: { value: number | null; known: number; unknown: number };
}
export interface CohortTable {
  rows: CohortRow[];        // attributed cohorts by count desc, unattributed always last
  totalPullRequests: number;
  attributedPullRequests: number;
}
export async function loadCohorts(repositoryId: string, range: Range): Promise<CohortTable>;
```

**Two things that are easy to get wrong.**

- **Reuse `aggregate()` per cohort. Do not write new metric maths.** "Metrics get sliced by cohort, not redefined." Partition the `PrMetrics` rows by `agent_provider`, then call the existing `aggregate` on each partition. `firstPass`, `averageAttempts` and `clean` come straight off its result.
- **Respect `visiblePrIds`.** This is a metric listing, not a repository-level fact, so the Free-plan visibility limit applies exactly as it does in `loadBasicDashboard`. Contrast `loadDetections`, which deliberately ignores it — see the comment at `src/db/queries/ai-involvement.ts:10-13`. Getting this backwards leaks metrics past the plan limit.
- `totalPullRequests` is the count across all cohorts including unattributed; `attributedPullRequests` excludes it. The unattributed row is never summed into a cohort total.

- [ ] **Step 1: Write the failing integration test**

```typescript
import { describe, expect, it } from 'vitest';
import { loadCohorts } from './cohorts';

describe('loadCohorts', () => {
  it('groups metrics by attributed agent', async () => {
    const { repositoryId, range } = await seedRepositoryWithMetrics([
      { agentProvider: 'codex', firstPassGreen: true },
      { agentProvider: 'codex', firstPassGreen: false },
      { agentProvider: 'claude-code', firstPassGreen: true },
      { agentProvider: 'unknown', firstPassGreen: true },
    ]);

    const table = await loadCohorts(repositoryId, range);

    expect(table.totalPullRequests).toBe(4);
    expect(table.attributedPullRequests).toBe(3);
    const codex = table.rows.find((r) => r.agent === 'codex');
    expect(codex?.pullRequestCount).toBe(2);
    expect(codex?.firstPass.value).toBe(50);
  });

  it('puts the unattributed cohort last and marks it unattributed', async () => {
    const { repositoryId, range } = await seedRepositoryWithMetrics([
      { agentProvider: 'unknown', firstPassGreen: true },
      { agentProvider: 'unknown', firstPassGreen: true },
      { agentProvider: 'codex', firstPassGreen: true },
    ]);

    const table = await loadCohorts(repositoryId, range);

    const last = table.rows[table.rows.length - 1];
    expect(last.agent).toBe('unknown');
    expect(last.label).toBe('Unattributed');
    expect(last.attributed).toBe(false);
  });

  it('returns no rows for a repository with no visible pull requests', async () => {
    const { repositoryId, range } = await seedRepositoryWithMetrics([]);
    const table = await loadCohorts(repositoryId, range);
    expect(table.rows).toEqual([]);
    expect(table.totalPullRequests).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --config vitest.integration.config.ts src/db/queries/cohorts.integration.test.ts`
Expected: FAIL — cannot resolve `./cohorts`.

- [ ] **Step 3: Implement**

Select `agentProvider` alongside the stored `prMetrics` rows for the visible pull requests in range, partition into a `Map<string, PrMetrics[]>`, call `aggregate` per partition, and map each result to a `CohortRow`. Take the label from `catalogue.find((e) => e.agent === agent)?.label`, falling back to `'Unattributed'` for `UNATTRIBUTED` and to the raw agent id for a catalogue entry that has since been removed — the same stale-agent tolerance `detectExecuted` shows at `detect-executed.ts:126-134`. Sort attributed rows by `pullRequestCount` descending then `agent` ascending, and append the unattributed row last if it has any pull requests.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run --config vitest.integration.config.ts src/db/queries/cohorts.integration.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/cohorts/ src/db/queries/cohorts.ts src/db/queries/cohorts.integration.test.ts
git commit -m "feat: aggregate delivery metrics by agent cohort"
```

---

## Task 4: Cohort table and agent share components

**Files:**
- Create: `src/components/cohorts/cohort-table.tsx`, `src/components/cohorts/cohort-table.css`
- Create: `src/components/agents/agent-share.tsx`
- Test: `src/components/cohorts/cohort-table.test.ts`

**Interfaces:**
- Consumes: `CohortTable`, `CohortRow` (Task 3).
- Produces:
  - `export function CohortTable({ table }: { table: CohortTable })`
  - `export function AgentShare({ attributed, total }: { attributed: number; total: number })`

Columns, from the spec: pull-request count, first-pass green rate, attempts to green, clean green. The unattributed row renders with the `.agentcell.human` treatment from the preview and is labelled `Unattributed` — never `Human`. `AgentShare` "states how many pull requests carry agent evidence against the total", and reports the remainder as its own figure without implying it is human.

Render `null` values as the product's existing unknown treatment rather than `0` or `—` invented here; copy whatever `MetricCards` in `src/components/metrics.tsx` already does for an unknown percentage.

- [ ] **Step 1: Write the failing test**

Test the pure parts: cohort ordering is already covered in Task 3, so assert here that a `null` first-pass renders as unknown rather than zero, and that the unattributed row is never labelled human.

```typescript
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CohortTable } from './cohort-table';

const row = (over = {}) => ({
  agent: 'codex',
  label: 'Codex',
  attributed: true,
  pullRequestCount: 2,
  firstPass: { value: null, known: 0, unknown: 2 },
  averageAttempts: null,
  clean: { value: null, known: 0, unknown: 2 },
  ...over,
});

describe('CohortTable', () => {
  it('renders an unknown first-pass rate as unknown, not zero', () => {
    const html = renderToStaticMarkup(
      <CohortTable table={{ rows: [row()], totalPullRequests: 2, attributedPullRequests: 2 }} />,
    );
    expect(html).not.toMatch(/>0%/);
  });

  it('never labels the unattributed cohort as human', () => {
    const html = renderToStaticMarkup(
      <CohortTable
        table={{
          rows: [row({ agent: 'unknown', label: 'Unattributed', attributed: false })],
          totalPullRequests: 2,
          attributedPullRequests: 0,
        }}
      />,
    );
    expect(html).toContain('Unattributed');
    expect(html).not.toMatch(/human/i);
  });
});
```

Check whether the repo already renders components in tests this way. If `renderToStaticMarkup` appears nowhere and there is no jsdom setup, drop to asserting on an exported pure formatting helper instead of adding a rendering dependency — do not add a test library to this repo as a side effect of this task.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/components/cohorts/cohort-table.test.ts`
Expected: FAIL — cannot resolve `./cohort-table`.

- [ ] **Step 3: Implement both components and the stylesheet**

Take the visual treatment from the preview's `.cohort`, `.agentcell`, `.agentchips` and `.bigcard.cohortcard` rules. Every class the JSX references must have a rule in `cohort-table.css` — see the class audit in Task 10.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/components/cohorts/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/cohorts/ src/components/agents/
git commit -m "feat: add cohort comparison table and agent share"
```

---

## Task 5: The persistent layout, header and tab bar

This is the structural task. **The risk named in the spec lives here: "not leaving the layout loading data only one tab needs."** The layout loads the repository record and the coverage facts. Nothing else. If a query in the layout is read by only one route, it is in the wrong file.

**Files:**
- Create: `src/app/repos/[repoId]/layout.tsx`
- Create: `src/db/queries/repository-header.ts`
- Create: `src/components/repository/header.tsx`, `header.css`
- Create: `src/components/repository/tab-bar.tsx`, `tab-bar.css`
- Create: `src/components/repository/coverage-strip.tsx`, `coverage-strip.css`
- Test: `src/components/repository/tab-bar.test.ts`, `src/app/repos/[repoId]/layout.test.ts`

**Interfaces:**
- Produces:
```typescript
export async function loadRepositoryHeader(repositoryId: string): Promise<RepositoryHeader>;
export interface RepositoryHeader {
  record: RepositoryRecord;          // from repositoryRecords()
  coverage: CoverageFacts;           // review + CI evidence, last collection, history currency
  activeImport: ImportProgressData | null;
}
export function TabBar({ repoId, score, agentCount }: { repoId: string; score: number | null; agentCount: number | null });
```

Header contents, all five persisting across tabs: breadcrumb, repository identity, facts line (visibility, default branch, accessible pull-request count, plan), actions (GitHub link, Refresh data), coverage strip.

**The coverage strip is the point of this task.** It states in one line whether review and CI evidence were both detected, when collection last succeeded, and whether background history is current. An import in flight renders here. The six underlying timestamps do **not** — they move to Settings in Task 7.

**Tab bar.** A `role="tablist"` of `next/link` anchors with `role="tab"`, `aria-selected` driven by `useSelectedLayoutSegment()`, arrow-key navigation between tabs, and a visible focus state. It scrolls horizontally rather than wrapping, scrollbar hidden. It is a client component; keep it the only one in the header.

The `score` and `agentCount` counts on the Readiness and Involvement tabs are what the preview shows at lines 559–560. They come from the header load, not from the tab's own route.

- [ ] **Step 1: Read the guides**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md` and `01-app/03-api-reference/04-functions/use-selected-layout-segment.md` in full before writing the layout. Confirm for yourself that the layout cannot read `searchParams`.

- [ ] **Step 2: Write the failing tab-bar test**

```typescript
import { describe, expect, it } from 'vitest';
import { tabs, isActive } from './tab-bar';

describe('repository tabs', () => {
  it('lists the five views in order', () => {
    expect(tabs.map((t) => t.segment)).toEqual([
      null, 'grading', 'ai-involvement', 'delivery', 'settings',
    ]);
  });

  it('marks the landing view active when there is no segment', () => {
    expect(isActive(tabs[0], null)).toBe(true);
    expect(isActive(tabs[1], null)).toBe(false);
  });

  it('marks a nested view active by its segment', () => {
    expect(isActive(tabs[1], 'grading')).toBe(true);
    expect(isActive(tabs[0], 'grading')).toBe(false);
  });
});
```

Export `tabs` and `isActive` as pure values from `tab-bar.tsx` so the routing logic is testable without rendering.

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm vitest run src/components/repository/tab-bar.test.ts`
Expected: FAIL — cannot resolve `./tab-bar`.

- [ ] **Step 4: Build the header load, the three components and the layout**

The layout awaits `params`, resolves the repository through `requireTrackedRepository` exactly as `page.tsx:32` does today, calls `loadRepositoryHeader` once, and renders header plus `{children}`. Set `export const dynamic = 'force-dynamic'`.

- [ ] **Step 5: Verify the query split**

Run: `grep -n "await " src/app/repos/\[repoId\]/layout.tsx`
Expected: `params`, `requireTrackedRepository`, and `loadRepositoryHeader`. Nothing else. If `loadBasicDashboard`, `prRows`, `currentPolicy` or `loadCohorts` appear here, the split is wrong.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/components/repository/ src/app/repos/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/repos/\[repoId\]/layout.tsx src/db/queries/repository-header.ts src/components/repository/
git commit -m "feat: add persistent repository header and tab routing"
```

---

## Task 6: The Agents view

**Files:**
- Modify: `src/app/repos/[repoId]/page.tsx` (rewrite)
- Test: `src/app/repos/[repoId]/page.test.ts`

Two columns above 720px: the readiness card at a fixed 330px on the left, and a column beside it carrying agents involved, agent share of work, and the cohort comparison. Below 720px it collapses to one column with the readiness card first.

**The right column stacks naturally and is not height-matched to the card.** The spec is explicit: card height varies with the flavour line and the number of failing checks, and "Forcing a match would reintroduce the dead space the cohort card was moved up to fill." Do not add `align-items: stretch`, equal-height grid rows, or a min-height on the right column.

This route loads: the latest grade run, the detections, the cohort aggregation, and the coverage facts it needs beyond the header's. It does **not** load `prRows`, `currentPolicy` or `latestImport` — those belong to Delivery and Settings.

- [ ] **Step 1: Write the failing test**

Follow the shape of the existing `src/app/repos/[repoId]/grading/page.test.ts`. Assert the view renders the cohort table and the agent share, and that it does not query the pull-request table.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/app/repos/`
Expected: FAIL.

- [ ] **Step 3: Rewrite `page.tsx` as the Agents view**

Keep the `InvalidRange` guard and `readRange` handling — the date range applies to this view. Everything relating to KPI cards, daily charts, the pull-request table, the failure breakdown and the gate policy moves out in Task 7; do not delete it, move it.

- [ ] **Step 4: Verify the query split**

Run: `grep -n "await \|loadBasicDashboard\|prRows\|currentPolicy\|latestImport" src/app/repos/\[repoId\]/page.tsx`
Expected: no `prRows`, no `currentPolicy`, no `latestImport`.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/app/repos/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/repos/\[repoId\]/page.tsx src/app/repos/\[repoId\]/page.test.ts
git commit -m "feat: make the repository landing view the Agents view"
```

---

## Task 7: Delivery and Settings routes

**Files:**
- Create: `src/app/repos/[repoId]/delivery/page.tsx`
- Create: `src/app/repos/[repoId]/settings/page.tsx`
- Modify: `src/app/repos/[repoId]/actions.ts` (unchanged behaviour; re-point imports if paths move)
- Test: `src/app/repos/[repoId]/delivery/page.test.ts`, `src/app/repos/[repoId]/settings/page.test.ts`

**Delivery** takes the KPI cards, the three daily charts, the date range, the pull-request table at full width **with a new Agent column** (possible only because Task 2 exists), the failure breakdown, and the gate-policy projection. "a second projection of one table is a toggle on that table, not a separate list in a drawer" — the gate-policy projection is a toggle on the pull-request table, not a separate section.

Loads: the dashboard aggregation and the pull-request records. Nothing else.

**Settings** takes the required-gates form and its policy version, the import control, the collection detail, and the six evidence-definition timestamps that came off the coverage strip in Task 5.

Loads: the gate policy and the collection record. Nothing else.

**The existing server actions in `actions.ts` (`saveGates`, `refreshImport`) keep working and are not rewritten.** `refreshImport` is triggered from the header's Refresh action, which now lives in the layout; confirm the action import still resolves from its new caller.

- [ ] **Step 1: Write the failing tests for both routes**

Assert Delivery renders the pull-request table with an Agent column, and that Settings renders the gates form and the six timestamps.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/app/repos/`
Expected: FAIL.

- [ ] **Step 3: Move the markup**

Move, do not rewrite. Every section that was on the old page has a destination; if something has no home, stop and report it rather than dropping it.

- [ ] **Step 4: Verify nothing was lost**

Run: `git show HEAD~1:src/app/repos/\[repoId\]/page.tsx > /tmp/old-page.tsx && grep -o '<[A-Z][A-Za-z]*' /tmp/old-page.tsx | sort -u`
Compare that component list against the union of the new Agents, Delivery and Settings routes. Every component in the old list must appear in exactly one of them. Report any that do not.

- [ ] **Step 5: Verify the query split**

Run: `grep -n "loadBasicDashboard\|prRows\|currentPolicy\|latestImport\|loadCohorts\|loadDetections" src/app/repos/\[repoId\]/*/page.tsx src/app/repos/\[repoId\]/page.tsx`
Expected: `loadCohorts` and `loadDetections` only in Agents; `loadBasicDashboard` and `prRows` only in Delivery; `currentPolicy` and `latestImport` only in Settings.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/app/repos/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/repos/\[repoId\]/delivery/ src/app/repos/\[repoId\]/settings/ src/app/repos/\[repoId\]/actions.ts
git commit -m "feat: split delivery and settings into their own routes"
```

---

## Task 8: The readiness card gains a flavour line and a next-tier block

**Files:**
- Create: `src/domain/grading/flavour.ts`, `src/domain/grading/flavour.test.ts`
- Create: `src/domain/grading/next-tier.ts`, `src/domain/grading/next-tier.test.ts`
- Modify: `src/components/grading/grade-card.tsx`, `src/components/grading/grade-card.css`
- Modify: `src/app/repos/[repoId]/grading/page.tsx` and the Agents view — both pass `checks`

**Interfaces:**
- Produces:
```typescript
export function flavourLine(score: number): string;
export interface Move { id: string; title: string; points: number }
export interface NextTier { targetScore: number; targetFinish: string; moves: Move[] }
export function nextTier(score: number, checks: CheckResult[]): NextTier | null; // null at 100
```

`GradeCard` gains `checks: CheckResult[]`. Score, repository name, commit and rubric version are unchanged. Both the Agents view and the Readiness tab render the same component, "so the card cannot drift between them."

**Flavour copy — from the spec table, verbatim:**

| Score | Finish | Flavour line |
| --- | --- | --- |
| 0–49 | Common · Flat | An agent will guess. There is no reliable way to build this, test it, or find the thing it needs to change. |
| 50–69 | Shimmer · Light holo | An agent can start, but will stop to ask questions a document should already answer. |
| 70–79 | Bronze · Holographic | Enough context to work from. Verifying the change still takes trial and error. |
| 80–89 | Silver · Holographic | Readable, testable, navigable. An agent can find its way around and verify its own work without asking a human first. |
| 90–99 | Gold · Holographic | An agent can land a change unaided. Documentation and verification both hold under pressure. |
| 100 | Prismatic · Perfect | Nothing the rubric asks for is missing. |

**Next tier is the next *reachable* score, not the next threshold.** Walk the failing checks by points descending, accumulating, and stop at the first accumulated total whose `gradePresentation(score + accumulated).finish` differs from the current finish. That is `targetScore`. This is why a repository at 80 reads `Prismatic at 100` — 90 is not reachable with 20-point checks. `moves` lists **all** failing checks sorted by points descending, using the titles already in `src/components/grading/report.tsx:116-122`. Move those titles into a shared module rather than duplicating the map.

At a perfect score, `nextTier` returns `null` and the block is replaced by a single line.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from 'vitest';
import { flavourLine } from './flavour';
import { nextTier } from './next-tier';
import type { CheckResult } from './types';

const check = (id: string, status: 'pass' | 'fail'): CheckResult => ({
  id,
  points: status === 'pass' ? 20 : 0,
  maxPoints: 20,
  status,
  paths: [],
  lineRanges: [],
  explanation: '',
});

describe('flavourLine', () => {
  it('covers every band boundary', () => {
    expect(flavourLine(0)).toMatch(/An agent will guess/);
    expect(flavourLine(49)).toMatch(/An agent will guess/);
    expect(flavourLine(50)).toMatch(/can start, but will stop/);
    expect(flavourLine(70)).toMatch(/Enough context to work from/);
    expect(flavourLine(80)).toMatch(/Readable, testable, navigable/);
    expect(flavourLine(90)).toMatch(/land a change unaided/);
    expect(flavourLine(100)).toMatch(/Nothing the rubric asks for is missing/);
  });
});

describe('nextTier', () => {
  it('names the next reachable tier, not the next threshold', () => {
    // 80 with one failing 20-point check can only reach 100.
    const checks = [
      check('root-agent-instructions', 'pass'),
      check('root-readme', 'pass'),
      check('docs-markdown', 'pass'),
      check('documented-setup', 'pass'),
      check('documented-tests', 'fail'),
    ];
    const result = nextTier(80, checks);
    expect(result?.targetScore).toBe(100);
    expect(result?.targetFinish).toBe('Prismatic');
  });

  it('lists every failing check as a move, highest points first', () => {
    const checks = [
      check('root-agent-instructions', 'fail'),
      check('root-readme', 'pass'),
      check('docs-markdown', 'fail'),
      check('documented-setup', 'pass'),
      check('documented-tests', 'fail'),
    ];
    const result = nextTier(40, checks);
    expect(result?.moves).toHaveLength(3);
    expect(result?.moves.every((m) => m.points === 20)).toBe(true);
  });

  it('returns null at a perfect score', () => {
    const checks = Array.from({ length: 5 }, (_, i) => check(`c${i}`, 'pass'));
    expect(nextTier(100, checks)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/domain/grading/`
Expected: FAIL — cannot resolve `./flavour`.

- [ ] **Step 3: Implement the two domain modules**

- [ ] **Step 4: Change the card**

In `grade-card.tsx`:
- Add `checks: CheckResult[]` to the props.
- **Delete line 92**, `<p className="grade-card-level">Level 1 · Foundations</p>`, and delete the `.grade-card-level` rule from `grade-card.css`. (Decision 1.)
- After `.grade-card-finish`, render `<p className="grade-card-flavour">{flavourLine(score)}</p>`.
- Then the next-tier block, or the perfect-score line when `nextTier` returns `null`.
- Change `.grade-card-finish` `margin-bottom` from `10px` to `15px`.
- Add `.grade-card-flavour`, `.grade-card-move`, `.grade-card-move-top` rules, taking values from the preview at lines 372–394.

- [ ] **Step 5: Update both call sites to pass `checks`**

Run: `grep -rn "<GradeCard" src/`
Every call site must pass the completed run's `CheckResult[]`.

- [ ] **Step 6: Cover all six finishes in fixtures**

The constraint is explicit: fixtures must cover all six finishes even though only four occur. Add a fixture exercising scores 0, 50, 70, 80, 90 and 100 through the card, and assert each renders its finish and flavour line without throwing. "a finish first exercised on the day it appears in production is a finish nobody has looked at."

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run src/domain/grading/ src/components/grading/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/domain/grading/ src/components/grading/ src/app/repos/
git commit -m "feat: add flavour line and next-tier moves to the readiness card"
```

---

## Task 9: Responsive behaviour and the phone-width banner

**Files:**
- Create: `src/components/grading/grade-banner.tsx`
- Modify: the Agents view stylesheet, `tab-bar.css`

- Above 720px the Agents view is two columns; below, one column with the readiness card first.
- At phone width the 330px card "consumes most of the first screen", so it reduces to a compact banner carrying score, tier and symbols. **The full card renders only on the Readiness tab.**
- The tab bar scrolls horizontally rather than wrapping, scrollbar hidden.

- [ ] **Step 1: Build the banner and the media queries**

- [ ] **Step 2: Verify at both widths in the real app**

Run `pnpm dev:demo`, then inspect `/repos/demo-repository` and each of the five tabs at desktop width and at 400px. Confirm: two columns become one; the card becomes a banner on Agents but stays a full card on Readiness; the tab bar scrolls without a visible scrollbar; no horizontal page scroll at 400px.

- [ ] **Step 3: Commit**

```bash
git add src/components/grading/grade-banner.tsx src/components/
git commit -m "feat: collapse the agents view and card at phone width"
```

---

## Task 10: Accessibility, class audit and full verification

The user has been bitten before by a plan that shipped dead code after a `return` and a CSS class referenced but never defined. These steps exist because of that.

- [ ] **Step 1: Audit every CSS class**

For each new stylesheet, list the classes referenced in JSX and the classes defined in CSS, and diff them:

```bash
cd /tmp/repo-redesign
for f in src/components/repository src/components/cohorts src/components/grading; do
  echo "== $f =="
  grep -rho 'className="[^"]*"' $f | sed 's/className="//;s/"//' | tr ' ' '\n' | sort -u > /tmp/used.txt
  grep -rho '^\s*\.[a-z][a-z0-9-]*' $f | tr -d ' .' | sort -u > /tmp/defined.txt
  echo "referenced but never defined:"; comm -23 /tmp/used.txt /tmp/defined.txt
done
```
Expected: nothing under "referenced but never defined" except classes that are defined in a global stylesheet. Check each exception by hand.

- [ ] **Step 2: Check for unreachable code**

Run: `pnpm lint`
Then read each new or rewritten file once, looking specifically for statements after a `return` and for early returns that skip rendering a section the spec requires.

- [ ] **Step 3: Verify tab-bar accessibility**

Confirm by hand: `role="tablist"` with an `aria-label`, each tab `role="tab"` with `aria-selected` reflecting the route, arrow-key navigation moving between tabs, and a visible focus ring. Tab through the header with the keyboard only.

- [ ] **Step 4: Run the full check**

Run: `pnpm check`

`pnpm check` ends in `pnpm build`, which needs synthetic production config rather than the dev `.env`. Read `.github/workflows/ci.yml` and reproduce the env it sets for the build step. If the build fails on missing production config, that is the cause — fix the env, do not edit the build.

Expected: lint, typecheck, 381+ unit tests, 123+ integration tests, and build all passing.

- [ ] **Step 5: Inspect the real pages**

With `pnpm dev:demo` running, visit all five routes at desktop and 400px. Confirm every section from the old page is present somewhere and the coverage strip reports honestly for the demo repository.

- [ ] **Step 6: Open the pull request**

```bash
git push -u origin repo-redesign/implementation
gh pr create --base ai-involvement/executed-detection \
  --title "feat: restructure the repository page into five tab routes" \
  --body "..."
```

**Base is `ai-involvement/executed-detection`, not `main`** — this is a stacked pull request on the unmerged #16, whose columns this work requires. GitHub re-targets it to `main` automatically when #16 merges.

**Do not merge and do not deploy.**

---

## Spec coverage

| Spec section | Task |
| --- | --- |
| Information architecture — five routes | 5, 6, 7 |
| Accordion removed, children rehomed | 7 (Step 4 audit) |
| Persistent header, facts line, actions | 5 |
| Coverage strip; six timestamps to Settings | 5, 7 |
| Agents view, two columns, natural stacking | 6 |
| Agent share of work | 4, 6 |
| Readiness card: flavour line, next-tier block | 8 |
| `.grade-card-finish` margin 10 → 15 | 8 Step 4 |
| `Level 1 · Foundations` decision | Decision 1, applied in 8 Step 4 |
| All six finishes in fixtures | 8 Step 6 |
| Bronze/Gold parked, rubric untouched | Global Constraints |
| Cohort comparison table | 3, 4 |
| Per-pull-request attribution first | 1, 2 |
| Delivery gains the Agent column | 7 |
| Date range out of the header | 5 (framework-enforced), 6, 7 |
| Settings holds configuration | 7 |
| Each route loads only what it renders | 5 Step 5, 6 Step 4, 7 Step 5 |
| Responsive behaviour, phone banner | 9 |
| Tab bar a11y | 5, 10 Step 3 |
| Readiness and Involvement move unchanged | 5 (they inherit the layout; verified in 10 Step 5) |
