# Authoring runs and the plan workflow

**Status:** design, approved in conversation 2026-09-11. No implementation yet.

Act's second slice. The [loop design](2026-09-11-monitor-act-train-loop-design.md)
is the binding authority; this narrows its "Plan workflow" section to something
buildable and settles the two questions that design deferred — what these things
are called, and what the sandbox runs on.

The [availability gate](../plans/2026-09-11-act-availability-gate.md) shipped
first: fieldnote can already decide whether Act may run for a repository. This
slice gives Act something to run.

## What this slice is

A repository with a failing grade can be asked for a **plan**. A plan run pins
the graded commit, proposes one **remedy** per failing readiness check, and
completes. A human can read the plan. That is all — ticking remedies, approving
them, writing files and opening the pull request are the next two slices.

## Shipping this in two plans

The slice is too big for one plan, and it has a clean seam: the run records and
the plan workflow work end to end before any sandbox exists.

**Plan 2a — authoring runs and the plan workflow.** The `authoring_runs` and
`authoring_remedies` migration, dispatch, the Inngest function with all four
steps and its authorization re-checks, reconciliation, the entry point, and the
plan view. `explore` is implemented on the deterministic floor. No vendor
dependency, no LLM, no new required environment variable.

**Plan 2b — the sandbox and the authoring agent.** The sandbox port with its
E2B and local adapters, the `authoring_notes` migration, and the Agent SDK run
that replaces the deterministic explore — keeping it beneath as the floor.

2a is deployable on its own. That is the point of cutting here: a state machine
in production is a better foundation for a sandbox than a sandbox is for a
state machine.

## Naming

The loop design called these `act_runs`, `act_plan_moves` and `act_messages`,
and said so provisionally: "settle the ubiquitous language for this leg before
the first migration is written." It is settled in
[`UBIQUITOUS_LANGUAGE.md`](../../../UBIQUITOUS_LANGUAGE.md). The reasoning, in short:

No other table in this schema is named for a leg of the product. Monitor's
tables are `pull_requests`, `ci_runs` and `pr_metrics`, not `monitor_*`.
Grading's are `grade_runs` and `grading_rubrics`. Every one is named for what it
holds, and `act_*` broke that rule because "act" is a verb with no noun behind
it — which is exactly why it read as vague.

The loop design supplies the missing noun in its own invariant: *the LLM
**authors** pull requests; it never grades*. The column was already called
`authorVersion`, parallel to `rubricVersion` and `evaluatorVersion`. So:

| Provisional | Settled | |
| --- | --- | --- |
| `act_runs` | `authoring_runs` | `grade_runs` / `authoring_runs` puts the invariant in the schema: grading is deterministic, and authoring is the only place an LLM touched anything. |
| `phase: plan \| execute` | `kind: plan \| execute` | Not phases of one run. Separate runs, separate dispatch, separate sandboxes. A column that discriminates row types is a kind. |
| `act_plan_moves` | `authoring_remedies` | "Move" is a chess metaphor borrowed from outside the domain. A row is one file written to make one failing readiness check pass. |
| `act_messages` | `authoring_notes` | "Message" is a chat concept. These are findings, questions, answers and remarks — notes, in a product called fieldnote. |
| `role` | `speaker: agent \| human` | `workspace_memberships.role` already means `owner \| member`. |
| `boxId`, `boxSeconds` | `sandboxId`, `sandboxSeconds` | "Box" is informal shorthand for the word the design uses everywhere else. |
| `act_pull_requests` | `authored_pull_requests` | It is a link — *this run opened that PR* — and must not read as a rival to Monitor's `pull_requests`. |

Two collisions are recorded in the glossary and bind new code regardless:
**readiness check** and **CI check** are never both called "check"; a **plan
run** is not an implementation plan under `docs/superpowers/plans/`.

## Sandbox substrate

**E2B, reached through a narrow port.**

The loop design already chose E2B over a self-operated container, and nothing
found since changes that: Railway offers long-lived services and no per-run
primitive, so self-operating means either cloning into the app container —
which shares a filesystem, a network and `GITHUB_PRIVATE_KEY`,
`TOKEN_ENCRYPTION_KEY` and `DATABASE_URL` with every tenant, and is therefore
not isolation at all — or building provisioning, teardown, idle timeout and
concurrency limits, which is a service rather than a feature.

What is new is the port, and it is justified by testing rather than by any wish
to keep vendors swappable. CI reads no repository secret in the build job and
has no E2B key; without a seam the plan workflow could only be tested by
booting a real sandbox or by mocking a vendor SDK, and `pnpm dev` would require
an E2B account. Four operations — create, write, run the agent, destroy — with
an E2B adapter for production and a local adapter used by tests and by
development. `pnpm check` stays green offline.

**The threat model differs between the two run kinds, and this slice is the
cheap half.** A plan run only reads: clone, Read, Grep, Glob, no Bash, nothing
from the repository executes. Its real risk is prompt injection steering the
agent, which a microVM does not fix — tool restriction and keeping credentials
out of the box do. The execute run is where `pnpm install` runs a customer
repository's postinstall scripts, which is arbitrary code execution, and that
is what the microVM is actually bought for. Installing the substrate here means
the execute slice inherits a sandbox already proven in production instead of
retrofitting isolation under pressure.

**No GitHub credential enters the sandbox.** Rather than passing an
installation token in for `git clone`, the application fetches the tarball at
the graded SHA through the API it already holds and uploads the bytes. The
checkout is pinned by construction, and the only credential inside the box is
the Anthropic key the Agent SDK needs to run at all. The fetch and the upload
happen inside a single `step.run`, so no repository source becomes a durable
Inngest step output.

**The SDK's surface is read from the installed package, never from memory or a
documentation summary.** `@anthropic-ai/claude-agent-sdk` is a separate product
from the API SDK, and published summaries of its `Options` type contradict each
other on which fields exist. The implementation plan must require reading
`node_modules/@anthropic-ai/claude-agent-sdk` typings before writing a call.
This is the availability gate's lesson: that slice's one Critical came from
plan text asserting a property path that was true and meant something else.

## Data model

### `authoring_runs`

```
id, repository_id → repositories, kind ('plan' | 'execute'),
requested_by → users, requested_workspace_id → workspaces, retry_of → self,
state ('queued' | 'running' | 'complete' | 'failed'), sha,
author_version NOT NULL, model NULL, sandbox_id NULL, error_code,
dispatched_at, created_at, started_at, completed_at

check   state IN ('queued','running','complete','failed')
check   kind IN ('plan','execute')
check   state = 'complete' → sha IS NOT NULL AND completed_at IS NOT NULL
unique  (repository_id) WHERE state IN ('queued','running')
index   (repository_id, created_at DESC)
```

`grade_runs` is the template and the state machine is identical. Four
deliberate departures from the loop design's column list:

- **`plan_run_id` is deferred.** It is an execute-row concern and this slice
  never writes an execute row. `kind` stays: the partial unique index depends on
  it, and a discriminator is expensive to backfill.
- **`selected` and `outcome` are deferred.** They are the approval and
  execution contract, which is the next slice.
- **Cost columns are absent.** `sandbox_seconds`, the four token counts and
  `cost_micros` are cost measurement, and cost is its own slice.
  `author_version`, `model` and `sandbox_id` stay because they are provenance
  and debugging, not cost.
- **`model` is nullable and load-bearing.** `model IS NULL` means *no model
  authored this plan* — true before any agent exists, and true afterwards
  whenever the sandbox failed and the deterministic floor produced the plan
  instead. This is "unknown stays unknown" doing real work, in place of a
  `degraded` flag that would have to be kept honest by hand.

**One weakening to state plainly.** `grade_runs` can assert its own result in a
check constraint because that result is a `jsonb` column. Here the result is
child rows, and "a complete plan has at least one remedy" is not expressible as
a check. It is enforced in `completeAuthoringRun()`, which counts remedies
before transitioning and refuses otherwise, plus an integration test. The
database constraint is weaker than grading's; the code is not, and the
difference should not be mistaken for parity.

### `authoring_remedies`

```
id, authoring_run_id → authoring_runs, check_id, path, rationale, ordinal

unique  (authoring_run_id, path)
index   (authoring_run_id, ordinal)
check   ordinal >= 0
```

`check_id` holds a **readiness check id** as it appears in
`GradeResult.checks[].id` — one of `root-agent-instructions`, `root-readme`,
`docs-markdown`, `documented-setup`, `documented-tests`. It is not a CI check
and not a database row id.

`path` is repository-relative, and unique per run: a plan never writes the same
file twice. It is deliberately not unique per `check_id`, because an agent may
reasonably satisfy one check with two documents.

### `authoring_notes`

```
id, authoring_run_id → authoring_runs,
speaker ('agent' | 'human'), kind ('finding' | 'question' | 'answer' | 'remark'),
body, created_at

index (authoring_run_id, created_at)
```

This table arrives with the agent, in the second half of the slice, because
that is where its only writer lives. A table nothing writes to is not worth a
migration.

## The plan workflow

Dispatch mirrors `dispatchGrade` exactly: a queued row, a single event carrying
only `runId`, and `dispatchedAt` set under the same predicate that selected the
row. The event is `repository/authoring.plan.requested`.

`plan-repository.ts` mirrors `grade-repository.ts` — `singleton` keyed on the
run id, `retries: 3`, `onFailure` failing the row, and a `validated()`
authorization re-check before each step. Its steps carry the loop design's
names from the first commit — `begin`, `pin-commit`, `explore`, `complete` —
so that replacing the deterministic explore with the agent changes an
implementation and never a durable step identity.

`pin-commit` reuses `resolveReadinessSha`.

**Where the permission re-check goes, and where it does not.** `requestPlan()`
evaluates the full `actAvailability`, granted permissions included, because it
is the Act entry point. The worker's `validated()` re-checks authorization and
the repository's opt-in but *not* the GitHub permission fetch: a plan run
writes nothing to GitHub, and re-fetching permissions inside a function that
retries three times would turn a GitHub outage into a failed plan run. Write
access is the execute run's gate, re-checked at its `begin` as the loop design
requires.

**Where a fail-closed default keeps its loudness.** `fetchGrantedPermissions`
throws rather than returning a safe value, and `requestPlan()` lets it — a
permission check that cannot complete must not quietly become "unavailable".
And when the sandbox fails, the run completes on the deterministic floor rather
than failing, which is a loud failure converted into a safe default; the
loudness is kept in two places that survive the conversion: an
`authoring_notes` remark recording why, and a null `model` that says no agent
wrote this.

## The deterministic floor

A plan run produces a useful plan with no agent at all. One remedy per failing
readiness check, its path derived from the check id, and its rationale taken
from that check's own `CheckResult.explanation`.

This is not a stub. It ships as the whole of the first half of this slice, and
it survives into the second half as the floor beneath a failed sandbox. It also
keeps the invariant that nothing is claimed that was not observed: the
rationale is evidence the deterministic grader already produced, not prose an
LLM invented.

The agent's contribution, when it arrives, is a better plan — remedies shaped
by what the repository actually contains, and the opening questions worth
asking a human.

## Interface

`/repos/[repoId]/act/[runId]` renders the remedies as checkboxes, disabled,
with the transcript beneath once notes exist. The route says "act" where the
schema says "authoring" on purpose: **Monitor · Act · Train** is the vocabulary
the README teaches a user, and the schema's job is a different one.

The entry point sits on `/repos/[repoId]/grading`, where the availability line
already is.

## How we will know it works

- A plan run against a repository with failing checks produces exactly one
  remedy per failing check, and none for a passing one.
- A second plan request while one is queued or running is refused by the
  partial unique index, not by application code alone.
- A plan run for a repository whose installation grants no write access is
  refused at request time.
- `completeAuthoringRun()` refuses to complete a run with no remedies.
- `pnpm check` passes with no E2B key and no Anthropic key present.
- A plan run whose sandbox fails still completes, with a remark recording why
  and a null `model`.

## Out of scope

Ticking remedies, answering questions, approval, the execute run, the pull
request, cost, and the Train MCP server. Each is its own slice.
