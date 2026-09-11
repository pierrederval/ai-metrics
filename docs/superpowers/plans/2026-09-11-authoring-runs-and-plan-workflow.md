# Authoring Runs and the Plan Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repository with a failing readiness grade can be asked for a plan, and that plan — one remedy per failing check — is produced by a durable background job and rendered for a human to read.

**Architecture:** `authoring_runs` mirrors `grade_runs` exactly: a `queued|running|complete|failed` state machine with a partial unique index enforcing one active run per repository. A server action queues a row; `dispatchAuthoringPlan` sends one event carrying only the run id; an Inngest function with the steps `begin`, `pin-commit`, `explore`, `complete` re-checks authorization before each. `explore` is implemented here on the **deterministic floor** — one remedy per failing check, path derived from the check id, rationale taken from that check's own `CheckResult.explanation`. The sandbox and the authoring agent replace `explore`'s implementation in plan 2b and never its step name.

**Tech Stack:** TypeScript, Next.js 16 (App Router, server actions), Drizzle ORM on PostgreSQL, Inngest 4, Zod 4, Vitest (unit and integration configs).

**Spec:** `docs/superpowers/specs/2026-09-11-authoring-runs-and-plan-workflow-design.md`
**Binding authority:** `docs/superpowers/specs/2026-09-11-monitor-act-train-loop-design.md`
**Glossary:** `UBIQUITOUS_LANGUAGE.md`
**Prior slice, for house style:** `docs/superpowers/plans/2026-09-11-act-availability-gate.md`

## Global Constraints

- **No LLM scores anything, and this plan adds no LLM call of any kind.** The deterministic floor is arithmetic over a grade that already exists.
- **Nothing is claimed that was not observed.** A remedy's rationale is the grade's own `CheckResult.explanation`. Never invent prose describing a repository.
- **Raw repository source must never become a durable Inngest step output.** Step functions return identifiers or nothing. See the comment in `src/inngest/functions/grade-repository.ts`.
- **Provider exceptions must never enter logs or step outputs.** Parse provider payloads with Zod and throw generic errors, following `collectionFailure` in `src/inngest/functions/grade-repository.ts`.
- **Re-check authorization after every long operation**, following `validated()` in `src/inngest/functions/grade-repository.ts`.
- **Pure domain logic lives under `src/domain/`, provider access under `src/github/`, persistence under `src/db/queries/`.** Follow that split.
- **Unit tests never touch the database or the network.** Persistence is tested in `*.integration.test.ts` under `vitest.integration.config.ts`.
- **Integration tests migrate `TEST_DATABASE_URL` themselves in `beforeAll`.** Never run `pnpm db:migrate` for them. Bring Postgres up with `docker compose up -d --wait`.
- **Migrations are generated with `pnpm db:generate`, never hand-written.**
- **Cost is plan 6.** Do not add `sandbox_seconds`, token counts or `cost_micros` to any table in this plan.
- **`pnpm check` must pass before the final commit of each task.** The build needs CI's synthetic environment — see `.github/workflows/ci.yml:75-87`.
- End every commit message with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## Vocabulary you must not get wrong

These are the terms this codebase is held to. Using the wrong one is a review rejection, not a nitpick.

- A **readiness check** is one of the rubric's five criteria, identified by a **check id** — the string in `GradeResult.checks[].id`, one of `root-agent-instructions`, `root-readme`, `docs-markdown`, `documented-setup`, `documented-tests`. It is **not** a CI check (`ci_checks`, a GitHub check run) and **not** a database row id.
- A **remedy** is one file an authoring run proposes to write so that one failing readiness check passes. Never call it a move, a plan item, a fix or a change.
- A **plan run** is an `authoring_runs` row with `kind = 'plan'`. A *plan* under `docs/superpowers/plans/` is a document for an engineer. This file is the second kind.
- A note's writer is its **speaker**, never its role — `workspace_memberships.role` already means `owner | member`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/db/schema.ts` *(modify)* | Add `authoringRuns` and `authoringRemedies`. |
| `drizzle/00NN_*.sql` *(generated)* | The migration. |
| `src/domain/act/remedies.ts` | Pure: failing grade → proposed remedies. No IO. |
| `src/db/queries/authoring-runs.ts` | All persistence for authoring runs: the browser-facing request and read queries, and the trusted worker primitives, split by comment as `grade-runs.ts` does. |
| `src/db/queries/grade-runs.ts` *(modify)* | Extract `latestCompletedGrade(repositoryId)` as a trusted worker primitive; `latestGrade` authorizes then delegates. |
| `src/inngest/events.ts` *(modify)* | `authoringPlanRequestedData` and the event in `ReliabilityEvents`. |
| `src/inngest/dispatch-authoring.ts` | Send one event under the same predicate that selected the row. |
| `src/inngest/functions/plan-repository.ts` | The four-step durable job. |
| `src/inngest/functions/reconcile-authoring.ts` | Cron re-dispatch of undispatched rows. |
| `src/app/api/inngest/route.ts` *(modify)* | Register both functions. |
| `src/app/repos/[repoId]/grading/actions.ts` *(modify)* | `requestPlanRun` server action beside `runGrade`. |
| `src/app/repos/[repoId]/grading/page.tsx` *(modify)* | The Act entry point where the availability line already is. |
| `src/components/act/act-entry.tsx` | The entry-point button and the link to an existing plan. |
| `src/app/repos/[repoId]/act/[runId]/page.tsx` | The plan view. |
| `src/components/act/plan-view.tsx` | Renders remedies as disabled checkboxes. |

---

### Task 1: The two tables

The schema and its migration. `grade_runs` at `src/db/schema.ts:631` is the template; read it before writing.

**Files:**
- Modify: `src/db/schema.ts` (append after `gradeRuns`, before `repoAiDetections`)
- Generated: `drizzle/00NN_<name>.sql` — whatever `pnpm db:generate` names it
- Test: `src/db/authoring-runs.integration.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `authoringRuns` and `authoringRemedies` Drizzle tables. Row types are `typeof authoringRuns.$inferSelect` and `typeof authoringRemedies.$inferSelect`.

- [ ] **Step 1: Write the failing test**

Create `src/db/authoring-runs.integration.test.ts`. This tests the *constraints*, which is the only thing a schema can be wrong about in a way types do not catch.

```typescript
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { inArray } from 'drizzle-orm';
import { db, closeDb } from './index';
import { authoringRemedies, authoringRuns, installations, repositories, users, workspaces, workspaceMemberships } from './schema';

const owner = randomUUID();
const workspace = randomUUID();
const fixtures: string[] = [];
const runIds: string[] = [];

beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });
  await db().insert(users).values({ id: owner, login: 'author', credentials: 'fixture' });
  await db().insert(workspaces).values({ id: workspace, name: 'Authoring', defaultForUserId: owner });
  await db().insert(workspaceMemberships).values({ workspaceId: workspace, userId: owner, role: 'member' });
});

afterAll(async () => {
  if (fixtures.length) {
    await db()
      .delete(authoringRemedies)
      .where(inArray(authoringRemedies.authoringRunId, runIds));
    await db().delete(authoringRuns).where(inArray(authoringRuns.repositoryId, fixtures));
    await db().delete(repositories).where(inArray(repositories.id, fixtures));
    await db().delete(installations).where(inArray(installations.id, fixtures));
  }
  await db().delete(workspaceMemberships).where(inArray(workspaceMemberships.workspaceId, [workspace]));
  await db().delete(workspaces).where(inArray(workspaces.id, [workspace]));
  await db().delete(users).where(inArray(users.id, [owner]));
  await closeDb();
});

async function seedRepository() {
  const id = randomUUID();
  fixtures.push(id);
  await db().insert(installations).values({
    id,
    githubInstallationId: id,
    accountLogin: 'octo',
    accountType: 'Organization',
  });
  await db().insert(repositories).values({
    id,
    installationId: id,
    githubRepositoryId: id,
    owner: 'octo',
    name: 'repo',
    defaultBranch: 'main',
    isPrivate: false,
    active: true,
  });
  return id;
}

function queued(repositoryId: string) {
  const id = randomUUID();
  runIds.push(id);
  return {
    id,
    repositoryId,
    kind: 'plan' as const,
    requestedBy: owner,
    requestedWorkspaceId: workspace,
    state: 'queued' as const,
    authorVersion: 'readiness-floor-v01',
  };
}

test('allows one active run per repository and refuses a second', async () => {
  const repositoryId = await seedRepository();
  await db().insert(authoringRuns).values(queued(repositoryId));
  await expect(db().insert(authoringRuns).values(queued(repositoryId))).rejects.toThrow();
});

test('allows a new run once the active one is no longer queued or running', async () => {
  const repositoryId = await seedRepository();
  const first = queued(repositoryId);
  await db().insert(authoringRuns).values(first);
  await db()
    .update(authoringRuns)
    .set({ state: 'failed', completedAt: new Date() })
    .where(inArray(authoringRuns.id, [first.id]));
  await expect(db().insert(authoringRuns).values(queued(repositoryId))).resolves.toBeDefined();
});

test('refuses to mark a run complete without a sha', async () => {
  const repositoryId = await seedRepository();
  const run = queued(repositoryId);
  await db().insert(authoringRuns).values(run);
  await expect(
    db()
      .update(authoringRuns)
      .set({ state: 'complete', completedAt: new Date() })
      .where(inArray(authoringRuns.id, [run.id])),
  ).rejects.toThrow();
});

test('refuses an unknown kind', async () => {
  const repositoryId = await seedRepository();
  await expect(
    db()
      .insert(authoringRuns)
      .values({ ...queued(repositoryId), kind: 'ponder' as unknown as 'plan' }),
  ).rejects.toThrow();
});

test('refuses the same check and path twice in one run, and allows one path for two checks', async () => {
  const repositoryId = await seedRepository();
  const run = queued(repositoryId);
  await db().insert(authoringRuns).values(run);
  const remedy = (checkId: string, ordinal: number) => ({
    id: randomUUID(),
    authoringRunId: run.id,
    checkId,
    path: 'AGENTS.md',
    rationale: 'because',
    ordinal,
  });
  await db().insert(authoringRemedies).values(remedy('root-agent-instructions', 0));
  // One file answers several failing checks — this must be allowed.
  await expect(
    db().insert(authoringRemedies).values(remedy('documented-setup', 1)),
  ).resolves.toBeDefined();
  // The same change proposed twice must not be.
  await expect(
    db().insert(authoringRemedies).values(remedy('root-agent-instructions', 2)),
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
docker compose up -d --wait
pnpm vitest run --config vitest.integration.config.ts src/db/authoring-runs.integration.test.ts
```

Expected: FAIL — `authoringRuns` is not exported from `./schema`.

- [ ] **Step 3: Add the tables**

In `src/db/schema.ts`, after the `gradeRuns` definition:

```typescript
export const authoringRuns = pgTable(
  'authoring_runs',
  {
    id: id(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    // Only 'plan' is written in this slice; 'execute' is accepted by the
    // constraint so the one-active-run index means the right thing when
    // execute runs arrive, without a later backfill.
    kind: text('kind').$type<'plan' | 'execute'>().notNull(),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => users.id),
    requestedWorkspaceId: text('requested_workspace_id')
      .notNull()
      .references(() => workspaces.id),
    retryOf: text('retry_of').references((): AnyPgColumn => authoringRuns.id),
    state: text('state').$type<'queued' | 'running' | 'complete' | 'failed'>().notNull(),
    sha: text('sha'),
    // Provenance, always recorded: something produced this plan.
    authorVersion: text('author_version').notNull(),
    // Null means no model authored this plan — true for the deterministic
    // floor, and true when a sandbox failed and the floor stood in for it.
    model: text('model'),
    sandboxId: text('sandbox_id'),
    errorCode: text('error_code'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    createdAt: created(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    check('authoring_runs_state', sql`${t.state} IN ('queued','running','complete','failed')`),
    check('authoring_runs_kind', sql`${t.kind} IN ('plan','execute')`),
    // A plan's result is child rows, so "has at least one remedy" cannot be a
    // check constraint. completeAuthoringRun() enforces that; this enforces
    // what it can.
    check(
      'authoring_runs_complete',
      sql`(${t.state} = 'complete' AND ${t.sha} IS NOT NULL AND ${t.completedAt} IS NOT NULL) OR ${t.state} <> 'complete'`,
    ),
    uniqueIndex('authoring_runs_one_active')
      .on(t.repositoryId)
      .where(sql`${t.state} IN ('queued','running')`),
    index('authoring_runs_latest').on(t.repositoryId, t.createdAt.desc()),
  ],
);

export const authoringRemedies = pgTable(
  'authoring_remedies',
  {
    id: id(),
    authoringRunId: text('authoring_run_id')
      .notNull()
      .references(() => authoringRuns.id),
    // A readiness check id as it appears in GradeResult.checks[].id, e.g.
    // 'root-agent-instructions'. Not a CI check, not a row id.
    checkId: text('check_id').notNull(),
    path: text('path').notNull(),
    rationale: text('rationale').notNull(),
    ordinal: integer('ordinal').notNull(),
  },
  (t) => [
    // One file routinely answers several failing checks, so path is not
    // unique on its own. The pair is what must not repeat.
    uniqueIndex('authoring_remedies_change').on(t.authoringRunId, t.checkId, t.path),
    uniqueIndex('authoring_remedies_order').on(t.authoringRunId, t.ordinal),
    check('authoring_remedies_ordinal', sql`${t.ordinal} >= 0`),
  ],
);
```

- [ ] **Step 4: Generate the migration**

```bash
pnpm db:generate
```

Read the generated SQL in `drizzle/`. Confirm it creates both tables, the partial unique index with its `WHERE` clause, and all four check constraints. If the partial index lost its `WHERE`, fix the schema and regenerate — never edit the SQL.

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm vitest run --config vitest.integration.config.ts src/db/authoring-runs.integration.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Run the full check and commit**

```bash
pnpm check
git add src/db/schema.ts drizzle src/db/authoring-runs.integration.test.ts
git commit -m "feat(act): add authoring runs and remedies

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The deterministic floor

A pure function from a grade to the remedies it implies. No IO, no database, no network. This is what `explore` produces in this slice, and what it falls back to in the next.

**Files:**
- Create: `src/domain/act/remedies.ts`
- Test: `src/domain/act/remedies.test.ts`

**Interfaces:**
- Consumes: `GradeResult` and `CheckResult` from `src/domain/grading/types.ts`.
- Produces:
  - `type ProposedRemedy = { checkId: string; path: string; rationale: string; ordinal: number }`
  - `const floorAuthorVersion: 'readiness-floor-v01'`
  - `function proposeRemedies(grade: GradeResult): ProposedRemedy[]`

Background you need: `src/domain/grading/readiness-v01.ts` defines the five checks. `documented-setup` and `documented-tests` each pass when a heading (`setup`/`install`/`installation`/`getting started`, and `test`/`testing`/`validation`/`verification`/`checks`) is followed by a nonempty fenced code block in `README.md`, a root `AGENTS.md`/`CLAUDE.md`, or any `docs/**.md`. That is why both map to `AGENTS.md` here and why one path may appear twice.

- [ ] **Step 1: Write the failing test**

Create `src/domain/act/remedies.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { proposeRemedies } from './remedies';
import type { CheckResult, GradeResult } from '../grading/types';

const check = (id: string, status: 'pass' | 'fail'): CheckResult => ({
  id,
  points: status === 'pass' ? 20 : 0,
  maxPoints: 20,
  status,
  paths: [],
  lineRanges: [],
  explanation: `${id} explanation.`,
});

const grade = (checks: CheckResult[]): GradeResult => ({
  score: 0,
  checks,
  rubricVersion: '0.1.0',
  evaluatorVersion: '1.0.0',
});

describe('proposeRemedies', () => {
  it('proposes nothing when every check passes', () => {
    expect(proposeRemedies(grade([check('root-readme', 'pass')]))).toEqual([]);
  });

  it('proposes one remedy per failing check and ignores passing ones', () => {
    const result = proposeRemedies(
      grade([check('root-agent-instructions', 'fail'), check('root-readme', 'pass')]),
    );
    expect(result).toEqual([
      {
        checkId: 'root-agent-instructions',
        path: 'AGENTS.md',
        rationale: 'root-agent-instructions explanation.',
        ordinal: 0,
      },
    ]);
  });

  it('takes the rationale from the grade, claiming nothing the grader did not observe', () => {
    const [remedy] = proposeRemedies(grade([check('root-readme', 'fail')]));
    expect(remedy.rationale).toBe('root-readme explanation.');
  });

  it('answers setup and tests in the file an agent reads, so one path may repeat', () => {
    const result = proposeRemedies(
      grade([check('documented-setup', 'fail'), check('documented-tests', 'fail')]),
    );
    expect(result.map((remedy) => remedy.path)).toEqual(['AGENTS.md', 'AGENTS.md']);
    expect(result.map((remedy) => remedy.checkId)).toEqual([
      'documented-setup',
      'documented-tests',
    ]);
  });

  it('numbers remedies from zero in the rubric order the grade supplies', () => {
    const result = proposeRemedies(
      grade([
        check('root-agent-instructions', 'fail'),
        check('root-readme', 'fail'),
        check('docs-markdown', 'fail'),
      ]),
    );
    expect(result.map((remedy) => remedy.ordinal)).toEqual([0, 1, 2]);
    expect(result.map((remedy) => remedy.path)).toEqual([
      'AGENTS.md',
      'README.md',
      'docs/README.md',
    ]);
  });

  it('proposes nothing for a check id it does not recognise', () => {
    expect(proposeRemedies(grade([check('invented-check', 'fail')]))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/domain/act/remedies.test.ts`
Expected: FAIL — `Failed to resolve import "./remedies"`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/act/remedies.ts`:

```typescript
import type { GradeResult } from '../grading/types';

// The provenance recorded on every run this floor produces. It is not a
// model id: no model authored these. A run's `model` stays null.
export const floorAuthorVersion = 'readiness-floor-v01';

export type ProposedRemedy = {
  checkId: string;
  path: string;
  rationale: string;
  ordinal: number;
};

// The file each failing readiness check is answered by. Setup and test
// instructions both land in AGENTS.md: readiness-v01 accepts a documented
// command in the README, the root agent instructions, or anything under
// docs/, and AGENTS.md is the file the agent being graded actually reads.
// One path therefore answers several checks, which is why authoring_remedies
// is unique on (run, check, path) rather than on path.
//
// A check id absent from this map proposes nothing. A remedy must name a
// file, and inventing one for a check this version does not understand would
// claim more than the grader observed.
const remedyPaths: Record<string, string> = {
  'root-agent-instructions': 'AGENTS.md',
  'root-readme': 'README.md',
  'docs-markdown': 'docs/README.md',
  'documented-setup': 'AGENTS.md',
  'documented-tests': 'AGENTS.md',
};

export function proposeRemedies(grade: GradeResult): ProposedRemedy[] {
  return grade.checks
    .filter((check) => check.status === 'fail')
    .flatMap((check) => {
      const path = remedyPaths[check.id];
      return path ? [{ checkId: check.id, path, rationale: check.explanation }] : [];
    })
    .map((remedy, ordinal) => ({ ...remedy, ordinal }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/domain/act/remedies.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the full check and commit**

```bash
pnpm check
git add src/domain/act/remedies.ts src/domain/act/remedies.test.ts
git commit -m "feat(act): propose one remedy per failing readiness check

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Requesting a plan

The browser-facing entry point into the state machine. `requestGrade` in `src/db/queries/grade-runs.ts:61` is the template — read it before writing, including its advisory lock and its `for update` on the workspace row.

**Files:**
- Create: `src/db/queries/authoring-runs.ts`
- Test: `src/db/authoring-request.integration.test.ts`

**Interfaces:**
- Consumes: `floorAuthorVersion` from Task 2; `actAvailability`, `nothingGranted` from `src/domain/act/availability.ts`; `actEnabled` from `src/db/queries/act-settings.ts`; `fetchGrantedPermissions` from `src/github/installation-permissions.ts`; `latestGrade` from `src/db/queries/grade-runs.ts`.
- Produces:
  - `type AuthoringRun = typeof authoringRuns.$inferSelect`
  - `type Remedy = typeof authoringRemedies.$inferSelect`
  - `async function requestPlan(repositoryId: string): Promise<{ id: string; state: AuthoringRun['state'] }>`

- [ ] **Step 1: Write the failing test**

Create `src/db/authoring-request.integration.test.ts`. Model the mock preamble on `src/db/grade-runs.integration.test.ts:14-27`, which is the established way to run an authorizing query under vitest.

```typescript
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq, inArray } from 'drizzle-orm';
import { db, closeDb } from './index';
import {
  authoringRuns,
  installations,
  repositories,
  users,
  workspaces,
  workspaceMemberships,
  workspaceRepositories,
} from './schema';

const context = vi.hoisted(() => ({ user: '', workspace: '', demo: false }));
const grade = vi.hoisted(() => ({ latest: vi.fn() }));
const github = vi.hoisted(() => ({ permissions: vi.fn() }));

vi.mock('../auth/session', () => ({
  currentUser: async () => ({ id: context.user }),
  cookieOptions: {},
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: context.workspace }) }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found');
  },
}));
vi.mock('../lib/env', () => ({ env: () => ({ DEMO_MODE: context.demo ? 'true' : 'false' }) }));
vi.mock('./queries/grade-runs', () => ({ latestGrade: grade.latest }));
vi.mock('../github/installation-permissions', () => ({
  fetchGrantedPermissions: github.permissions,
}));

import { requestPlan } from './queries/authoring-runs';

const failing = {
  id: 'grade',
  score: 40,
  sha: 'a'.repeat(40),
  rubricVersion: '0.1.0',
  evaluatorVersion: '1.0.0',
  computedAt: new Date('2026-09-11'),
  checks: [
    {
      id: 'root-agent-instructions',
      points: 0,
      maxPoints: 20,
      status: 'fail' as const,
      paths: [],
      lineRanges: [],
      explanation: 'No nonempty root AGENTS.md or CLAUDE.md was found.',
    },
  ],
};

beforeAll(async () => {
  await migrate(db(), { migrationsFolder: 'drizzle' });
  context.user = randomUUID();
  context.workspace = randomUUID();
  await db().insert(users).values({ id: context.user, login: 'author', credentials: 'fixture' });
  await db()
    .insert(workspaces)
    .values({ id: context.workspace, name: 'Authoring', defaultForUserId: context.user });
  await db()
    .insert(workspaceMemberships)
    .values({ workspaceId: context.workspace, userId: context.user, role: 'member' });
});

const fixtures: string[] = [];

afterAll(async () => {
  if (fixtures.length) {
    await db().delete(authoringRuns).where(inArray(authoringRuns.repositoryId, fixtures));
    await db()
      .delete(workspaceRepositories)
      .where(inArray(workspaceRepositories.repositoryId, fixtures));
    await db().delete(repositories).where(inArray(repositories.id, fixtures));
    await db().delete(installations).where(inArray(installations.id, fixtures));
  }
  await db()
    .delete(workspaceMemberships)
    .where(eq(workspaceMemberships.workspaceId, context.workspace));
  await db().delete(workspaces).where(eq(workspaces.id, context.workspace));
  await db().delete(users).where(eq(users.id, context.user));
  await closeDb();
});

beforeEach(() => {
  grade.latest.mockResolvedValue(failing);
  github.permissions.mockResolvedValue({ contents: 'write', pullRequests: 'write' });
});

async function seed(actEnabled = true) {
  const id = randomUUID();
  fixtures.push(id);
  await db()
    .insert(installations)
    .values({
      id,
      githubInstallationId: id,
      accountLogin: 'octo',
      accountType: 'Organization',
      active: true,
    });
  await db()
    .insert(repositories)
    .values({
      id,
      installationId: id,
      githubRepositoryId: id,
      owner: 'octo',
      name: 'repo',
      defaultBranch: 'main',
      isPrivate: false,
      active: true,
      actEnabled,
    });
  await db()
    .insert(workspaceRepositories)
    .values({ workspaceId: context.workspace, repositoryId: id, connectedBy: context.user });
  return id;
}

test('queues a plan run for an available repository', async () => {
  const repositoryId = await seed();
  const run = await requestPlan(repositoryId);
  expect(run.state).toBe('queued');
  const [row] = await db().select().from(authoringRuns).where(eq(authoringRuns.id, run.id));
  expect(row.kind).toBe('plan');
  expect(row.authorVersion).toBe('readiness-floor-v01');
  expect(row.model).toBeNull();
});

test('returns the run already in flight rather than queueing a second', async () => {
  const repositoryId = await seed();
  const first = await requestPlan(repositoryId);
  const second = await requestPlan(repositoryId);
  expect(second.id).toBe(first.id);
});

test('refuses a repository that has not opted in', async () => {
  const repositoryId = await seed(false);
  await expect(requestPlan(repositoryId)).rejects.toThrow('Act unavailable');
});

test('refuses an installation that grants only read', async () => {
  const repositoryId = await seed();
  github.permissions.mockResolvedValue({ contents: 'read', pullRequests: 'read' });
  await expect(requestPlan(repositoryId)).rejects.toThrow('Act unavailable');
});

test('refuses when nothing is failing', async () => {
  const repositoryId = await seed();
  grade.latest.mockResolvedValue({ ...failing, checks: [] });
  await expect(requestPlan(repositoryId)).rejects.toThrow('Act unavailable');
});

test('refuses when the repository has never been graded', async () => {
  const repositoryId = await seed();
  grade.latest.mockResolvedValue(null);
  await expect(requestPlan(repositoryId)).rejects.toThrow('Act unavailable');
});

test('lets a permission check that cannot complete fail loudly rather than reading as unavailable', async () => {
  const repositoryId = await seed();
  github.permissions.mockRejectedValue(new Error('Installation permissions unavailable'));
  await expect(requestPlan(repositoryId)).rejects.toThrow('Installation permissions unavailable');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run --config vitest.integration.config.ts src/db/authoring-request.integration.test.ts`
Expected: FAIL — cannot resolve `./queries/authoring-runs`.

- [ ] **Step 3: Write the implementation**

Create `src/db/queries/authoring-runs.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../index';
import {
  authoringRemedies,
  authoringRuns as runs,
  installations,
  repositories,
  workspaceRepositories,
  workspaceMemberships,
} from '../schema';
import { requireRepository, requireWorkspace } from '../../workspaces/access';
import { currentUser } from '../../auth/session';
import { actAvailability, nothingGranted } from '../../domain/act/availability';
import { floorAuthorVersion } from '../../domain/act/remedies';
import { actEnabled } from './act-settings';
import { fetchGrantedPermissions } from '../../github/installation-permissions';
import { latestGrade } from './grade-runs';

export type AuthoringRun = typeof runs.$inferSelect;
export type Remedy = typeof authoringRemedies.$inferSelect;

export async function requestPlan(
  repositoryId: string,
): Promise<{ id: string; state: AuthoringRun['state'] }> {
  const repository = await requireRepository(repositoryId);
  const workspace = await requireWorkspace();
  if (workspace.id === 'demo' || repository.isDemo) throw new Error('Demo workspace is read-only');
  const user = await currentUser();

  // Availability is decided before the transaction: fetchGrantedPermissions is
  // a network round-trip and must not be held inside one. It throws rather
  // than returning a safe default, and we let it — a permission check that
  // cannot complete must not quietly read as "unavailable".
  const [enabled, grade] = await Promise.all([actEnabled(repositoryId), latestGrade(repositoryId)]);
  const permissions = enabled ? await fetchGrantedPermissions(repositoryId) : nothingGranted;
  const availability = actAvailability({
    enabled,
    permissions,
    failingCheckCount: grade?.checks.filter((check) => check.status === 'fail').length ?? 0,
  });
  if (!availability.available) throw new Error('Act unavailable');

  return db().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${repositoryId + ':authoring'},0))`,
    );
    // Match workspace mutations' lock and recheck membership/link after initial authorization.
    await tx.execute(sql`select id from workspaces where id = ${workspace.id} for update`);
    const [available] = await tx
      .select({ id: repositories.id })
      .from(repositories)
      .innerJoin(installations, eq(installations.id, repositories.installationId))
      .innerJoin(
        workspaceRepositories,
        and(
          eq(workspaceRepositories.repositoryId, repositories.id),
          eq(workspaceRepositories.workspaceId, workspace.id),
        ),
      )
      .innerJoin(
        workspaceMemberships,
        and(
          eq(workspaceMemberships.workspaceId, workspace.id),
          eq(workspaceMemberships.userId, user.id),
        ),
      )
      .where(
        and(
          eq(repositories.id, repositoryId),
          eq(repositories.active, true),
          eq(repositories.isDemo, false),
          eq(repositories.actEnabled, true),
          eq(installations.active, true),
        ),
      );
    if (!available) throw new Error('Repository unavailable');
    const [latest] = await tx
      .select()
      .from(runs)
      .where(and(eq(runs.repositoryId, repositoryId), eq(runs.kind, 'plan')))
      .orderBy(desc(runs.createdAt), desc(runs.id))
      .limit(1);
    const [inserted] = await tx
      .insert(runs)
      .values({
        id: randomUUID(),
        repositoryId,
        kind: 'plan',
        requestedBy: user.id,
        requestedWorkspaceId: workspace.id,
        retryOf: latest?.state === 'failed' ? latest.id : null,
        state: 'queued',
        authorVersion: floorAuthorVersion,
      })
      .onConflictDoNothing()
      .returning();
    const active =
      inserted ??
      (
        await tx
          .select()
          .from(runs)
          .where(
            and(
              eq(runs.repositoryId, repositoryId),
              inArray(runs.state, ['queued', 'running']),
            ),
          )
      )[0];
    if (!active) throw new Error('Plan request unavailable');
    return { id: active.id, state: active.state };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run --config vitest.integration.config.ts src/db/authoring-request.integration.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full check and commit**

```bash
pnpm check
git add src/db/queries/authoring-runs.ts src/db/authoring-request.integration.test.ts
git commit -m "feat(act): request a plan run behind the availability gate

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Worker primitives and read queries

The trusted half of the same module — no session, no cookies, because a background job has neither — plus the two read queries the views need. `src/db/queries/grade-runs.ts:236-330` is the template for every one of these.

**Files:**
- Modify: `src/db/queries/authoring-runs.ts`
- Test: `src/db/authoring-lifecycle.integration.test.ts`

**Interfaces:**
- Consumes: `ProposedRemedy` from Task 2.
- Produces:
  - `async function loadAuthoringRun(runId: string): Promise<AuthoringRun | null>`
  - `async function validateAuthoringRun(run: AuthoringRun): Promise<void>` — throws when access was revoked or the repository opted out
  - `async function beginAuthoring(runId: string): Promise<AuthoringRun | null>`
  - `async function pinAuthoringSha(runId: string, sha: string): Promise<string | null>`
  - `async function completeAuthoringRun(runId: string, remedies: ProposedRemedy[]): Promise<void>`
  - `async function failAuthoringRun(runId: string, code?: string): Promise<void>`
  - `async function listUndispatchedPlans(): Promise<string[]>`
  - `async function latestPlan(repositoryId: string): Promise<AuthoringRun | null>`
  - `async function getPlan(repositoryId: string, runId: string): Promise<{ run: AuthoringRun; remedies: Remedy[] } | null>`

- [ ] **Step 1: Write the failing test**

Create `src/db/authoring-lifecycle.integration.test.ts`. It needs no session mocks for the worker primitives, but `getPlan` and `latestPlan` authorize, so keep the same preamble as Task 3's test — copy it verbatim from that file, replacing the final `import { requestPlan }` line with:

```typescript
import {
  beginAuthoring,
  completeAuthoringRun,
  failAuthoringRun,
  getPlan,
  latestPlan,
  listUndispatchedPlans,
  loadAuthoringRun,
  pinAuthoringSha,
  validateAuthoringRun,
} from './queries/authoring-runs';
```

and add this helper plus these tests:

```typescript
const sha = 'b'.repeat(40);

async function queuedRun(repositoryId: string) {
  const id = randomUUID();
  await db().insert(authoringRuns).values({
    id,
    repositoryId,
    kind: 'plan',
    requestedBy: context.user,
    requestedWorkspaceId: context.workspace,
    state: 'queued',
    authorVersion: 'readiness-floor-v01',
  });
  return id;
}

const remedy = {
  checkId: 'root-agent-instructions',
  path: 'AGENTS.md',
  rationale: 'No nonempty root AGENTS.md or CLAUDE.md was found.',
  ordinal: 0,
};

test('moves a queued run to running and records when it started', async () => {
  const runId = await queuedRun(await seed());
  const run = await beginAuthoring(runId);
  expect(run?.state).toBe('running');
  expect(run?.startedAt).toBeInstanceOf(Date);
});

test('pins a sha once and refuses a malformed one', async () => {
  const runId = await queuedRun(await seed());
  await beginAuthoring(runId);
  expect(await pinAuthoringSha(runId, sha)).toBe(sha);
  await expect(pinAuthoringSha(runId, 'not-a-sha')).rejects.toThrow('Invalid commit SHA');
});

test('completes a run and stores its remedies in order', async () => {
  const runId = await queuedRun(await seed());
  await beginAuthoring(runId);
  await pinAuthoringSha(runId, sha);
  await completeAuthoringRun(runId, [remedy, { ...remedy, checkId: 'root-readme', path: 'README.md', ordinal: 1 }]);
  const run = await loadAuthoringRun(runId);
  expect(run?.state).toBe('complete');
  expect(run?.completedAt).toBeInstanceOf(Date);
  const stored = await db()
    .select()
    .from(authoringRemedies)
    .where(eq(authoringRemedies.authoringRunId, runId));
  expect(stored.map((row) => row.ordinal).sort()).toEqual([0, 1]);
});

test('refuses to complete a run that proposed nothing, because a plan with no remedies is not a plan', async () => {
  const runId = await queuedRun(await seed());
  await beginAuthoring(runId);
  await pinAuthoringSha(runId, sha);
  await expect(completeAuthoringRun(runId, [])).rejects.toThrow('Plan proposed nothing');
  expect((await loadAuthoringRun(runId))?.state).toBe('running');
});

test('fails a run with a safe code and rewrites an unknown one', async () => {
  const first = await queuedRun(await seed());
  await failAuthoringRun(first, 'access_revoked');
  expect((await loadAuthoringRun(first))?.errorCode).toBe('access_revoked');
  const second = await queuedRun(await seed());
  await failAuthoringRun(second, 'postgres said: connection to 10.0.0.1 refused');
  expect((await loadAuthoringRun(second))?.errorCode).toBe('plan_failed');
});

test('lists only runs that were never dispatched', async () => {
  const runId = await queuedRun(await seed());
  expect(await listUndispatchedPlans()).toContain(runId);
  await db()
    .update(authoringRuns)
    .set({ dispatchedAt: new Date() })
    .where(eq(authoringRuns.id, runId));
  expect(await listUndispatchedPlans()).not.toContain(runId);
});

test('refuses to validate a run whose repository opted back out', async () => {
  const repositoryId = await seed();
  const runId = await queuedRun(repositoryId);
  const run = await loadAuthoringRun(runId);
  await expect(validateAuthoringRun(run!)).resolves.toBeUndefined();
  await db()
    .update(repositories)
    .set({ actEnabled: false })
    .where(eq(repositories.id, repositoryId));
  await expect(validateAuthoringRun(run!)).rejects.toThrow('Plan access revoked');
});

test('reads back a completed plan with its remedies, and refuses one from another repository', async () => {
  const repositoryId = await seed();
  const runId = await queuedRun(repositoryId);
  await beginAuthoring(runId);
  await pinAuthoringSha(runId, sha);
  await completeAuthoringRun(runId, [remedy]);
  const plan = await getPlan(repositoryId, runId);
  expect(plan?.remedies).toHaveLength(1);
  expect(plan?.remedies[0].path).toBe('AGENTS.md');
  expect(await getPlan(await seed(), runId)).toBeNull();
  expect((await latestPlan(repositoryId))?.id).toBe(runId);
});
```

Add `authoringRemedies` to the schema import list at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run --config vitest.integration.config.ts src/db/authoring-lifecycle.integration.test.ts`
Expected: FAIL — `beginAuthoring` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/db/queries/authoring-runs.ts`:

```typescript
import { asc, isNull } from 'drizzle-orm';
import type { ProposedRemedy } from '../../domain/act/remedies';

// Trusted worker primitives; never expose these directly as browser actions.

export async function loadAuthoringRun(runId: string): Promise<AuthoringRun | null> {
  return (await db().select().from(runs).where(eq(runs.id, runId)))[0] ?? null;
}

// A plan run writes nothing to GitHub, so this deliberately does not re-fetch
// granted permissions: write access is the execute run's gate, and a GitHub
// outage must not fail a plan run that retries three times. Opt-in is checked,
// because a repository switched off mid-run should stop.
export async function validateAuthoringRun(run: AuthoringRun): Promise<void> {
  const [available] = await db()
    .select({ id: repositories.id })
    .from(repositories)
    .innerJoin(installations, eq(installations.id, repositories.installationId))
    .innerJoin(
      workspaceRepositories,
      and(
        eq(workspaceRepositories.repositoryId, repositories.id),
        eq(workspaceRepositories.workspaceId, run.requestedWorkspaceId),
      ),
    )
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, run.requestedWorkspaceId),
        eq(workspaceMemberships.userId, run.requestedBy),
      ),
    )
    .where(
      and(
        eq(repositories.id, run.repositoryId),
        eq(repositories.active, true),
        eq(repositories.isDemo, false),
        eq(repositories.actEnabled, true),
        eq(installations.active, true),
      ),
    );
  if (!available || process.env.DEMO_MODE === 'true') throw new Error('Plan access revoked');
}

export async function beginAuthoring(runId: string): Promise<AuthoringRun | null> {
  const run = await loadAuthoringRun(runId);
  if (!run || !['queued', 'running'].includes(run.state)) return run;
  await validateAuthoringRun(run);
  await db()
    .update(runs)
    .set({ state: 'running', startedAt: new Date() })
    .where(and(eq(runs.id, runId), eq(runs.state, 'queued')));
  return loadAuthoringRun(runId);
}

export async function pinAuthoringSha(runId: string, sha: string): Promise<string | null> {
  if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error('Invalid commit SHA');
  await db()
    .update(runs)
    .set({ sha })
    .where(and(eq(runs.id, runId), eq(runs.state, 'running'), isNull(runs.sha)));
  return (await loadAuthoringRun(runId))?.sha ?? null;
}

// The database cannot express "a complete plan has at least one remedy" —
// the result is child rows, not a column — so it is enforced here, and the
// run stays running rather than completing empty.
export async function completeAuthoringRun(
  runId: string,
  remedies: ProposedRemedy[],
): Promise<void> {
  if (!remedies.length) throw new Error('Plan proposed nothing');
  const run = await loadAuthoringRun(runId);
  if (!run || run.state !== 'running') return;
  await db().transaction(async (tx) => {
    await tx
      .insert(authoringRemedies)
      .values(remedies.map((remedy) => ({ id: randomUUID(), authoringRunId: runId, ...remedy })))
      .onConflictDoNothing();
    await tx
      .update(runs)
      .set({ state: 'complete', completedAt: new Date() })
      .where(and(eq(runs.id, runId), eq(runs.state, 'running')));
  });
}

export async function failAuthoringRun(runId: string, code = 'plan_failed'): Promise<void> {
  // An unrecognised code is rewritten, so a provider or driver message can
  // never reach a column a view renders.
  const safe = ['plan_failed', 'access_revoked', 'grade_missing', 'nothing_to_fix'].includes(code)
    ? code
    : 'plan_failed';
  await db()
    .update(runs)
    .set({ state: 'failed', errorCode: safe, completedAt: new Date() })
    .where(and(eq(runs.id, runId), inArray(runs.state, ['queued', 'running'])));
}

export async function listUndispatchedPlans(): Promise<string[]> {
  return (
    await db()
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.state, 'queued'), isNull(runs.dispatchedAt)))
      .orderBy(asc(runs.createdAt))
      .limit(100)
  ).map((run) => run.id);
}

// Browser-facing reads. Both authorize first.

export async function latestPlan(repositoryId: string): Promise<AuthoringRun | null> {
  await requireRepository(repositoryId);
  const [run] = await db()
    .select()
    .from(runs)
    .where(and(eq(runs.repositoryId, repositoryId), eq(runs.kind, 'plan')))
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .limit(1);
  return run ?? null;
}

export async function getPlan(
  repositoryId: string,
  runId: string,
): Promise<{ run: AuthoringRun; remedies: Remedy[] } | null> {
  await requireRepository(repositoryId);
  const [run] = await db()
    .select()
    .from(runs)
    .where(and(eq(runs.repositoryId, repositoryId), eq(runs.id, runId)));
  if (!run) return null;
  const remedies = await db()
    .select()
    .from(authoringRemedies)
    .where(eq(authoringRemedies.authoringRunId, runId))
    .orderBy(asc(authoringRemedies.ordinal));
  return { run, remedies };
}
```

Merge the new `drizzle-orm` imports into the single existing import statement at the top of the file rather than adding a second one — ESLint will reject a duplicate import.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run --config vitest.integration.config.ts src/db/authoring-lifecycle.integration.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full check and commit**

```bash
pnpm check
git add src/db/queries/authoring-runs.ts src/db/authoring-lifecycle.integration.test.ts
git commit -m "feat(act): add the plan run lifecycle and its read queries

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Dispatch, the event, and reconciliation

One event carrying only the run id, sent under the same predicate that selected the row, plus the cron that recovers a row whose event was never acknowledged. `src/inngest/dispatch-grade.ts` and `src/inngest/functions/reconcile-grades.ts` are the templates; both are short, so read them whole.

**Files:**
- Modify: `src/inngest/events.ts`
- Create: `src/inngest/dispatch-authoring.ts`
- Create: `src/inngest/functions/reconcile-authoring.ts`
- Test: `src/inngest/dispatch-authoring.test.ts`

**Interfaces:**
- Consumes: `listUndispatchedPlans` from Task 4.
- Produces:
  - `const authoringPlanRequestedData: z.ZodObject<{ runId: z.ZodString }>`
  - `type SendAuthoringEvent = (event: { id: string; name: 'repository/authoring.plan.requested'; data: { runId: string } }) => Promise<unknown>`
  - `async function dispatchAuthoringPlan(runId: string, send?: SendAuthoringEvent): Promise<void>`
  - `const reconcileAuthoring` — an Inngest function
  - `'repository/authoring.plan.requested'` on `ReliabilityEvents`

- [ ] **Step 1: Write the failing test**

Create `src/inngest/dispatch-authoring.test.ts`. This is a unit test: it mocks the database entirely, the way the dispatch contract deserves to be tested — what matters is *that the event is sent exactly once and only for a row that is still queued and undispatched*.

```typescript
import { beforeEach, expect, test, vi } from 'vitest';

const rows = vi.hoisted(() => ({ selected: [] as { id: string }[], updates: 0 }));
vi.mock('../db', () => ({
  db: () => ({
    select: () => ({ from: () => ({ where: async () => rows.selected }) }),
    update: () => ({
      set: () => ({
        where: async () => {
          rows.updates += 1;
        },
      }),
    }),
  }),
}));

import { dispatchAuthoringPlan } from './dispatch-authoring';

beforeEach(() => {
  rows.selected = [];
  rows.updates = 0;
});

test('sends one event keyed on the run id and marks the row dispatched', async () => {
  rows.selected = [{ id: 'run-1' }];
  const send = vi.fn().mockResolvedValue(undefined);
  await dispatchAuthoringPlan('run-1', send);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith({
    id: 'run-1',
    name: 'repository/authoring.plan.requested',
    data: { runId: 'run-1' },
  });
  expect(rows.updates).toBe(1);
});

test('sends nothing when the row is no longer queued and undispatched', async () => {
  const send = vi.fn();
  await dispatchAuthoringPlan('run-1', send);
  expect(send).not.toHaveBeenCalled();
  expect(rows.updates).toBe(0);
});

test('leaves the row undispatched when the send fails, so reconciliation retries it', async () => {
  rows.selected = [{ id: 'run-1' }];
  const send = vi.fn().mockRejectedValue(new Error('inngest down'));
  await expect(dispatchAuthoringPlan('run-1', send)).rejects.toThrow('inngest down');
  expect(rows.updates).toBe(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/inngest/dispatch-authoring.test.ts`
Expected: FAIL — cannot resolve `./dispatch-authoring`.

- [ ] **Step 3: Add the event**

In `src/inngest/events.ts`, beside `gradeRequestedData`:

```typescript
export const authoringPlanRequestedData = z.object({ runId: z.string().min(1) });
```

and inside `ReliabilityEvents`:

```typescript
  'repository/authoring.plan.requested': z.infer<typeof authoringPlanRequestedData>;
```

- [ ] **Step 4: Write the dispatcher**

Create `src/inngest/dispatch-authoring.ts`:

```typescript
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { authoringRuns } from '../db/schema';
import { inngest } from './client';

export type SendAuthoringEvent = (event: {
  id: string;
  name: 'repository/authoring.plan.requested';
  data: { runId: string };
}) => Promise<unknown>;

export async function dispatchAuthoringPlan(
  runId: string,
  send: SendAuthoringEvent = (event) => inngest.send(event),
): Promise<void> {
  const [run] = await db()
    .select({ id: authoringRuns.id })
    .from(authoringRuns)
    .where(
      and(
        eq(authoringRuns.id, runId),
        eq(authoringRuns.state, 'queued'),
        isNull(authoringRuns.dispatchedAt),
      ),
    );
  if (!run) return;
  await send({ id: runId, name: 'repository/authoring.plan.requested', data: { runId } });
  await db()
    .update(authoringRuns)
    .set({ dispatchedAt: new Date() })
    .where(
      and(
        eq(authoringRuns.id, runId),
        eq(authoringRuns.state, 'queued'),
        isNull(authoringRuns.dispatchedAt),
      ),
    );
}
```

- [ ] **Step 5: Write the reconciler**

Create `src/inngest/functions/reconcile-authoring.ts`:

```typescript
import { inngest } from '../client';
import { dispatchAuthoringPlan } from '../dispatch-authoring';
import { listUndispatchedPlans } from '../../db/queries/authoring-runs';

export const reconcileAuthoring = inngest.createFunction(
  { id: 'reconcile-authoring', triggers: [{ cron: '* * * * *' }] },
  async ({ step }) => {
    if (process.env.DEMO_MODE === 'true') return { demo: true };
    const ids = await step.run('find-undispatched-plans', listUndispatchedPlans);
    for (const runId of ids)
      await step.run(`dispatch-${runId}`, async () => {
        try {
          await dispatchAuthoringPlan(runId);
        } catch {
          /* Retry unacknowledged events on the next tick. */
        }
      });
    return { count: ids.length };
  },
);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run src/inngest/dispatch-authoring.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Run the full check and commit**

```bash
pnpm check
git add src/inngest/events.ts src/inngest/dispatch-authoring.ts src/inngest/functions/reconcile-authoring.ts src/inngest/dispatch-authoring.test.ts
git commit -m "feat(act): dispatch and reconcile plan runs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The durable job

The four-step Inngest function. `src/inngest/functions/grade-repository.ts` is the template and you should mirror its shape closely, including `validated()`, `singleton`, `retries` and `onFailure`.

This task also extracts a trusted worker primitive from `grade-runs.ts`, because the job needs the latest completed grade and `latestGrade()` calls `requireRepository()`, which reads cookies — a background job has none.

**Step names are `begin`, `pin-commit`, `explore` and `complete`, and they must not change in plan 2b.** Inngest keys durable step memoization on these names; renaming one breaks runs already in flight.

**Files:**
- Modify: `src/db/queries/grade-runs.ts`
- Create: `src/inngest/functions/plan-repository.ts`
- Modify: `src/app/api/inngest/route.ts`
- Test: `src/inngest/functions/plan-repository.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2, 4 and 5; `resolveReadinessSha` from `src/github/collect-readiness.ts`.
- Produces:
  - `async function latestCompletedGrade(repositoryId: string): Promise<CompletedGrade | null>` on `grade-runs.ts` — no session, no workspace
  - `async function resolvePlanCommit(runId: string): Promise<string | null>`
  - `async function explorePlan(runId: string): Promise<void>`
  - `const planRepositoryFunction`

- [ ] **Step 1: Write the failing test**

Create `src/inngest/functions/plan-repository.test.ts`:

```typescript
import { beforeEach, expect, test, vi } from 'vitest';

const deps = vi.hoisted(() => ({
  load: vi.fn(),
  validate: vi.fn(),
  fail: vi.fn(),
  pin: vi.fn(),
  complete: vi.fn(),
  grade: vi.fn(),
  sha: vi.fn(),
}));

vi.mock('../../db/queries/authoring-runs', () => ({
  loadAuthoringRun: deps.load,
  validateAuthoringRun: deps.validate,
  failAuthoringRun: deps.fail,
  beginAuthoring: vi.fn(),
  pinAuthoringSha: deps.pin,
  completeAuthoringRun: deps.complete,
}));
vi.mock('../../db/queries/grade-runs', () => ({ latestCompletedGrade: deps.grade }));
vi.mock('../../github/collect-readiness', () => ({ resolveReadinessSha: deps.sha }));

import { explorePlan, resolvePlanCommit } from './plan-repository';

const running = { id: 'run', repositoryId: 'repo', state: 'running', sha: 'c'.repeat(40) };

const failingGrade = {
  checks: [
    {
      id: 'root-agent-instructions',
      status: 'fail',
      explanation: 'No nonempty root AGENTS.md or CLAUDE.md was found.',
      points: 0,
      maxPoints: 20,
      paths: [],
      lineRanges: [],
    },
    {
      id: 'root-readme',
      status: 'pass',
      explanation: 'Found a root README.md.',
      points: 20,
      maxPoints: 20,
      paths: [],
      lineRanges: [],
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  deps.load.mockResolvedValue(running);
  deps.validate.mockResolvedValue(undefined);
  deps.grade.mockResolvedValue(failingGrade);
});

test('writes one remedy per failing check and completes the run', async () => {
  await explorePlan('run');
  expect(deps.complete).toHaveBeenCalledWith('run', [
    {
      checkId: 'root-agent-instructions',
      path: 'AGENTS.md',
      rationale: 'No nonempty root AGENTS.md or CLAUDE.md was found.',
      ordinal: 0,
    },
  ]);
});

test('fails the run when authorization was revoked, and does not complete it', async () => {
  deps.validate.mockRejectedValue(new Error('Plan access revoked'));
  await expect(explorePlan('run')).rejects.toThrow();
  expect(deps.fail).toHaveBeenCalledWith('run', 'access_revoked');
  expect(deps.complete).not.toHaveBeenCalled();
});

test('fails the run when the grade it was queued against has gone', async () => {
  deps.grade.mockResolvedValue(null);
  await explorePlan('run');
  expect(deps.fail).toHaveBeenCalledWith('run', 'grade_missing');
  expect(deps.complete).not.toHaveBeenCalled();
});

test('fails the run rather than completing empty when nothing is left to fix', async () => {
  deps.grade.mockResolvedValue({ checks: [failingGrade.checks[1]] });
  await explorePlan('run');
  expect(deps.fail).toHaveBeenCalledWith('run', 'nothing_to_fix');
  expect(deps.complete).not.toHaveBeenCalled();
});

test('does nothing for a run that already finished', async () => {
  deps.load.mockResolvedValue({ ...running, state: 'complete' });
  await explorePlan('run');
  expect(deps.complete).not.toHaveBeenCalled();
  expect(deps.fail).not.toHaveBeenCalled();
});

test('resolves and pins the commit, and reuses one already pinned', async () => {
  deps.load.mockResolvedValue({ ...running, sha: null });
  deps.sha.mockResolvedValue('d'.repeat(40));
  deps.pin.mockResolvedValue('d'.repeat(40));
  expect(await resolvePlanCommit('run')).toBe('d'.repeat(40));
  deps.load.mockResolvedValue(running);
  expect(await resolvePlanCommit('run')).toBe('c'.repeat(40));
  expect(deps.sha).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/inngest/functions/plan-repository.test.ts`
Expected: FAIL — cannot resolve `./plan-repository`.

- [ ] **Step 3: Extract the trusted grade primitive**

In `src/db/queries/grade-runs.ts`, replace the body of `latestGrade` so the unauthorized read is reusable:

```typescript
// Trusted worker primitive: no session and no workspace, because a background
// job has neither. Callers must have authorized by another route first —
// validateGradeRun or validateAuthoringRun.
export async function latestCompletedGrade(repositoryId: string): Promise<CompletedGrade | null> {
  const [run] = await db()
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.repositoryId, repositoryId),
        eq(runs.family, readinessRubric.family),
        eq(runs.state, 'complete'),
      ),
    )
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .limit(1);
  return run ? completed(run) : null;
}

export async function latestGrade(repositoryId: string): Promise<CompletedGrade | null> {
  await requireRepository(repositoryId);
  return latestCompletedGrade(repositoryId);
}
```

- [ ] **Step 4: Write the job**

Create `src/inngest/functions/plan-repository.ts`:

```typescript
import { NonRetriableError } from 'inngest';
import { inngest } from '../client';
import { authoringPlanRequestedData } from '../events';
import {
  beginAuthoring,
  completeAuthoringRun,
  failAuthoringRun,
  loadAuthoringRun,
  pinAuthoringSha,
  validateAuthoringRun,
} from '../../db/queries/authoring-runs';
import { latestCompletedGrade } from '../../db/queries/grade-runs';
import { resolveReadinessSha } from '../../github/collect-readiness';
import { proposeRemedies } from '../../domain/act/remedies';

async function validated(runId: string) {
  const run = await loadAuthoringRun(runId);
  if (!run || !['queued', 'running'].includes(run.state)) return null;
  try {
    await validateAuthoringRun(run);
  } catch {
    await failAuthoringRun(runId, 'access_revoked');
    throw new NonRetriableError('Plan unavailable');
  }
  return run;
}

export async function resolvePlanCommit(runId: string) {
  const run = await validated(runId);
  if (!run) return null;
  if (run.sha) return run.sha;
  try {
    return await pinAuthoringSha(runId, await resolveReadinessSha(run.repositoryId));
  } catch {
    // Never let provider exceptions (request headers or source) enter Inngest logs.
    throw new Error('Plan commit resolution failed');
  }
}

// The deterministic floor. No sandbox, no model, no repository source: the
// grade already observed what is missing, and this turns that into one remedy
// per failing check. Plan 2b replaces the body and keeps the step name.
export async function explorePlan(runId: string) {
  const run = await validated(runId);
  if (!run) return;
  if (!run.sha) throw new NonRetriableError('Plan commit is missing');
  const grade = await latestCompletedGrade(run.repositoryId);
  if (!grade) {
    await failAuthoringRun(runId, 'grade_missing');
    return;
  }
  const remedies = proposeRemedies(grade);
  if (!remedies.length) {
    // The grade was re-run and now passes, or its rubric moved on. A run that
    // completes with no remedies would read as a plan that found nothing to
    // do, which is a different claim.
    await failAuthoringRun(runId, 'nothing_to_fix');
    return;
  }
  // Recheck authorization after the reads; remedies contain metadata only.
  if (!(await validated(runId))) return;
  await completeAuthoringRun(runId, remedies);
}

export const planRepositoryFunction = inngest.createFunction(
  {
    id: 'plan-repository',
    triggers: [{ event: 'repository/authoring.plan.requested' }],
    retries: 3,
    singleton: { key: 'event.data.runId', mode: 'skip' },
    onFailure: async ({ event }) => {
      await failAuthoringRun(authoringPlanRequestedData.parse(event.data.event.data).runId);
    },
  },
  async ({ event, step }) => {
    const { runId } = authoringPlanRequestedData.parse(event.data);
    const active = await step.run('begin', async () => {
      if (!(await validated(runId))) return false;
      return (await beginAuthoring(runId))?.state === 'running';
    });
    if (!active) return;
    await step.run('pin-commit', () => resolvePlanCommit(runId));
    // Returns nothing: findings go to Postgres, never into a step output.
    await step.run('explore', () => explorePlan(runId));
  },
);
```

Note there is no separate `complete` step: `explore` ends by completing the run, exactly as `grade-repository.ts` folds its completion into `collect-evaluate-complete`. The spec's four step names describe the workflow; the durable function has three because the third does two things and must do them atomically enough that a retry between them cannot complete a run with no remedies.

- [ ] **Step 5: Register both functions**

In `src/app/api/inngest/route.ts`, add the imports and both entries to the `functions` array:

```typescript
import { planRepositoryFunction } from '../../../inngest/functions/plan-repository';
import { reconcileAuthoring } from '../../../inngest/functions/reconcile-authoring';
```

```typescript
    planRepositoryFunction,
    reconcileAuthoring,
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run src/inngest/functions/plan-repository.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Run the full check and commit**

```bash
pnpm check
git add src/inngest/functions/plan-repository.ts src/inngest/functions/plan-repository.test.ts src/db/queries/grade-runs.ts src/app/api/inngest/route.ts
git commit -m "feat(act): run the plan workflow on the deterministic floor

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The entry point

The button that asks for a plan, on the grading page where the availability line already is. `runGrade` in `src/app/repos/[repoId]/grading/actions.ts` is the template for the action.

**Files:**
- Modify: `src/app/repos/[repoId]/grading/actions.ts`
- Create: `src/components/act/act-entry.tsx`
- Modify: `src/app/repos/[repoId]/grading/page.tsx`
- Test: `src/components/act/act-entry.test.ts`

**Interfaces:**
- Consumes: `requestPlan`, `latestPlan` from Task 4; `dispatchAuthoringPlan` from Task 5; `ActAvailability` from `src/domain/act/availability.ts`.
- Produces:
  - `async function requestPlanRun(repositoryId: string): Promise<{ runId: string }>`
  - `function ActEntry(props: { repositoryId: string; availability: ActAvailability; latest: { id: string; state: string } | null }): JSX.Element | null`

- [ ] **Step 1: Write the failing test**

Create `src/components/act/act-entry.test.ts`. The `vi.mock` specifier below is
the exact string `act-entry.tsx` uses to import the action — a mock registered
under a different specifier that resolves to the same file still applies, but
keeping them identical is what makes that obvious to the next reader:

```typescript
import { expect, test, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../app/repos/[repoId]/grading/actions', () => ({
  requestPlanRun: vi.fn(),
  runGrade: vi.fn(),
}));

import { ActEntry } from './act-entry';

const render = (props: Parameters<typeof ActEntry>[0]) =>
  renderToStaticMarkup(createElement(ActEntry, props));

test('offers a plan when Act is available and no plan exists', () => {
  const html = render({
    repositoryId: 'repo',
    availability: { available: true },
    latest: null,
  });
  expect(html).toContain('Plan the fixes');
});

test('renders nothing when Act is unavailable, because the availability line already explains why', () => {
  const html = render({
    repositoryId: 'repo',
    availability: { available: false, reason: 'not_enabled' },
    latest: null,
  });
  expect(html).toBe('');
});

test('links to a completed plan rather than offering another', () => {
  const html = render({
    repositoryId: 'repo',
    availability: { available: true },
    latest: { id: 'run-1', state: 'complete' },
  });
  expect(html).toContain('/repos/repo/act/run-1');
  expect(html).not.toContain('Plan the fixes');
});

test('says a plan is already running instead of offering a second', () => {
  const html = render({
    repositoryId: 'repo',
    availability: { available: true },
    latest: { id: 'run-1', state: 'running' },
  });
  expect(html).toContain('Planning');
  expect(html).not.toContain('Plan the fixes');
});

test('offers a plan again after one failed', () => {
  const html = render({
    repositoryId: 'repo',
    availability: { available: true },
    latest: { id: 'run-1', state: 'failed' },
  });
  expect(html).toContain('Plan the fixes');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/act/act-entry.test.ts`
Expected: FAIL — cannot resolve `./act-entry`.

- [ ] **Step 3: Write the server action**

Append to `src/app/repos/[repoId]/grading/actions.ts`:

```typescript
import { requestPlan } from '../../../../db/queries/authoring-runs';
import { dispatchAuthoringPlan } from '../../../../inngest/dispatch-authoring';

export async function requestPlanRun(repositoryId: string): Promise<{ runId: string }> {
  // requestPlan checks workspace membership, repository connection, demo mode,
  // the Act opt-in and the permissions GitHub actually granted.
  const run = await requestPlan(repositoryId);
  try {
    await dispatchAuthoringPlan(run.id);
  } catch {
    // Durable queued run is recovered by reconciliation; retain its polling identity.
  }
  return { runId: run.id };
}
```

- [ ] **Step 4: Write the component**

Create `src/components/act/act-entry.tsx`:

```typescript
import Link from 'next/link';
import { requestPlanRun } from '../../app/repos/[repoId]/grading/actions';
import type { ActAvailability } from '../../domain/act/availability';

// Nothing is rendered when Act is unavailable: the grading page already shows
// availabilityMessage() above, and a disabled button beside an explanation
// would say the same thing twice.
export function ActEntry({
  repositoryId,
  availability,
  latest,
}: {
  repositoryId: string;
  availability: ActAvailability;
  latest: { id: string; state: string } | null;
}) {
  if (!availability.available) return null;
  const href = `/repos/${encodeURIComponent(repositoryId)}/act/${encodeURIComponent(latest?.id ?? '')}`;
  if (latest?.state === 'queued' || latest?.state === 'running')
    return <p className="muted">Planning the fixes. This page will show the plan when it is ready.</p>;
  if (latest?.state === 'complete')
    return (
      <p>
        <Link href={href}>Read the plan</Link>
      </p>
    );
  return (
    <form action={requestPlanRun.bind(null, repositoryId)}>
      <button type="submit">Plan the fixes</button>
    </form>
  );
}
```

- [ ] **Step 5: Wire it into the page**

In `src/app/repos/[repoId]/grading/page.tsx`, add to the imports:

```typescript
import { latestPlan } from '../../../../db/queries/authoring-runs';
import { ActEntry } from '../../../../components/act/act-entry';
```

Add `latestPlan(repoId)` as a fifth entry in the existing `Promise.all`, destructured as `plan`, then render the entry point immediately after the availability message line:

```tsx
      {grade && enabled && message && <p className="muted">{message}</p>}
      {grade && (
        <ActEntry
          repositoryId={repoId}
          availability={availability}
          latest={plan ? { id: plan.id, state: plan.state } : null}
        />
      )}
```

- [ ] **Step 6: Update the existing page test**

`src/app/repos/[repoId]/grading/page.test.ts` mocks every module the page imports. Add to its `deps` object and mocks:

```typescript
  latestPlan: vi.fn(),
```

```typescript
vi.mock('../../../../db/queries/authoring-runs', () => ({ latestPlan: deps.latestPlan }));
vi.mock('../../../../components/act/act-entry', () => ({
  ActEntry: ({ availability }: { availability: { available: boolean } }) =>
    createElement('p', null, availability.available ? 'act-available' : 'act-unavailable'),
}));
```

and in its `beforeEach`, `deps.latestPlan.mockResolvedValue(null);`.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
pnpm vitest run src/components/act/act-entry.test.ts "src/app/repos/[repoId]/grading"
```

Expected: PASS — the five new tests and the existing page tests.

- [ ] **Step 8: Run the full check and commit**

```bash
pnpm check
git add "src/app/repos/[repoId]/grading" src/components/act
git commit -m "feat(act): offer a plan from the readiness page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The plan view

The route that renders a plan. Checkboxes are disabled: ticking and approving are the next slice, and a checkbox that does nothing when clicked is worse than one that visibly cannot be.

`/repos/[repoId]/act/[runId]` needs no entry in `src/components/repository/tabs.ts` — `focusIndex` already falls back to the first tab for a route with no tab entry, so the tab bar stays reachable by keyboard.

**Files:**
- Create: `src/components/act/plan-view.tsx`
- Create: `src/app/repos/[repoId]/act/[runId]/page.tsx`
- Test: `src/components/act/plan-view.test.ts`

**Interfaces:**
- Consumes: `getPlan` from Task 4; `AuthoringRun`, `Remedy` types from Task 3; `checkTitles` from `src/domain/grading/check-titles.ts`.
- Produces: `function PlanView(props: { run: AuthoringRun; remedies: Remedy[] }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `src/components/act/plan-view.test.ts`:

```typescript
import { expect, test } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanView } from './plan-view';

const run = {
  id: 'run-1',
  state: 'complete',
  sha: 'e'.repeat(40),
  model: null,
  authorVersion: 'readiness-floor-v01',
  errorCode: null,
  completedAt: new Date('2026-09-11T10:00:00Z'),
} as Parameters<typeof PlanView>[0]['run'];

const remedies = [
  {
    id: 'r1',
    authoringRunId: 'run-1',
    checkId: 'root-agent-instructions',
    path: 'AGENTS.md',
    rationale: 'No nonempty root AGENTS.md or CLAUDE.md was found.',
    ordinal: 0,
  },
] as Parameters<typeof PlanView>[0]['remedies'];

const render = (props: Parameters<typeof PlanView>[0]) =>
  renderToStaticMarkup(createElement(PlanView, props));

test('names each remedy by its path and the readiness check it answers', () => {
  const html = render({ run, remedies });
  expect(html).toContain('AGENTS.md');
  expect(html).toContain('Agent instructions');
});

test('shows the rationale the grade observed, verbatim', () => {
  expect(render({ run, remedies })).toContain(
    'No nonempty root AGENTS.md or CLAUDE.md was found.',
  );
});

test('disables every checkbox, because approving is not built yet', () => {
  const html = render({ run, remedies });
  expect(html).toContain('disabled=""');
  expect(html).not.toContain('<form');
});

test('says no model wrote this plan when model is null', () => {
  expect(render({ run, remedies })).toContain('No model wrote this plan');
});

test('names the model when one did', () => {
  const html = render({ run: { ...run, model: 'claude-opus-5' }, remedies });
  expect(html).toContain('claude-opus-5');
  expect(html).not.toContain('No model wrote this plan');
});

test('reports a run that failed instead of rendering an empty plan', () => {
  const html = render({
    run: { ...run, state: 'failed', errorCode: 'grade_missing' },
    remedies: [],
  });
  expect(html).toContain('grade_missing');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/act/plan-view.test.ts`
Expected: FAIL — cannot resolve `./plan-view`.

- [ ] **Step 3: Write the component**

Create `src/components/act/plan-view.tsx`:

```typescript
import { checkTitles } from '../../domain/grading/check-titles';
import type { AuthoringRun, Remedy } from '../../db/queries/authoring-runs';

export function PlanView({ run, remedies }: { run: AuthoringRun; remedies: Remedy[] }) {
  if (run.state !== 'complete')
    return (
      <section>
        <h2>No plan yet.</h2>
        <p>
          This run is {run.state}
          {run.errorCode ? ` (${run.errorCode})` : ''}.
        </p>
      </section>
    );
  return (
    <section>
      <ul className="plan-remedies">
        {remedies.map((remedy) => (
          <li key={remedy.id}>
            <label>
              {/* Disabled on purpose: selecting and approving remedies is not
                  built yet, and a checkbox that silently does nothing when
                  clicked is worse than one that shows it cannot be used. */}
              <input type="checkbox" disabled />
              <code>{remedy.path}</code> — {checkTitles[remedy.checkId] ?? remedy.checkId}
            </label>
            <p className="muted">{remedy.rationale}</p>
          </li>
        ))}
      </ul>
      <p className="muted">
        Planned at {run.sha?.slice(0, 7)} ·{' '}
        {run.model ? `Written by ${run.model}` : 'No model wrote this plan — it was derived from the grade.'}
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Write the route**

Create `src/app/repos/[repoId]/act/[runId]/page.tsx`:

```typescript
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireRepository } from '../../../../../workspaces/access';
import { getPlan } from '../../../../../db/queries/authoring-runs';
import { PlanView } from '../../../../../components/act/plan-view';
import { pageRouteId } from '../../../../../lib/page-route-id';

export const dynamic = 'force-dynamic';

export default async function Plan({
  params,
}: {
  params: Promise<{ repoId: string; runId: string }>;
}) {
  const { repoId: rawRepoId, runId } = await params;
  const repoId = pageRouteId(rawRepoId);
  const repo = await requireRepository(repoId);
  const plan = await getPlan(repoId, runId);
  if (!plan) notFound();
  return (
    <div className="metrics-page">
      <div className="eyebrow panel-eyebrow">Repository / Act</div>
      <h2>What fieldnote proposes.</h2>
      <p className="page-intro">
        One change per failing readiness check for {repo.owner} / {repo.name}.
      </p>
      <PlanView run={plan.run} remedies={plan.remedies} />
      <p>
        <Link href={`/repos/${encodeURIComponent(repoId)}/grading`}>Back to readiness</Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/components/act/plan-view.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Run the full check and commit**

```bash
pnpm check
git add "src/app/repos/[repoId]/act" src/components/act
git commit -m "feat(act): render a plan as the changes it proposes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

Before opening the pull request, prove the spec's success criteria rather than asserting them. Run each and paste the output into the PR body.

- [ ] **A plan run produces exactly one remedy per failing check, and none for a passing one** — `pnpm vitest run src/domain/act/remedies.test.ts src/inngest/functions/plan-repository.test.ts`
- [ ] **A second plan request while one is active is refused by the index, not by application code alone** — `pnpm vitest run --config vitest.integration.config.ts src/db/authoring-runs.integration.test.ts -t 'one active run'`
- [ ] **A repository whose installation grants no write access is refused at request time** — `pnpm vitest run --config vitest.integration.config.ts src/db/authoring-request.integration.test.ts -t 'grants only read'`
- [ ] **`completeAuthoringRun` refuses a run with no remedies** — `pnpm vitest run --config vitest.integration.config.ts src/db/authoring-lifecycle.integration.test.ts -t 'proposed nothing'`
- [ ] **`pnpm check` passes with no E2B key and no Anthropic key present** — `env -u E2B_API_KEY -u ANTHROPIC_API_KEY pnpm check`
- [ ] **The migration applies to an empty database** — `docker compose exec postgres dropdb -U reliability --if-exists plan_check && docker compose exec postgres createdb -U reliability plan_check && DATABASE_URL=postgres://reliability:reliability@127.0.0.1:5432/plan_check pnpm db:migrate`

Confirm the last one's connection string against your `.env` before running it; the credentials come from `compose.yaml`.

## Not in this plan

Ticking remedies, answering questions, approval, the execute run, the pull request, `authoring_notes`, the sandbox, the Agent SDK, and cost. The sandbox and the agent are plan 2b, and they change `explorePlan`'s body and nothing else in this plan's public surface.
