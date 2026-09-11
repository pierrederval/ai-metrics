# Act Availability Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fieldnote can decide, for any repository, whether Act may run — and an admin can switch Act on per repository.

**Architecture:** A pure domain function decides availability from three inputs: the repository's opt-in flag, the permissions GitHub actually granted the installation, and whether the latest grade has anything to fix. The GitHub payload is parsed by a pure Zod function so the provider shape is tested without a network. Persistence is one boolean column on `repositories`. The interface is an admin-only toggle in repository settings and an availability line on the grading page.

**Tech Stack:** TypeScript, Next.js 16 (App Router, server actions), Drizzle ORM on PostgreSQL, Zod 4, Vitest (unit and integration configs), Octokit.

**Spec:** `docs/superpowers/specs/2026-09-11-monitor-act-train-loop-design.md`

## Global Constraints

- No LLM scores anything. This plan adds no LLM call of any kind.
- Provider exceptions must never enter logs or step outputs. Parse provider payloads with Zod and throw generic errors, following `src/inngest/functions/grade-repository.ts:collectionFailure`.
- Unit tests never touch the database or the network. Persistence is tested in `*.integration.test.ts`, which runs under `vitest.integration.config.ts` against the Docker Postgres from `compose.yaml`.
- Pure domain logic lives under `src/domain/`, provider access under `src/github/`, persistence under `src/db/queries/`. Follow that split.
- `pnpm check` (lint, typecheck, unit, integration, build) must pass before the final commit of each task.
- Cost data is out of scope for this plan. Do not add cost columns here.
- End every commit message with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

### Task 1: Availability decision

The decision itself, as a pure function with no dependencies. Everything later in the loop asks this one question.

**Files:**
- Create: `src/domain/act/availability.ts`
- Test: `src/domain/act/availability.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type GrantedPermissions = { contents: string | null; pullRequests: string | null }`
  - `type ActAvailability = { available: true } | { available: false; reason: 'not_enabled' | 'write_not_granted' | 'nothing_to_fix' }`
  - `function actAvailability(input: { enabled: boolean; permissions: GrantedPermissions; failingCheckCount: number }): ActAvailability`

- [ ] **Step 1: Write the failing test**

Create `src/domain/act/availability.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { actAvailability, type GrantedPermissions } from './availability';

const write: GrantedPermissions = { contents: 'write', pullRequests: 'write' };
const read: GrantedPermissions = { contents: 'read', pullRequests: 'read' };

describe('actAvailability', () => {
  it('is available when opted in, granted write, and something fails', () => {
    expect(actAvailability({ enabled: true, permissions: write, failingCheckCount: 2 })).toEqual({
      available: true,
    });
  });

  it('reports opt-in before anything else, so a repository nobody asked for never demands write access', () => {
    expect(actAvailability({ enabled: false, permissions: read, failingCheckCount: 2 })).toEqual({
      available: false,
      reason: 'not_enabled',
    });
  });

  it('requires write on both contents and pull requests', () => {
    expect(
      actAvailability({
        enabled: true,
        permissions: { contents: 'write', pullRequests: 'read' },
        failingCheckCount: 1,
      }),
    ).toEqual({ available: false, reason: 'write_not_granted' });
    expect(
      actAvailability({
        enabled: true,
        permissions: { contents: 'read', pullRequests: 'write' },
        failingCheckCount: 1,
      }),
    ).toEqual({ available: false, reason: 'write_not_granted' });
  });

  it('accepts admin as write, which is what GitHub grants on some permissions', () => {
    expect(
      actAvailability({
        enabled: true,
        permissions: { contents: 'admin', pullRequests: 'admin' },
        failingCheckCount: 1,
      }),
    ).toEqual({ available: true });
  });

  it('treats an ungranted permission as not granted', () => {
    expect(
      actAvailability({
        enabled: true,
        permissions: { contents: null, pullRequests: null },
        failingCheckCount: 1,
      }),
    ).toEqual({ available: false, reason: 'write_not_granted' });
  });

  it('has nothing to do when no check fails', () => {
    expect(actAvailability({ enabled: true, permissions: write, failingCheckCount: 0 })).toEqual({
      available: false,
      reason: 'nothing_to_fix',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/domain/act/availability.test.ts`
Expected: FAIL — `Failed to resolve import "./availability"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/act/availability.ts`:

```typescript
// Act may run only when an admin asked for it, GitHub actually granted the
// write scopes, and the grade found something to fix. Order matters: a
// repository nobody opted into must never be reported as needing write
// access, because that reads as fieldnote demanding permissions it was not
// invited to use.
export type GrantedPermissions = { contents: string | null; pullRequests: string | null };

export type ActAvailability =
  | { available: true }
  | { available: false; reason: 'not_enabled' | 'write_not_granted' | 'nothing_to_fix' };

const writes = (permission: string | null) => permission === 'write' || permission === 'admin';

export function actAvailability(input: {
  enabled: boolean;
  permissions: GrantedPermissions;
  failingCheckCount: number;
}): ActAvailability {
  if (!input.enabled) return { available: false, reason: 'not_enabled' };
  if (!writes(input.permissions.contents) || !writes(input.permissions.pullRequests))
    return { available: false, reason: 'write_not_granted' };
  if (input.failingCheckCount < 1) return { available: false, reason: 'nothing_to_fix' };
  return { available: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/domain/act/availability.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/act/availability.ts src/domain/act/availability.test.ts
git commit -m "feat(act): decide Act availability from opt-in, scope and grade

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Reading the granted permissions

GitHub is the only authority on what an installation actually granted. The parse is pure so the provider shape is tested without a network; the fetch is a thin wired call.

**Files:**
- Create: `src/github/installation-permissions.ts`
- Test: `src/github/installation-permissions.test.ts`

**Interfaces:**
- Consumes: `GrantedPermissions` from Task 1 (`src/domain/act/availability.ts`).
- Produces:
  - `function parseGrantedPermissions(payload: unknown): GrantedPermissions`
  - `function fetchGrantedPermissions(installationId: string): Promise<GrantedPermissions>`

- [ ] **Step 1: Write the failing test**

Create `src/github/installation-permissions.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { parseGrantedPermissions } from './installation-permissions';

describe('parseGrantedPermissions', () => {
  it('reads the two permissions Act needs', () => {
    expect(
      parseGrantedPermissions({
        permissions: { contents: 'write', pull_requests: 'write', checks: 'read' },
      }),
    ).toEqual({ contents: 'write', pullRequests: 'write' });
  });

  it('reports an absent permission as null rather than guessing', () => {
    expect(parseGrantedPermissions({ permissions: { checks: 'read' } })).toEqual({
      contents: null,
      pullRequests: null,
    });
  });

  it('treats a malformed payload as granting nothing', () => {
    expect(parseGrantedPermissions({})).toEqual({ contents: null, pullRequests: null });
    expect(parseGrantedPermissions(null)).toEqual({ contents: null, pullRequests: null });
    expect(parseGrantedPermissions({ permissions: 'write' })).toEqual({
      contents: null,
      pullRequests: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/github/installation-permissions.test.ts`
Expected: FAIL — `Failed to resolve import "./installation-permissions"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/github/installation-permissions.ts`:

```typescript
import { z } from 'zod';
import { githubApp } from './app';
import type { GrantedPermissions } from '../domain/act/availability';

const granted = z.object({
  permissions: z
    .object({ contents: z.string().optional(), pull_requests: z.string().optional() })
    .optional(),
});

// A payload we cannot read grants nothing. Failing closed is the only safe
// default for a permission check.
export function parseGrantedPermissions(payload: unknown): GrantedPermissions {
  const parsed = granted.safeParse(payload);
  if (!parsed.success) return { contents: null, pullRequests: null };
  return {
    contents: parsed.data.permissions?.contents ?? null,
    pullRequests: parsed.data.permissions?.pull_requests ?? null,
  };
}

export async function fetchGrantedPermissions(installationId: string): Promise<GrantedPermissions> {
  try {
    const response = await githubApp().octokit.request(
      'GET /app/installations/{installation_id}',
      { installation_id: Number(installationId) },
    );
    return parseGrantedPermissions(response.data);
  } catch {
    // Never let provider exceptions (request headers or source) escape.
    throw new Error('Installation permissions unavailable');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/github/installation-permissions.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/github/installation-permissions.ts src/github/installation-permissions.test.ts
git commit -m "feat(act): read the write scopes an installation actually granted

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Per-repository opt-in

Act is off until someone asks for it. One boolean, defaulting to false, with the same admin check the rest of repository configuration uses.

**Files:**
- Modify: `src/db/schema.ts:55` (add the column beside `active` and `isDemo`)
- Create: `src/db/queries/act-settings.ts`
- Create: `drizzle/` migration (generated, do not hand-write)
- Test: `src/db/queries/act-settings.integration.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `function actEnabled(repositoryId: string): Promise<boolean>`
  - `function setActEnabled(repositoryId: string, enabled: boolean): Promise<void>`

- [ ] **Step 1: Add the column to the schema**

In `src/db/schema.ts`, in the `repositories` table, immediately after the `isDemo` line (`src/db/schema.ts:56`):

```typescript
  actEnabled: boolean('act_enabled').notNull().default(false),
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file under `drizzle/` adding `act_enabled boolean NOT NULL DEFAULT false` to `repositories`. Read it and confirm it contains no other change. If it contains unrelated drift, stop and report it rather than committing it.

- [ ] **Step 3: Write the failing test**

Create `src/db/queries/act-settings.integration.test.ts`:

```typescript
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../index';
import { installations, repositories } from '../schema';
import { actEnabled, setActEnabled } from './act-settings';

const repoId = 'repo-act-settings';

beforeEach(async () => {
  await db().delete(repositories).where(eq(repositories.id, repoId));
  await db()
    .insert(installations)
    .values({ id: 'inst-act-settings', accountLogin: 'acme' })
    .onConflictDoNothing();
  await db().insert(repositories).values({
    id: repoId,
    installationId: 'inst-act-settings',
    githubRepositoryId: 'gh-act-settings',
    owner: 'acme',
    name: 'checkout-service',
    defaultBranch: 'main',
    isPrivate: false,
  });
});

describe('act opt-in', () => {
  it('is off for a repository nobody asked about', async () => {
    expect(await actEnabled(repoId)).toBe(false);
  });

  it('turns on and back off', async () => {
    await setActEnabled(repoId, true);
    expect(await actEnabled(repoId)).toBe(true);
    await setActEnabled(repoId, false);
    expect(await actEnabled(repoId)).toBe(false);
  });

  it('reports off for a repository that does not exist', async () => {
    expect(await actEnabled('no-such-repo')).toBe(false);
  });
});
```

Match the setup style of the neighbouring `src/db/queries/*.integration.test.ts` files — if they share a fixture helper, use it instead of the inline inserts above.

- [ ] **Step 4: Run test to verify it fails**

Run: `docker compose up -d --wait && pnpm db:migrate && pnpm vitest run --config vitest.integration.config.ts src/db/queries/act-settings.integration.test.ts`
Expected: FAIL — `Failed to resolve import "./act-settings"`.

- [ ] **Step 5: Write minimal implementation**

Create `src/db/queries/act-settings.ts`:

```typescript
import { eq } from 'drizzle-orm';
import { db } from '../index';
import { repositories } from '../schema';

// A repository we cannot find is off, not an error: callers are asking
// whether Act may run, and the answer for an unknown repository is no.
export async function actEnabled(repositoryId: string): Promise<boolean> {
  const [row] = await db()
    .select({ enabled: repositories.actEnabled })
    .from(repositories)
    .where(eq(repositories.id, repositoryId));
  return row?.enabled ?? false;
}

export async function setActEnabled(repositoryId: string, enabled: boolean): Promise<void> {
  await db()
    .update(repositories)
    .set({ actEnabled: enabled, updatedAt: new Date() })
    .where(eq(repositories.id, repositoryId));
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run --config vitest.integration.config.ts src/db/queries/act-settings.integration.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/db/queries/act-settings.ts src/db/queries/act-settings.integration.test.ts drizzle
git commit -m "feat(act): make Act opt-in per repository

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The toggle and the availability line

The first thing a person sees. The toggle lives with the other repository configuration; the consequence is stated where the grade is.

**Files:**
- Modify: `src/app/repos/[repoId]/actions.ts` (add the server action)
- Modify: `src/app/repos/[repoId]/settings/page.tsx` (add the toggle, inside the existing `repo.canAdmin` guard)
- Modify: `src/app/repos/[repoId]/grading/page.tsx` (state availability)
- Test: `src/domain/act/availability-copy.test.ts`
- Create: `src/domain/act/availability-copy.ts`

**Interfaces:**
- Consumes: `actAvailability`, `ActAvailability` (Task 1); `fetchGrantedPermissions` (Task 2); `actEnabled`, `setActEnabled` (Task 3).
- Produces: `function availabilityMessage(availability: ActAvailability): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/domain/act/availability-copy.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { availabilityMessage } from './availability-copy';

describe('availabilityMessage', () => {
  it('says nothing when Act is available, because the button says it instead', () => {
    expect(availabilityMessage({ available: true })).toBeNull();
  });

  it('names the missing write access without blaming the reader', () => {
    expect(availabilityMessage({ available: false, reason: 'write_not_granted' })).toBe(
      'fieldnote needs write access to contents and pull requests before it can open one. Accept the updated permissions on the GitHub App installation.',
    );
  });

  it('explains the opt-in', () => {
    expect(availabilityMessage({ available: false, reason: 'not_enabled' })).toBe(
      'Opening pull requests is off for this repository. Turn it on in Settings.',
    );
  });

  it('says there is nothing to fix', () => {
    expect(availabilityMessage({ available: false, reason: 'nothing_to_fix' })).toBe(
      'Every readiness check passes. There is nothing for fieldnote to fix.',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/domain/act/availability-copy.test.ts`
Expected: FAIL — `Failed to resolve import "./availability-copy"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/act/availability-copy.ts`:

```typescript
import type { ActAvailability } from './availability';

// Copy lives in the domain so it is unit-tested rather than eyeballed in a
// component, the way check titles and finish names already are.
export function availabilityMessage(availability: ActAvailability): string | null {
  if (availability.available) return null;
  switch (availability.reason) {
    case 'not_enabled':
      return 'Opening pull requests is off for this repository. Turn it on in Settings.';
    case 'write_not_granted':
      return 'fieldnote needs write access to contents and pull requests before it can open one. Accept the updated permissions on the GitHub App installation.';
    case 'nothing_to_fix':
      return 'Every readiness check passes. There is nothing for fieldnote to fix.';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/domain/act/availability-copy.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the server action**

`src/app/repos/[repoId]/actions.ts:8` already enforces admin rights by passing `true` as the second argument to `requireRepository`, which calls `notFound()` for a non-admin. Do not reimplement that check. Add to the same file, reusing its existing `requireRepository` and `revalidatePath` imports:

```typescript
export async function saveActEnabled(repositoryId: string, form: FormData) {
  await requireRepository(repositoryId, true);
  await setActEnabled(repositoryId, form.get('actEnabled') === 'on');
  revalidatePath(`/repos/${encodeURIComponent(repositoryId)}/settings`);
  revalidatePath(`/repos/${encodeURIComponent(repositoryId)}/grading`);
}
```

Add the import `import { setActEnabled } from '../../../db/queries/act-settings';` alongside the file's existing imports.

- [ ] **Step 6: Add the toggle to Settings**

In `src/app/repos/[repoId]/settings/page.tsx`, add `saveActEnabled` to the existing import from `../actions` and add `actEnabled` to the import list from the queries. Add the read to the existing `Promise.all` (currently `src/app/repos/[repoId]/settings/page.tsx:40-45`), which becomes five entries:

```typescript
  const [policy, latest, record, rows, actOn] = await Promise.all([
    currentPolicy(repoId),
    latestImport(repoId),
    repositoryRecord(repoId),
    prRows([repoId]),
    actEnabled(repoId),
  ]);
```

Then insert this block immediately after the closing `)}` of the required-gates `{repo.canAdmin && (...)}` form and before `<h2>Collection detail</h2>`:

```tsx
      <h2>Pull requests</h2>
      <p className="muted">
        With this on, fieldnote proposes a plan to fix failing readiness checks and opens a pull
        request once you approve it. It needs write access to contents and pull requests on the
        installation.
      </p>
      {repo.canAdmin ? (
        <form action={saveActEnabled.bind(null, repoId)}>
          <label>
            <input type="checkbox" name="actEnabled" defaultChecked={actOn} /> Open readiness pull
            requests for this repository
          </label>
          <button>Save</button>
        </form>
      ) : (
        <p>{actOn ? 'On.' : 'Off.'}</p>
      )}
```

- [ ] **Step 7: State availability on the grading page**

`src/app/repos/[repoId]/grading/page.tsx` already resolves `repo` via `requireRepository(repoId)`, which returns the full `repositories` row plus `canAdmin` — so `repo.installationId` is available — and `grade` is a `CompletedGrade`, so `grade.checks` is `CheckResult[]`. After the existing `const grade = run ? selected : summary?.latest;` line, compute:

```typescript
const availability = actAvailability({
  enabled: await actEnabled(repoId),
  permissions: await fetchGrantedPermissions(repo.installationId),
  failingCheckCount: grade?.checks.filter((c) => c.status === 'fail').length ?? 0,
});
const message = availabilityMessage(availability);
```

Render `message` in a `muted` paragraph when it is not null. Render nothing else yet — there is no Act button until the plan workflow exists. Guard the whole block so a repository with no grade renders exactly what it renders today.

- [ ] **Step 8: Verify the whole check passes**

Run: `pnpm check`
Expected: lint, typecheck, unit tests, integration tests and build all pass.

- [ ] **Step 9: Commit**

```bash
git add src/domain/act src/app/repos
git commit -m "feat(act): let an admin switch Act on and say why it cannot run

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## What this plan deliberately leaves out

The remaining plans in this sequence, each producing working software on its own:

2. **Act run records and the plan workflow** — `act_runs`, `act_plan_moves`, `act_messages`, the dispatch and Inngest function, the E2B sandbox, the exploring agent, the plan view.
3. **Conversation and approval** — boxless turns over stored findings, the checkbox UI, the approval that triggers execution.
4. **Execute workflow** — authoring, the verification rule, opening the pull request, the idempotency guard, `act_pull_requests`.
5. **Train** — the read-only MCP server and the execute sandbox mounting it.
6. **Cost and the operator view** — usage capture on every run, the operator-only table, cost per merged pull request.

Naming is provisional throughout, as the spec records. Settle the ubiquitous language for this leg before plan 2 writes its migration.
