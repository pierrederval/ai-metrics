# Monitor → Act → Train: the first full loop

**Status:** design, approved in conversation 2026-09-11. No implementation yet.

fieldnote is a loop — Monitor what coding agents do, Act on what the evidence
shows, Train the agents on their own record. Monitor is shipped. Act stops
after grading. Train has no server. This design is the thinnest path that
traverses all three legs for one repository, so the loop exists end to end
before any leg is built out.

## The path

A synced repository is graded. The grade shows failing readiness checks. A
**plan** workflow boots a sandbox, reads the repository, and proposes a
checkbox plan with questions. A human ticks moves, answers questions, and
approves. An **execute** workflow boots a fresh sandbox, writes the files,
**runs what it wrote**, and opens a pull request. Merging that pull request
raises the readiness score and installs the `AGENTS.md` that points the
repository's coding agent at Train. Train serves the repository's own record
back over MCP.

Act's execute sandbox is Train's first client, so the loop closes by
construction rather than by diagram.

## Invariants

These are properties the product already has. The design must not break them.

1. **No LLM scores anything.** Grading stays deterministic and replays
   identically. The LLM authors pull requests; it never grades, ranks, or
   judges. The README's "no LLM judges anywhere in the pipeline" becomes "no
   LLM scores anything — Act authors pull requests with an LLM and never
   grades with one."
2. **Nothing is claimed that was not observed.** A command only reaches a
   generated document if it was executed in the sandbox and exited 0.
3. **Raw repository source never becomes a durable Inngest step output.**
   This rule already governs grading (`src/inngest/functions/grade-repository.ts`).
   Agent findings and transcripts go to Postgres; step functions return
   identifiers.
4. **Authorization is re-checked after every long operation**, following
   `validated()` in the grade job. A sandbox run is long; access can be
   revoked while it runs.
5. **Unknown stays unknown.** Cost, outcome, and verification results are
   nullable until observed, and aggregates show their denominators.

## Permission model

The GitHub App is read-only today across Actions, Checks, Contents, Metadata
and Pull requests (`docs/github-app.md`). Act requires **Contents: write** and
**Pull requests: write**.

GitHub cannot make a permission upgrade optional per installation, but an
installation that has not accepted the request keeps running on its previously
granted set rather than breaking. Monitoring therefore continues untouched for
every installation that ignores the prompt, and Act stays dark for them. This
matches the intended sequencing: prove monitoring first, ask for write after.

Act reads the installation's granted permissions and refuses to run without
both write scopes. This gate is built first, because it is also what makes the
re-consent safe to ask for.

## Data model

`grade_runs` (`src/db/schema.ts:631`) is the template: a
`queued|running|complete|failed` state machine, `requestedBy` and
`requestedWorkspaceId` ownership, `retryOf`, `dispatchedAt`, a partial unique
index enforcing one active run, and check constraints that make illegal states
unrepresentable. Act mirrors it.

### `act_runs`

One row per attempt.

- `id`, `repositoryId`, `requestedBy`, `requestedWorkspaceId`, `retryOf`
- `phase` — `plan` | `execute`
- `planRunId` — on an execute row, the plan row it fulfils
- `state` — `queued` | `running` | `complete` | `failed`
- `sha` — the commit the sandbox checked out
- `authorVersion` — the agent configuration and prompt version that produced
  the run. An LLM in the path means provenance is recorded instead of replay
  being promised; this is the analogue of `rubricVersion` / `evaluatorVersion`.
- `boxId`, `boxSeconds`
- token counts: `inputTokens`, `outputTokens`, `cacheReadTokens`,
  `cacheCreationTokens`
- `costMicros` — integer micros, never a float
- `model`
- `errorCode`, `dispatchedAt`, `createdAt`, `startedAt`, `completedAt`
- Partial unique index: one active run per repository.

### `act_plan_moves`

The checkboxes, and the contract between the two workflows.

- `id`, `actRunId` (the plan run), `checkId` (a `readiness-v01` check id),
  `path`, `rationale`, `ordinal`
- `selected` — set when the human ticks it
- `outcome` — `written` | `skipped` | `verification_failed`, null until execute
  runs

### `act_messages`

The grill transcript and the exploration findings the plan sandbox persisted
before it died.

- `id`, `actRunId`, `role`, `body`, `createdAt`
- `kind` — `finding` | `question` | `answer` | `note`

### `act_pull_requests`

- `id`, `actRunId`, `repositoryId`, `number`, `headSha`, `openedAt`
- `outcome` — `open` | `merged` | `closed`, refreshed from the existing
  pull-request webhook path
- Unique index on (`repositoryId`, `number`).

## Plan workflow

Dispatched like `dispatchGrade` (`src/inngest/dispatch-grade.ts`): a queued row,
a single event carrying only `runId`, `dispatchedAt` set under the same
predicate that selected the row. The Inngest function mirrors
`grade-repository.ts` — `singleton` keyed on the run id, `retries`, `onFailure`
failing the row, and a `validated()` authorization re-check.

Steps:

1. **begin** — transition to `running`, re-check authorization.
2. **pin-commit** — resolve and store the SHA, reusing `resolveReadinessSha`.
3. **explore** — boot the sandbox, shallow-clone at that SHA, run the authoring
   agent in read-only mode. It reads the repository and the failing checks from
   the latest grade, then writes to Postgres: findings, one proposed move per
   failing check, and its opening questions. The step returns the run id, never
   source.
4. **complete** — mark the plan run `complete`. The sandbox is destroyed.

Nothing runs while the plan waits for a human.

## Conversation

Between plan and execute, the human ticks moves, answers questions, and can ask
their own. These turns are plain model calls over the stored findings and
transcript, with no sandbox. Each turn appends `act_messages` rows and may
revise `act_plan_moves`. Turns are cheap, which is what makes the exchange feel
like a conversation rather than a form, and their cost is recorded against the
plan run.

## Execute workflow

A separate dispatch, triggered by explicit approval. Same job skeleton.

1. **begin** — transition to `running`, re-check authorization, re-check that
   the installation still grants both write scopes.
2. **guard** — refuse if an Act pull request for this repository is already
   open, or if a previous run covering the same selected `checkId` set was
   closed without merging.
3. **author** — fresh sandbox, fresh clone. The agent receives only the
   selected moves and the answers, and writes the files.
4. **verify** — the agent runs what it wrote. A setup or test command survives
   into the document only if it exits 0 in the sandbox. Commands that fail are
   dropped, and the move is recorded as `verification_failed` with the failing
   command and its exit code.
5. **open** — push a branch and open the pull request. The body carries the
   grade evidence inline: the failing check, its explanation, and the paths and
   line ranges from `GradeResult.checks[]`.
6. **complete** — record the pull request, the usage, and the cost.

## Train

A read-only MCP server over the metrics that already exist: `failureBreakdown()`
and `aggregate()` (`src/metrics/aggregate.ts:17,35`) and `latestGrade()`
(`src/db/queries/grade-runs.ts:145`). At most three tools. It reports rates with
their denominators and makes no judgment — "your top mistakes" is a conclusion
for the agent to draw, not a phrase the server uses.

Its only consumer in this slice is Act's execute sandbox, which mounts it so
that the `AGENTS.md` being authored is informed by the repository's real failure
record. The transport is real MCP; the credential is internal and short-lived.
Public per-repository token issuance — the roadmap's acknowledged hard part —
is explicitly out of scope, and the `AGENTS.md` Act writes documents how a team
will point their own agent at the server once it exists.

## Cost

Recorded for operator pricing research, never shown to users.

**What is recorded,** per `act_run` and therefore per phase: token counts split
by input, output, cache read and cache creation; `model`; `costMicros` as an
integer; `boxSeconds`; and wall-clock duration. Sandbox seconds matter as much
as tokens — the execute box installs dependencies and runs a test suite, so box
time may rival model spend, and a plan priced on tokens alone underprices.

**The number that sets a price is cost per merged pull request**, not cost per
run. A pull request closed without merging cost full price and delivered
nothing. Because `act_pull_requests.outcome` is tracked for idempotency anyway,
joining cost to outcome is nearly free. Report the distribution — p50 and p90 —
not the mean, since one repository with a long test suite skews it.

**The admin boundary is structural.** `workspace_memberships.role` is
`owner | member`, which is workspace ownership, not platform operation, so
there is no admin concept to reuse. Operators are an env-var allowlist of email
addresses — no migration, no new auth surface, and nothing a customer can
escalate into. Cost lives in its own query module that user-facing pages never
import, so it cannot leak through a view someone forgets to filter later. The
surface is one plain operator table: run, repository, phase costs, outcome,
merged or not.

## Opt-in, idempotency, rate

- Act is **off** per repository until switched on from repository settings.
- One open Act pull request per repository at a time.
- A selected `checkId` set that was closed without merging is never proposed
  again automatically.
- One execute run per repository per 24 hours.

## Interface

- `/repos/[repoId]/grading` gains an Act entry point when the grade has failing
  checks, the repository is opted in, and the installation grants write.
- A plan view renders `act_plan_moves` as checkboxes with the transcript beneath,
  and posts answers and approval.
- The readiness card links to the open pull request once one exists.
- An operator-only cost table, outside the repository routes.

## Sandbox

E2B. It is purpose-built for ephemeral per-run boxes and has a TypeScript SDK;
a self-managed Railway container would mean building provisioning, teardown,
idle timeout and concurrency limits, which is a service rather than a feature.
The authoring agent is the Claude Agent SDK
(`@anthropic-ai/claude-agent-sdk`) — Claude Code as a library — not the API
SDK's tool runner.

## Out of scope

- Public MCP token issuance, rotation and revocation.
- Ingesting customers' Claude Code OTLP telemetry. It would give genuine
  per-agent attribution, which the roadmap currently lists as blocked, but it is
  a fourth ingestion path: an authenticated collector endpoint, raw payload
  retention, and a deployment model that requires configuring developers'
  machines rather than installing a GitHub App. Its own slice, with its own
  privacy design.
- Any Act beyond readiness documentation — reverting harness edits in
  particular.
- Attribution of a pull request to a specific agent.

## Naming

`act_runs` is vaguer than anything else in this schema, which is careful with
domain language. Settle the ubiquitous language for this leg before the first
migration is written; the names in this document are provisional.

## How we will know it works

- The permission gate refuses to run against a read-only installation, proven
  by an integration test.
- A plan run against the seeded demo repository produces one move per failing
  check and destroys its sandbox.
- An execute run drops a command that exits non-zero and records
  `verification_failed` rather than writing it into the document.
- The opened pull request raises the readiness score when merged, verified by
  re-grading.
- Cost is absent from every user-facing payload, proven by a test asserting the
  repository page query modules never select cost columns.
