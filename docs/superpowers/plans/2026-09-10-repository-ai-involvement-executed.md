# Repository AI involvement, executed evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Report which AI coding agents have actually run in a repository, from evidence already stored, and show it on the repository page.

**Architecture:** A versioned catalogue and two pure functions carry all detection logic: one matches agent markers in commit messages and pull-request bodies during collection, one aggregates persisted rows into per-agent detections. Persistence recomputes on import completion and on webhook-driven pull-request sync, never per import item. Presentation is a summary rail beside the repository content and a detail route, both reading one indexed query.

**Tech Stack:** Next.js 16.3.4, React 19.2.8, TypeScript, PostgreSQL, Drizzle, Inngest, Vitest, Octokit.

**Spec:** `docs/superpowers/specs/2026-09-10-repository-ai-involvement-design.md`

**Scope:** This plan implements the first slice of the spec's delivery order. Configured detection (slice two) and declarations (slice three) get their own plans. Do not implement file scanning, workflow parsing, the re-scan control, or the catalogue picker here.

## Global Constraints

- Use existing Next.js 16.3.4, React 19.2.8, PostgreSQL, Drizzle, Vitest and Inngest conventions; do not upgrade dependencies for this work.
- Read relevant installed guides in `node_modules/next/dist/docs/` before application code changes.
- Never persist commit messages, pull-request bodies or comment text. Match them in flight and store only which marker matched and where.
- Produce no confidence score and no quality judgment. State is binary, evidence is shown.
- Detections are computed over every stored pull request for the repository, not only the hundred visible under Free access.
- Keep the existing visual style: Georgia headings, glass `section` surfaces, terracotta `#be421f` reserved for its current meaning. Executed uses `#2f6b52`; configured amber `#986817` is defined now but unused until slice two.
- `pull_requests.agent_provider` stays unwritten and unread. It belongs to per-pull-request attribution, which is out of scope.
- Never include secrets, GitHub credentials or raw repository content in logs, errors or client props.

## Execution preparation

- [ ] Read the spec and the approved preview `docs/superpowers/previews/2026-09-10-repository-ai-involvement.html`. Read `AGENTS.md`. Inspect `git status --short` and preserve unrelated working-tree changes. Use the executing skill's workspace isolation workflow.
- [ ] Use `pnpm exec vitest run <unit-test-path>` for unit tests and `pnpm exec vitest run --config vitest.integration.config.ts <integration-test-path>` for database tests. The integration configuration refuses databases whose names do not end in `_test`.
- [ ] **Verify the catalogue against real collected data before writing Task 1.** Against a database holding real tracked repositories, run:

```sql
SELECT DISTINCT app_id, name FROM ci_checks ORDER BY app_id;
SELECT DISTINCT author_login FROM commits WHERE author_login ILIKE '%[bot]%' ORDER BY author_login;
SELECT DISTINCT reviewer_id FROM review_events ORDER BY reviewer_id;
```

Populate `checkAppIds`, `botLogins` and `reviewerIds` in Task 1 from what these return. Values that cannot be observed stay out of the catalogue: an empty array is correct, and the branch-prefix and trailer signals still work without it. Do not populate any identity from recall. If no real database is reachable, say so explicitly in the task report and ship only the entries whose signals are textual.

## File ownership and task order

Create files only when their task is implemented. `src/db/schema.ts` remains the schema registry. Domain functions stay pure and take plain rows; database services own transactions; UI never computes detection. Complete tasks sequentially.

---

### Task 1: Catalogue and marker matching

**Files:**
- Create: `src/domain/ai-involvement/types.ts`
- Create: `src/domain/ai-involvement/catalogue.ts`
- Create: `src/domain/ai-involvement/markers.ts`
- Test: `src/domain/ai-involvement/markers.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `AgentId = 'claude-code'|'codex'|'copilot'|'cursor'|'devin'|'gemini'|'unidentified'`; `DetectionKind = 'coding-agent'|'llm-in-ci'`; `DetectionSignal = 'executed'|'configured'|'declared'`; `MarkerSource = 'commit-trailer'|'pr-body'`; `EvidenceSource = MarkerSource|'check-app'|'commit-author'|'pr-author'|'review-author'|'branch-prefix'`; `AgentMarker = {agent:AgentId; source:MarkerSource; ref:string}`; `EvidenceRef = {source:EvidenceSource; value:string; prCount:number}`; `Detection = {agent:AgentId; kind:DetectionKind; signal:DetectionSignal; firstSeenAt:string|null; lastSeenAt:string|null; occurrences:number|null; evidence:EvidenceRef[]}`; `DETECTOR_VERSION = '0.1.0'`; `catalogue: readonly CatalogueEntry[]`; `matchCommitTrailers(sha: string, message: string): AgentMarker[]`; `matchPullRequestBody(body: string | null): AgentMarker[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { matchCommitTrailers, matchPullRequestBody } from './markers';

test('a Claude co-author trailer is matched and the message is not returned', () => {
  const markers = matchCommitTrailers(
    'abc123',
    'fix: thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
  );
  expect(markers).toEqual([{ agent: 'claude-code', source: 'commit-trailer', ref: 'abc123' }]);
});

test('marker matching is case insensitive', () => {
  expect(matchCommitTrailers('abc', 'co-authored-by: claude opus 5 <x@y>')).toHaveLength(1);
});

test('an ordinary human co-author is not an agent', () => {
  expect(matchCommitTrailers('abc', 'Co-authored-by: Dana <dana@example.com>')).toEqual([]);
});

test('one commit citing an agent twice yields one marker', () => {
  const markers = matchCommitTrailers(
    'abc',
    'Generated with Claude Code\n\nCo-Authored-By: Claude <x@y>',
  );
  expect(markers).toEqual([{ agent: 'claude-code', source: 'commit-trailer', ref: 'abc' }]);
});

test('a null pull-request body yields no markers', () => {
  expect(matchPullRequestBody(null)).toEqual([]);
});

test('a pull-request body marker records its source', () => {
  expect(matchPullRequestBody('Generated with [Claude Code](https://claude.com/claude-code)')).toEqual(
    [{ agent: 'claude-code', source: 'pr-body', ref: 'body' }],
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/ai-involvement/markers.test.ts`
Expected: FAIL, cannot resolve `./markers`.

- [ ] **Step 3: Write `types.ts`**

Declare the exact type names and unions listed under Interfaces, plus:

```ts
export const DETECTOR_VERSION = '0.1.0';

export interface CatalogueEntry {
  agent: AgentId;
  label: string;
  kind: DetectionKind;
  checkAppIds: readonly string[];
  botLogins: readonly string[];
  reviewerIds: readonly string[];
  branchPrefixes: readonly string[];
  trailerPatterns: readonly string[];
  bodyPatterns: readonly string[];
}
```

- [ ] **Step 4: Write `catalogue.ts` as one frozen array**

Populate the identity arrays from the execution-preparation query. Leave an array empty rather than guessing. The textual signals below are verifiable from this repository's own history and from the attribution conventions agents publish. Every pattern must be lowercase, because matching lowercases the haystack once.

```ts
import type { CatalogueEntry } from './types';

export const catalogue: readonly CatalogueEntry[] = Object.freeze([
  {
    agent: 'claude-code',
    label: 'Claude Code',
    kind: 'coding-agent',
    checkAppIds: [],
    botLogins: ['claude[bot]'],
    reviewerIds: [],
    branchPrefixes: ['claude/'],
    trailerPatterns: ['co-authored-by: claude', 'generated with claude code', 'claude-session:'],
    bodyPatterns: ['generated with [claude code]', 'generated with claude code'],
  },
  {
    agent: 'codex',
    label: 'Codex',
    kind: 'coding-agent',
    checkAppIds: [],
    botLogins: [],
    reviewerIds: [],
    branchPrefixes: ['codex/'],
    trailerPatterns: ['co-authored-by: codex'],
    bodyPatterns: [],
  },
  {
    agent: 'copilot',
    label: 'GitHub Copilot',
    kind: 'coding-agent',
    checkAppIds: [],
    botLogins: ['copilot-swe-agent[bot]'],
    reviewerIds: [],
    branchPrefixes: ['copilot/'],
    trailerPatterns: ['co-authored-by: copilot'],
    bodyPatterns: [],
  },
  {
    agent: 'cursor',
    label: 'Cursor',
    kind: 'coding-agent',
    checkAppIds: [],
    botLogins: ['cursoragent'],
    reviewerIds: [],
    branchPrefixes: ['cursor/'],
    trailerPatterns: ['co-authored-by: cursor'],
    bodyPatterns: [],
  },
  {
    agent: 'devin',
    label: 'Devin',
    kind: 'coding-agent',
    checkAppIds: [],
    botLogins: ['devin-ai-integration[bot]'],
    reviewerIds: [],
    branchPrefixes: ['devin/'],
    trailerPatterns: [],
    bodyPatterns: [],
  },
  {
    agent: 'gemini',
    label: 'Gemini',
    kind: 'coding-agent',
    checkAppIds: [],
    botLogins: [],
    reviewerIds: [],
    branchPrefixes: ['gemini/'],
    trailerPatterns: [],
    bodyPatterns: [],
  },
]);
```

- [ ] **Step 5: Write `markers.ts`**

Lowercase the haystack once, test every catalogue pattern as a substring, and deduplicate by agent so one commit contributes at most one marker per agent. Return markers only. Never return, log or store the message.

```ts
import { catalogue } from './catalogue';
import type { AgentId, AgentMarker, MarkerSource } from './types';

const dedupe = (agents: AgentId[], source: MarkerSource, ref: string): AgentMarker[] =>
  [...new Set(agents)].map((agent) => ({ agent, source, ref }));

export function matchCommitTrailers(sha: string, message: string): AgentMarker[] {
  const haystack = message.toLowerCase();
  const agents = catalogue
    .filter((entry) => entry.trailerPatterns.some((pattern) => haystack.includes(pattern)))
    .map((entry) => entry.agent);
  return dedupe(agents, 'commit-trailer', sha);
}

export function matchPullRequestBody(body: string | null): AgentMarker[] {
  if (!body) return [];
  const haystack = body.toLowerCase();
  const agents = catalogue
    .filter((entry) => entry.bodyPatterns.some((pattern) => haystack.includes(pattern)))
    .map((entry) => entry.agent);
  return dedupe(agents, 'pr-body', 'body');
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/ai-involvement/markers.test.ts` then `pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/domain/ai-involvement/types.ts src/domain/ai-involvement/catalogue.ts src/domain/ai-involvement/markers.ts src/domain/ai-involvement/markers.test.ts
git commit -m "feat: add versioned agent catalogue and marker matching"
```

---

### Task 2: Executed detector

**Files:**
- Create: `src/domain/ai-involvement/detect-executed.ts`
- Test: `src/domain/ai-involvement/detect-executed.test.ts`

**Interfaces:**
- Consumes: Task 1 `catalogue`, `AgentId`, `AgentMarker`, `Detection`, `EvidenceRef`, `EvidenceSource`.
- Produces: `PullRequestRow = {id:string; authorLogin:string; headRef:string|null; markers:AgentMarker[]; occurredAt:string}`; `CheckRow = {pullRequestId:string; appId:string; occurredAt:string|null}`; `CommitRow = {pullRequestId:string; authorLogin:string|null; occurredAt:string|null}`; `ReviewRow = {pullRequestId:string; reviewerId:string; occurredAt:string|null}`; `ExecutedInput = {pullRequests:PullRequestRow[]; checks:CheckRow[]; commits:CommitRow[]; reviews:ReviewRow[]}`; `detectExecuted(input: ExecutedInput): Detection[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { detectExecuted, type PullRequestRow } from './detect-executed';

const pr = (id: string, over: Partial<PullRequestRow> = {}): PullRequestRow => ({
  id,
  authorLogin: 'dana',
  headRef: null,
  markers: [],
  occurredAt: '2026-09-08T00:00:00Z',
  ...over,
});
const empty = { pullRequests: [], checks: [], commits: [], reviews: [] };

test('no rows produce no detections', () => {
  expect(detectExecuted(empty)).toEqual([]);
});

test('a branch prefix on two pull requests counts two occurrences', () => {
  const result = detectExecuted({
    ...empty,
    pullRequests: [pr('1', { headRef: 'codex/one' }), pr('2', { headRef: 'codex/two' })],
  });
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ agent: 'codex', signal: 'executed', occurrences: 2 });
  expect(result[0].evidence).toEqual([{ source: 'branch-prefix', value: 'codex/', prCount: 2 }]);
});

test('two sources for one agent produce one detection with distinct-PR occurrences', () => {
  const result = detectExecuted({
    ...empty,
    pullRequests: [
      pr('1', {
        headRef: 'codex/one',
        markers: [{ agent: 'codex', source: 'pr-body', ref: 'body' }],
      }),
    ],
  });
  expect(result).toHaveLength(1);
  expect(result[0].occurrences).toBe(1);
  expect(result[0].evidence).toHaveLength(2);
});

test('an unknown check application is ignored', () => {
  const result = detectExecuted({
    ...empty,
    pullRequests: [pr('1')],
    checks: [{ pullRequestId: '1', appId: '999999', occurredAt: null }],
  });
  expect(result).toEqual([]);
});

test('first and last seen ignore null timestamps', () => {
  const result = detectExecuted({
    ...empty,
    pullRequests: [
      pr('1', { headRef: 'codex/a', occurredAt: '2026-09-01T00:00:00Z' }),
      pr('2', { headRef: 'codex/b', occurredAt: '2026-09-09T00:00:00Z' }),
    ],
  });
  expect(result[0].firstSeenAt).toBe('2026-09-01T00:00:00Z');
  expect(result[0].lastSeenAt).toBe('2026-09-09T00:00:00Z');
});

test('a row referencing an absent pull request is discarded', () => {
  const result = detectExecuted({
    ...empty,
    commits: [{ pullRequestId: 'missing', authorLogin: 'claude[bot]', occurredAt: null }],
  });
  expect(result).toEqual([]);
});

test('detections are ordered by occurrences descending then agent ascending', () => {
  const result = detectExecuted({
    ...empty,
    pullRequests: [
      pr('1', { headRef: 'codex/a' }),
      pr('2', { headRef: 'codex/b' }),
      pr('3', { headRef: 'claude/a' }),
    ],
  });
  expect(result.map((detection) => detection.agent)).toEqual(['codex', 'claude-code']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/ai-involvement/detect-executed.test.ts`
Expected: FAIL, cannot resolve `./detect-executed`.

- [ ] **Step 3: Write the accumulator in `detect-executed.ts`**

Build a map from agent to evidence key to the pull-request identifiers and timestamp bounds. Rows referencing a pull request absent from `input.pullRequests` are discarded first, so a stale row cannot inflate a count.

```ts
type Hit = { prIds: Set<string>; first: string | null; last: string | null };

function note(
  hits: Map<AgentId, Map<string, Hit>>,
  agent: AgentId,
  source: EvidenceSource,
  value: string,
  prId: string,
  at: string | null,
): void {
  const byKey = hits.get(agent) ?? new Map<string, Hit>();
  const key = `${source} ${value}`;
  const hit = byKey.get(key) ?? { prIds: new Set<string>(), first: null, last: null };
  hit.prIds.add(prId);
  if (at && (!hit.first || at < hit.first)) hit.first = at;
  if (at && (!hit.last || at > hit.last)) hit.last = at;
  byKey.set(key, hit);
  hits.set(agent, byKey);
}
```

- [ ] **Step 4: Feed every signal into the accumulator**

Walk pull requests for branch prefixes, author logins and markers; walk checks for `appId`, commits for `authorLogin`, reviews for `reviewerId`. Compare logins case-insensitively. Record the catalogue value that matched, not the observed value, so evidence stays stable: a `codex/fix-thing` branch records `codex/`.

```ts
for (const row of input.pullRequests) {
  for (const entry of catalogue) {
    const prefix = entry.branchPrefixes.find((p) => row.headRef?.toLowerCase().startsWith(p));
    if (prefix) note(hits, entry.agent, 'branch-prefix', prefix, row.id, row.occurredAt);
    if (entry.botLogins.some((login) => login === row.authorLogin.toLowerCase()))
      note(hits, entry.agent, 'pr-author', row.authorLogin.toLowerCase(), row.id, row.occurredAt);
  }
  for (const marker of row.markers) note(hits, marker.agent, marker.source, marker.ref === 'body' ? 'body' : 'commit', row.id, row.occurredAt);
}
```

- [ ] **Step 5: Fold hits into detections**

`occurrences` is the size of the union of pull-request identifiers across that agent's evidence, not the sum of per-evidence counts. `evidence` sorts by `source` then `value` for stable output. `kind` comes from the catalogue entry. `signal` is always `'executed'`. Sort as the ordering test requires.

```ts
const detections = [...hits.entries()].map(([agent, byKey]) => {
  const entries = [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b));
  const prIds = new Set(entries.flatMap(([, hit]) => [...hit.prIds]));
  const times = entries.flatMap(([, hit]) => [hit.first, hit.last]).filter((t): t is string => !!t);
  return {
    agent,
    kind: catalogue.find((entry) => entry.agent === agent)!.kind,
    signal: 'executed' as const,
    firstSeenAt: times.length ? times.reduce((a, b) => (a < b ? a : b)) : null,
    lastSeenAt: times.length ? times.reduce((a, b) => (a > b ? a : b)) : null,
    occurrences: prIds.size,
    evidence: entries.map(([key, hit]) => {
      const [source, ...rest] = key.split(' ');
      return { source: source as EvidenceSource, value: rest.join(' '), prCount: hit.prIds.size };
    }),
  };
});
return detections.sort(
  (a, b) => (b.occurrences ?? 0) - (a.occurrences ?? 0) || a.agent.localeCompare(b.agent),
);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/ai-involvement/detect-executed.test.ts` then `pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/domain/ai-involvement/detect-executed.ts src/domain/ai-involvement/detect-executed.test.ts
git commit -m "feat: aggregate executed agent evidence from persisted rows"
```

---

### Task 3: Collect the head reference and agent markers

**Files:**
- Modify: `src/github/normalize.ts` (`prSchema`, around line 66)
- Modify: `src/github/sync-pull-request.ts` (hydration body)
- Modify: `src/db/schema.ts` (`pullRequests`, around line 56)
- Test: `src/github/normalize.test.ts` (append to the existing suite)
- Generate: migration metadata under `drizzle/`

**Interfaces:**
- Consumes: Task 1 `matchCommitTrailers`, `matchPullRequestBody`, `AgentMarker`.
- Produces: `pull_requests.head_ref text`; `pull_requests.agent_markers jsonb not null default '[]'`. `PrInput` derives from `$inferInsert`, so no call-site signature changes.

- [ ] **Step 1: Write the failing test**

```ts
test('prSchema keeps the head reference and body', () => {
  const parsed = prSchema.parse({
    id: 1,
    number: 2,
    title: 't',
    state: 'open',
    user: { login: 'dana' },
    head: { sha: 'a', ref: 'codex/thing' },
    base: { sha: 'b' },
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    merged_at: null,
    closed_at: null,
    body: 'Generated with Claude Code',
  });
  expect(parsed.head.ref).toBe('codex/thing');
  expect(parsed.body).toBe('Generated with Claude Code');
});

test('prSchema tolerates an absent body', () => {
  const parsed = prSchema.parse({
    id: 1,
    number: 2,
    title: 't',
    state: 'open',
    user: null,
    head: { sha: 'a', ref: 'main' },
    base: { sha: 'b' },
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    merged_at: null,
    closed_at: null,
  });
  expect(parsed.body ?? null).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/github/normalize.test.ts`
Expected: FAIL, `parsed.head.ref` is undefined.

- [ ] **Step 3: Widen `prSchema`**

```ts
head: z.object({ sha: z.string(), ref: z.string() }),
body: z.string().nullish(),
```

- [ ] **Step 4: Add the columns to `pullRequests`**

Import `AgentMarker` as a type from `../domain/ai-involvement/types`, matching how `schema.ts` already imports `PullRequestFacts` and `CiCheck`.

```ts
headRef: text('head_ref'),
agentMarkers: jsonb('agent_markers').$type<AgentMarker[]>().notNull().default(sql`'[]'::jsonb`),
```

- [ ] **Step 5: Match markers during hydration**

In `src/github/sync-pull-request.ts`, `client.paginate(client.rest.pulls.listCommits, ...)` already returns `commit.message` and `pulls.get` already returns `body`; both are discarded today, so this costs no additional request. Build the marker list and pass `headRef` and `agentMarkers` into the `persistPr` input. Let the message and body go out of scope. Do not add either to `PullRequestFacts`, and do not log them.

```ts
const agentMarkers = [
  ...remoteCommits.flatMap((commit) => matchCommitTrailers(commit.sha, commit.commit.message ?? '')),
  ...matchPullRequestBody(pr.body ?? null),
];
```

- [ ] **Step 6: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file under `drizzle/` adding both columns. Inspect it. The `agent_markers` default must be present so existing rows backfill to `[]` rather than null.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm exec vitest run src/github/normalize.test.ts` then `pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/github/normalize.ts src/github/normalize.test.ts src/github/sync-pull-request.ts src/db/schema.ts drizzle/
git commit -m "feat: collect pull-request head reference and agent markers"
```

---

### Task 4: Persist detections and recompute at the right moments

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/inngest/functions/sync-repository.ts` (after the `finish` step)
- Modify: `src/inngest/functions/sync-pull-request.ts` (inside the run body)
- Create: `src/db/queries/ai-involvement.ts`
- Test: `src/db/ai-involvement.integration.test.ts`
- Generate: migration metadata under `drizzle/`

**Interfaces:**
- Consumes: Task 2 `detectExecuted`, Task 1 `DETECTOR_VERSION`, `Detection`, `EvidenceRef`.
- Produces: `recomputeExecutedDetections(repositoryId: string): Promise<void>`; `loadDetections(repositoryId: string): Promise<{detections: Detection[]; state: DetectionState | null}>` where `DetectionState = {scannedSha:string|null; detectorVersion:string; executedRefreshedAt:Date|null; configuredRefreshedAt:Date|null; incompleteReason:string|null}`.

- [ ] **Step 1: Write the failing test**

Follow the setup and cleanup conventions of `src/db/grade-runs.integration.test.ts`. Write the three seed helpers inline in the test file.

```ts
test('recompute writes one executed row per agent and is idempotent', async () => {
  const repositoryId = await seedRepositoryWithCodexBranches(2);
  await recomputeExecutedDetections(repositoryId);
  await recomputeExecutedDetections(repositoryId);
  const { detections, state } = await loadDetections(repositoryId);
  expect(detections).toHaveLength(1);
  expect(detections[0]).toMatchObject({ agent: 'codex', signal: 'executed', occurrences: 2 });
  expect(state?.executedRefreshedAt).not.toBeNull();
  expect(state?.configuredRefreshedAt).toBeNull();
});

test('an agent that no longer has evidence loses its executed row', async () => {
  const repositoryId = await seedRepositoryWithCodexBranches(1);
  await recomputeExecutedDetections(repositoryId);
  await renameHeadRefs(repositoryId, 'feature/thing');
  await recomputeExecutedDetections(repositoryId);
  expect((await loadDetections(repositoryId)).detections).toEqual([]);
});

test('a repository never recomputed reports no state', async () => {
  const repositoryId = await seedEmptyRepository();
  expect(await loadDetections(repositoryId)).toEqual({ detections: [], state: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --config vitest.integration.config.ts src/db/ai-involvement.integration.test.ts`
Expected: FAIL, cannot resolve `./queries/ai-involvement`.

- [ ] **Step 3: Add both tables to `src/db/schema.ts`**

```ts
export const repoAiDetections = pgTable(
  'repo_ai_detections',
  {
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    agent: text('agent').notNull(),
    signal: text('signal').notNull(),
    kind: text('kind').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    occurrences: integer('occurrences'),
    evidence: jsonb('evidence').$type<EvidenceRef[]>().notNull(),
    detectorVersion: text('detector_version').notNull(),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.repositoryId, t.agent, t.signal] }),
    check('repo_ai_detections_signal', sql`${t.signal} IN ('executed','configured','declared')`),
    check('repo_ai_detections_kind', sql`${t.kind} IN ('coding-agent','llm-in-ci')`),
    check('repo_ai_detections_occurrences', sql`${t.occurrences} IS NULL OR ${t.occurrences} >= 0`),
    index('repo_ai_detections_repository').on(t.repositoryId),
  ],
);

export const repoDetectionState = pgTable('repo_detection_state', {
  repositoryId: text('repository_id')
    .primaryKey()
    .references(() => repositories.id),
  scannedSha: text('scanned_sha'),
  detectorVersion: text('detector_version').notNull(),
  executedRefreshedAt: timestamp('executed_refreshed_at', { withTimezone: true }),
  configuredRefreshedAt: timestamp('configured_refreshed_at', { withTimezone: true }),
  incompleteReason: text('incomplete_reason'),
  updatedAt: updated(),
});
```

- [ ] **Step 4: Write `recomputeExecutedDetections`**

Read the four row sets for the repository, call `detectExecuted`, then replace the executed rows inside one transaction taking the same repository advisory lock `persistPr` uses, so a concurrent sync cannot interleave. Delete every executed row first, then insert the new set: this is what makes an agent that lost its evidence disappear. Leave `configured` and `declared` rows untouched, because slices two and three own them.

```ts
return db().transaction(async (tx) => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${repositoryId},0))`);
  const detections = detectExecuted(await readRows(tx, repositoryId));
  await tx
    .delete(s.repoAiDetections)
    .where(
      and(
        eq(s.repoAiDetections.repositoryId, repositoryId),
        eq(s.repoAiDetections.signal, 'executed'),
      ),
    );
  if (detections.length)
    await tx.insert(s.repoAiDetections).values(
      detections.map((detection) => ({
        repositoryId,
        agent: detection.agent,
        signal: detection.signal,
        kind: detection.kind,
        firstSeenAt: detection.firstSeenAt ? new Date(detection.firstSeenAt) : null,
        lastSeenAt: detection.lastSeenAt ? new Date(detection.lastSeenAt) : null,
        occurrences: detection.occurrences,
        evidence: detection.evidence,
        detectorVersion: DETECTOR_VERSION,
        refreshedAt: new Date(),
      })),
    );
  const state = {
    repositoryId,
    detectorVersion: DETECTOR_VERSION,
    executedRefreshedAt: new Date(),
  };
  await tx
    .insert(s.repoDetectionState)
    .values(state)
    .onConflictDoUpdate({ target: s.repoDetectionState.repositoryId, set: state });
});
```

- [ ] **Step 5: Write `loadDetections`**

One select from `repoAiDetections` ordered by `occurrences` descending then `agent` ascending, and one select from `repoDetectionState`. Return `state: null` when no state row exists, so the caller can distinguish never looked from nothing found.

```ts
export async function loadDetections(repositoryId: string) {
  const rows = await db()
    .select()
    .from(s.repoAiDetections)
    .where(eq(s.repoAiDetections.repositoryId, repositoryId))
    .orderBy(desc(s.repoAiDetections.occurrences), asc(s.repoAiDetections.agent));
  const [state] = await db()
    .select()
    .from(s.repoDetectionState)
    .where(eq(s.repoDetectionState.repositoryId, repositoryId));
  return {
    detections: rows.map((row) => ({
      agent: row.agent as AgentId,
      kind: row.kind as DetectionKind,
      signal: row.signal as DetectionSignal,
      firstSeenAt: row.firstSeenAt?.toISOString() ?? null,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      occurrences: row.occurrences,
      evidence: row.evidence,
    })),
    state: state ?? null,
  };
}
```

- [ ] **Step 6: Recompute once at import completion**

In `src/inngest/functions/sync-repository.ts`, add a step after the existing `finish` step, guarded by the same `complete`/`partial` condition that guards `start-history-backfill`. Do not recompute inside the per-item loop: an import walks a hundred pull requests and would repeat the same aggregate a hundred times to reach the answer the final pass gives anyway.

```ts
await step.run('recompute-ai-involvement', () => recomputeExecutedDetections(repositoryId));
```

- [ ] **Step 7: Recompute on webhook-driven sync only**

In `src/inngest/functions/sync-pull-request.ts`, the import path invokes this function with `{ repositoryId, number }` and no `sourceEventId`, while `src/github/handle-event.ts:75` sets `sourceEventId` on the webhook path. Use that to separate the two cadences.

```ts
if (data.sourceEventId)
  await step.run('recompute-ai-involvement', () =>
    recomputeExecutedDetections(data.repositoryId),
  );
```

- [ ] **Step 8: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file under `drizzle/` creating both tables with their check constraints and index.

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm exec vitest run --config vitest.integration.config.ts src/db/ai-involvement.integration.test.ts` then `pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 10: Commit**

```bash
git add src/db/schema.ts src/db/queries/ai-involvement.ts src/db/ai-involvement.integration.test.ts src/inngest/functions/sync-repository.ts src/inngest/functions/sync-pull-request.ts drizzle/
git commit -m "feat: persist executed agent detections and recompute on sync"
```

---

### Task 5: Rail and detail route

**Files:**
- Create: `src/components/ai-involvement/rail.tsx`
- Create: `src/components/ai-involvement/marks.tsx`
- Create: `src/app/repos/[repoId]/ai-involvement/page.tsx`
- Test: `src/components/ai-involvement/rail.test.ts`
- Test: `src/app/repos/[repoId]/ai-involvement/page.test.ts`
- Modify: `src/app/repos/[repoId]/page.tsx`
- Modify: `src/app/style.css`
- Modify: `src/domain/pull-request/types.ts` (`AgentProvider`, line 1)

**Interfaces:**
- Consumes: Task 4 `loadDetections`, Task 1 `catalogue`, `Detection`, `AgentId`.
- Produces: `railRows(detections: Detection[]): {shown: Detection[]; hiddenCount: number}`, exported for test; `<AiInvolvementRail detections state repoId />`; `<AgentMark agent />`; the route `/repos/[repoId]/ai-involvement`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { railRows } from './rail';
import type { Detection } from '../../domain/ai-involvement/types';

const d = (agent: string, occurrences: number | null, signal = 'executed'): Detection =>
  ({
    agent,
    occurrences,
    signal,
    kind: 'coding-agent',
    evidence: [],
    firstSeenAt: null,
    lastSeenAt: '2026-09-01T00:00:00Z',
  }) as Detection;

test('at most four rows are shown and the rest are counted', () => {
  const result = railRows([d('a', 5), d('b', 4), d('c', 3), d('d', 2), d('e', 1)]);
  expect(result.shown).toHaveLength(4);
  expect(result.hiddenCount).toBe(1);
});

test('executed rows sort before configured rows', () => {
  const result = railRows([d('cursor', null, 'configured'), d('codex', 1)]);
  expect(result.shown.map((row) => row.agent)).toEqual(['codex', 'cursor']);
});

test('four detections hide nothing', () => {
  expect(railRows([d('a', 4), d('b', 3), d('c', 2), d('d', 1)]).hiddenCount).toBe(0);
});

test('no detections show nothing and hide nothing', () => {
  expect(railRows([])).toEqual({ shown: [], hiddenCount: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/ai-involvement/rail.test.ts`
Expected: FAIL, cannot resolve `./rail`.

- [ ] **Step 3: Write `marks.tsx`**

Fetch the real path data rather than drawing marks by hand. simple-icons ships CC0 SVGs; the trademarks remain their owners' and naming a vendor's product with its own mark is ordinary nominative use.

```bash
pnpm add simple-icons
```

Import the path from the package and render it monochrome. Do not tint by brand: the official colours of Cursor, Copilot and Anthropic are all pure black, so brand tinting produces three identical black squares beside one orange one.

```tsx
import { siClaude, siOpenai, siGithubcopilot, siCursor, siGooglegemini } from 'simple-icons';
import type { AgentId } from '../../domain/ai-involvement/types';

const paths: Partial<Record<AgentId, { path: string; title: string }>> = {
  'claude-code': siClaude,
  codex: siOpenai,
  copilot: siGithubcopilot,
  cursor: siCursor,
  gemini: siGooglegemini,
};

export function AgentMark({ agent }: { agent: AgentId }) {
  const icon = paths[agent];
  if (!icon) return null;
  return (
    <svg className="agent-mark" viewBox="0 0 24 24" role="img" aria-label={icon.title}>
      <path d={icon.path} fill="currentColor" />
    </svg>
  );
}
```

Add `.agent-mark { width: 20px; height: 20px; flex: none; display: block; fill: var(--ink); opacity: 0.74; }` to `style.css` in Step 5. Returning `null` for an agent with no mark lets an unrecognised agent degrade to its label rather than breaking the row.

- [ ] **Step 4: Write `rail.tsx`**

Export the pure `railRows` above the component so the test imports no React.

```ts
const rank = (detection: Detection) => (detection.signal === 'executed' ? 0 : 1);

export function railRows(detections: Detection[]) {
  const sorted = [...detections].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (b.occurrences ?? 0) - (a.occurrences ?? 0) ||
      (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''),
  );
  return { shown: sorted.slice(0, 4), hiddenCount: Math.max(0, sorted.length - 4) };
}
```

The card shows the title, `v0.1`, the rows with mark, label and state text, the hidden count, the scan stamp and a link to the detail route. Executed state text reads `Ran, {occurrences} PRs`; configured reads `Set up, idle`. When `state` is `null`, render the not-scanned copy instead of an empty list, because an empty list would read as no AI here.

- [ ] **Step 5: Add layout and semantic colours to `src/app/style.css`**

Match the approved preview. Add `--ran: #2f6b52` and `--setup: #986817` to the existing `:root` block. Add a content grid that collapses below 760px, where the rail takes `order: -1` so the summary precedes the sections on a phone. Do not alter existing rules.

```css
.ai-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 292px;
  gap: 24px;
  align-items: start;
  margin-top: 22px;
}
@media (max-width: 760px) {
  .ai-content { grid-template-columns: minmax(0, 1fr); }
  .ai-rail { order: -1; }
}
```

- [ ] **Step 6: Place the rail on the repository page**

In `src/app/repos/[repoId]/page.tsx`, keep `h1` and `.page-intro` full width. Wrap the existing Repository evidence section and Recent pull requests section in the content column, and put the rail beside them. Add the detail link next to the existing `Agent readiness` link in `.page-intro`, matching how that link routes to `/repos/[repoId]/grading`.

```tsx
const involvement = await loadDetections(repo.id);
// ...
<div className="ai-content">
  <div className="ai-maincol">
    <h2>Repository evidence</h2>
    <section>
      <RepositoryMetadata record={record} githubUrl={githubRepositoryUrl(repo)} />
    </section>
    <h2>Recent pull requests</h2>
    {/* existing recent pull request table, unchanged */}
  </div>
  <AiInvolvementRail
    detections={involvement.detections}
    state={involvement.state}
    repoId={repoId}
  />
</div>
```

`BasicDashboard` stays above the grid at full width; only the two sections named above move inside it.

- [ ] **Step 7: Write the detail route**

`src/app/repos/[repoId]/ai-involvement/page.tsx`, guarded by `requireTrackedRepository` exactly as the grading route is, and using `pageRouteId` for the parameter. Render the summary strip, the evidence table with a proof line per `EvidenceRef`, and the scan stamp. Slice two adds the declined-signal disclosure and the re-scan control; leave both out.

```tsx
export const dynamic = 'force-dynamic';

export default async function AiInvolvement({ params }: { params: Promise<{ repoId: string }> }) {
  const repoId = pageRouteId((await params).repoId);
  const repo = await requireTrackedRepository(repoId);
  const { detections, state } = await loadDetections(repo.id);
  return (
    <div className="metrics-page">
      <Link href={`/repos/${encodeURIComponent(repoId)}`}>Back to repository</Link>
      <h1>
        {repo.owner}/{repo.name}
      </h1>
      <p className="page-intro">
        Every AI signal we can prove in this repository, with the evidence behind it. Detector v0.1.
      </p>
      <section>{state ? <InvolvementTable detections={detections} /> : <NotScanned />}</section>
    </div>
  );
}
```

Render each `EvidenceRef` as one proof line reading `{source}, {value}, {prCount} PRs`, in a monospace stack, so the reader can check the claim.

- [ ] **Step 8: Write the route test**

`src/app/repos/[repoId]/ai-involvement/page.test.ts`, following `src/app/repos/pages.test.ts`.

```ts
import { expect, test, vi } from 'vitest';

test('the route rejects a repository the caller cannot see', async () => {
  vi.doMock('../../../../auth/access', () => ({
    requireTrackedRepository: () => {
      throw new Error('Repository unavailable: nope');
    },
  }));
  const { default: Page } = await import('./page');
  await expect(Page({ params: Promise.resolve({ repoId: 'nope' }) })).rejects.toThrow(
    'Repository unavailable',
  );
});
```

- [ ] **Step 9: Extend `AgentProvider`**

In `src/domain/pull-request/types.ts`, add `'copilot'` and `'devin'` to the union. Do not write `pull_requests.agent_provider`; this only keeps the shared union honest.

```ts
export type AgentProvider =
  | 'claude-code'
  | 'codex'
  | 'copilot'
  | 'cursor'
  | 'devin'
  | 'gemini'
  | 'other'
  | 'human'
  | 'unknown';
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `pnpm exec vitest run src/components/ai-involvement/rail.test.ts` then `pnpm exec vitest run "src/app/repos/[repoId]/ai-involvement/page.test.ts"` then `pnpm typecheck` then `pnpm lint`
Expected: PASS, no type or lint errors.

- [ ] **Step 11: Commit**

```bash
git add src/components/ai-involvement "src/app/repos/[repoId]/ai-involvement" "src/app/repos/[repoId]/page.tsx" src/app/style.css src/domain/pull-request/types.ts
git commit -m "feat: show detected AI involvement on the repository page"
```

---

## Release verification

- [ ] Run `pnpm check`. Lint, typecheck, unit tests, integration tests and the production build must all pass.
- [ ] Apply migrations against a scratch database and confirm existing `pull_requests` rows backfill `agent_markers` to `[]` and `head_ref` to null without error.
- [ ] Run the seeded demo. Confirm a repository with no agent evidence renders the not-scanned rail rather than an empty list.
- [ ] Inspect the repository page at desktop width and at 400px. Confirm the header is full width, the rail sits beside the content above 760px and above it below, and no horizontal scroll appears.
- [ ] Confirm no commit message or pull-request body text reaches any database column, log line, error message or client prop. Grep the diff for `commit.message` and `pr.body` and check every use is confined to marker matching.
- [ ] Report which catalogue identities could not be verified against real data, and therefore which agents rest on textual signals alone.

## Coverage review

Spec sections covered: purpose and approved presentation (Task 5); evidence classes, executed only (Tasks 1, 2); refresh cadence, executed only (Task 4); storage, both tables (Task 4); executed detection including trailers, body markers and branch prefix (Tasks 1, 2, 3); presentation (Task 5); privacy and collection limits (Task 3 and release verification); versioning and catalogue verification (execution preparation and Task 1).

Spec sections deliberately deferred, each belonging to a later slice: configured detection and the collector refactor; declined-signal records; the re-scan control and its cooldown; declarations, the catalogue picker and the never-overwrite rule; `AGENTS.md` producing an unidentified-agent row.
