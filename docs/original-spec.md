# AI Engineering Reliability MVP — Scaffolding Plan

## Mission

Build the first working version of an **AI Engineering Reliability platform**.

The product connects to GitHub and reconstructs the lifecycle of pull requests and GitHub Actions checks in order to answer:

* How many PRs are created and merged?
* What percentage of PRs are green on the first CI attempt?
* How many CI attempts are required before a PR becomes green?
* Which quality gates fail most often?
* How long does it take for a PR to become green?
* Did a PR modify tests, CI configuration, or quality configuration after a failed CI attempt?

The core product principle is:

> Evidence first. No LLM-based quality judgment in V1.

All metrics must be deterministic and reproducible from GitHub data.

---

# 1. Technology choices

Use:

* TypeScript
* Node.js
* Next.js App Router
* PostgreSQL
* Drizzle ORM
* Octokit
* GitHub App authentication
* Inngest for asynchronous processing
* Vitest for unit tests
* Zod for external payload validation

Keep everything in **one repository and one deployable application** initially.

Do NOT introduce:

* microservices
* Kafka
* Redis unless technically required
* Kubernetes
* ClickHouse
* GraphQL
* Elasticsearch
* LLM calls
* Claude Code SDK integration
* Playwright/JUnit artifact parsing

Those are explicitly out of scope for the scaffold.

---

# 2. Architecture

Implement this flow:

```text
GitHub
  │
  │ webhook
  ▼
POST /api/github/webhook
  │
  ├── verify GitHub signature
  ├── store raw event
  └── enqueue Inngest event
          │
          ▼
    Event processor
          │
          ├── normalize GitHub data
          ├── update PR
          ├── update commits
          ├── update CI runs/checks
          └── recompute PR metrics
                    │
                    ▼
                PostgreSQL
                    │
                    ▼
              Next.js dashboard
```

The webhook HTTP endpoint must perform minimal work.

The webhook should:

1. validate the GitHub webhook signature
2. persist the raw webhook
3. emit an Inngest event
4. return success

Heavy API calls and metric computation belong in Inngest functions.

---

# 3. Core design principle

Treat GitHub information as facts and metrics as projections.

```text
RAW GITHUB EVENTS
       ↓
NORMALIZED FACTS
       ↓
PR TIMELINE
       ↓
DERIVED METRICS
```

Metrics MUST NOT be implemented as mutable incremental counters.

Given the same normalized facts, recomputing metrics must always generate the same result.

The analyzer therefore needs to be:

* deterministic
* idempotent
* rerunnable
* testable independently from GitHub

---

# 4. Initial repository structure

Create:

```text
src/
  app/
    api/
      github/
        webhook/
          route.ts

      inngest/
        route.ts

    dashboard/
      page.tsx

    repos/
      [repoId]/
        page.tsx

    prs/
      [prId]/
        page.tsx

  github/
    app.ts
    client.ts
    verify-webhook.ts
    types.ts

  inngest/
    client.ts
    functions/
      process-github-event.ts
      sync-pull-request.ts

  domain/
    pull-request/
      types.ts
      analyzer.ts
      analyzer.test.ts

    harness/
      classify-file.ts
      detect-mutations.ts
      detect-mutations.test.ts

  db/
    index.ts
    schema.ts
    queries/

  metrics/
    calculate-pr-metrics.ts
    calculate-pr-metrics.test.ts

  lib/
    env.ts

docs/
  architecture.md
  domain-model.md
```

Prefer focused files with a single responsibility.

Do not create abstractions until they are needed.

---

# 5. Database model

Implement the following initial entities.

## github_installations

```text
id
github_installation_id
account_login
account_type
created_at
updated_at
```

Unique:

```text
github_installation_id
```

---

## repositories

```text
id
installation_id
github_repository_id
owner
name
default_branch
is_private
created_at
updated_at
```

Unique:

```text
github_repository_id
```

---

## pull_requests

```text
id
repository_id
github_pr_id
github_pr_number
title
state
author_login
head_sha
base_sha
opened_at
merged_at nullable
closed_at nullable
created_at
updated_at
```

Unique:

```text
repository_id + github_pr_number
```

---

## commits

```text
id
pull_request_id
sha
author_login nullable
committed_at
created_at
```

Unique:

```text
pull_request_id + sha
```

---

## ci_runs

Represents one CI execution associated with a SHA.

```text
id
repository_id
pull_request_id nullable
github_run_id nullable
head_sha
name
status
conclusion nullable
started_at nullable
completed_at nullable
created_at
updated_at
```

---

## ci_checks

```text
id
ci_run_id
github_check_run_id
name
status
conclusion nullable
started_at nullable
completed_at nullable
created_at
updated_at
```

Examples:

```text
lint
typecheck
unit
integration
playwright
build
security
```

---

## changed_files

```text
id
pull_request_id
commit_sha nullable
path
change_type
additions
deletions
created_at
```

`change_type`:

```text
added
modified
removed
renamed
```

---

## github_events

Store the original webhook payload.

```text
id
delivery_id
event_name
action nullable
installation_id nullable
repository_id nullable
received_at
payload jsonb
processed_at nullable
processing_error nullable
```

`delivery_id` must be unique.

Duplicate webhook deliveries must not generate duplicate processing.

---

## pr_metrics

One current projection per PR.

```text
id
pull_request_id

ci_attempt_count
first_pass_green
eventually_green
time_to_first_green_seconds nullable

failed_check_count
unique_failed_gate_count

test_files_changed
harness_files_changed
harness_changed_after_failure

clean_green nullable

computed_at
```

Unique:

```text
pull_request_id
```

---

# 6. Define the domain terminology precisely

## CI attempt

For V1, define one CI attempt as:

> A logical group of required GitHub checks executed against a specific commit SHA belonging to a pull request.

Do not treat every individual check as a separate attempt.

A PR:

```text
SHA A
  lint
  unit
  e2e

SHA B
  lint
  unit
  e2e
```

has two attempts.

---

# 7. First Pass Green

Define:

```text
firstPassGreen = true
```

when every relevant CI check for the PR's first evaluated SHA has a successful conclusion.

For V1, treat the following conclusions as NOT green:

```text
failure
timed_out
cancelled
action_required
startup_failure
stale
```

Do not count:

```text
neutral
skipped
```

as successful required gates unless explicitly classified otherwise.

Make the relevant-check classifier replaceable later.

---

# 8. Eventually Green

```text
eventuallyGreen = true
```

when at least one later CI attempt becomes fully green.

Example:

```text
attempt 1 → RED
attempt 2 → RED
attempt 3 → GREEN
```

produces:

```text
firstPassGreen = false
eventuallyGreen = true
ciAttemptCount = 3
```

---

# 9. Attempts to Green

For a PR that becomes green:

```text
attemptsToGreen =
index of first successful CI attempt
```

Example:

```text
RED
RED
GREEN
GREEN
```

returns:

```text
3
```

A PR that never becomes green returns:

```text
null
```

for attempts-to-green but preserves total attempt count.

---

# 10. Time to Green

Measure:

```text
first CI attempt start
        →
first complete green state
```

Store in seconds.

Do not use PR merge time for this metric.

---

# 11. Harness file classification

Create deterministic classification.

### Tests

Examples:

```text
**/*.test.ts
**/*.test.tsx
**/*.spec.ts
**/*.spec.tsx
**/__tests__/**
tests/**
test/**
e2e/**
```

### CI configuration

```text
.github/workflows/**
.github/actions/**
```

### Test runner configuration

```text
playwright.config.*
jest.config.*
vitest.config.*
cypress.config.*
```

### Static quality configuration

```text
eslint.config.*
.eslintrc*
tsconfig*.json
```

### Dependency / script configuration

```text
package.json
```

Return:

```ts
type HarnessFileCategory =
  | "test"
  | "ci"
  | "test-config"
  | "quality-config"
  | "package-config"
  | "source"
  | "other";
```

Write extensive unit tests for this classifier.

---

# 12. Harness mutation after failure

This is the first product-specific signal.

Given this timeline:

```text
SHA A
CI FAILURE

SHA B
changed:
  src/foo.ts
  tests/foo.spec.ts

CI SUCCESS
```

set:

```text
harnessChangedAfterFailure = true
```

because a harness-related file changed between the failed attempt and subsequent successful attempt.

If only:

```text
src/foo.ts
```

changes:

```text
harnessChangedAfterFailure = false
```

This does NOT imply malicious behavior.

It is only evidence.

The UI must describe this as:

> Harness modified after failed CI.

Do NOT describe it as:

> Agent cheated.

---

# 13. Clean Green V0

Do not create a complicated score yet.

Define V0:

```ts
cleanGreen =
  eventuallyGreen &&
  !harnessChangedAfterFailure;
```

Display First Pass Green separately.

Therefore:

### Scenario A

```text
first attempt green
```

→

```text
First Pass Green: YES
Clean Green: YES
```

### Scenario B

```text
failure
source code fix
green
```

→

```text
First Pass Green: NO
Clean Green: YES
```

### Scenario C

```text
failure
test/config mutation
green
```

→

```text
First Pass Green: NO
Clean Green: NO
```

We will refine Clean Green later.

---

# 14. GitHub App

Create proper GitHub App support.

Use Octokit.

Required permissions should initially be minimal.

Read-only access where possible to:

* repository metadata
* pull requests
* commits
* checks
* actions/workflow metadata
* repository contents only where required for diff/file information

Subscribe to at least:

```text
pull_request
check_run
check_suite
workflow_run
installation
installation_repositories
```

Every incoming webhook must validate its GitHub signature before processing.

GitHub webhook deliveries are signed using the configured webhook secret, and Octokit provides webhook verification/handling support.

Document required GitHub permissions in:

```text
docs/github-app.md
```

---

# 15. Historical import

A new customer must immediately get value.

Create:

```text
syncRepository(repositoryId)
```

For V1, historical import should retrieve approximately the latest:

```text
100 pull requests
```

for the repository.

For each PR retrieve:

* PR metadata
* commits
* changed files
* associated Actions/check data where available

Persist facts and calculate metrics.

The sync MUST be rerunnable without duplicating records.

---

# 16. Inngest

Use Inngest for durable background execution.

The current Next.js integration exposes functions through `/api/inngest`.

Create events such as:

```text
github/webhook.received

github/pr.sync.requested

github/repository.sync.requested

metrics/pr.recompute.requested
```

The webhook flow should resemble:

```text
GitHub POST
   ↓
verify
   ↓
persist
   ↓
inngest.send(
  github/webhook.received
)
   ↓
return HTTP 200
```

Implement retry-safe and idempotent functions.

---

# 17. Dashboard V0

Do NOT spend significant effort on visual design.

Create functional pages.

## /dashboard

Show:

```text
Repositories
PRs analyzed
PRs merged

First-pass green %
Eventually-green %

Average attempts to green
Median time to green

Harness changed after failure %
Clean Green %
```

---

# 18. Repository page

Route:

```text
/repos/[repoId]
```

Show:

```text
PRs analyzed
First-pass green
Clean Green
Average attempts to green

Failures by check name
```

Then a PR table:

```text
PR
Status
First pass
Attempts
Clean green
Harness mutation
Time to green
```

---

# 19. PR detail page

Route:

```text
/prs/[prId]
```

This page is important.

Display a chronological timeline:

```text
PR opened

SHA abc123
  lint          PASS
  typecheck     PASS
  unit          PASS
  playwright    FAIL

SHA def456

changed files:
  src/checkout.ts
  tests/checkout.spec.ts

  lint          PASS
  typecheck     PASS
  unit          PASS
  playwright    PASS

PR merged
```

Then clearly show:

```text
First Pass Green     NO
Attempts to Green    2
Clean Green          NO
Harness Mutation     YES
```

This timeline is the first real product demo.

---

# 20. Failure breakdown

Create a deterministic aggregation:

```text
checkName
failureCount
affectedPrCount
failureRate
```

Example:

```text
playwright      37
unit            12
typecheck        8
lint             3
```

Do not attempt to parse individual test failures yet.

---

# 21. Agent attribution

Do NOT implement Claude Code integration in the first scaffold.

However, make the domain model future-safe.

Add optional fields to PR metrics or PR metadata:

```ts
type AgentProvider =
  | "claude-code"
  | "codex"
  | "cursor"
  | "gemini"
  | "other"
  | "human"
  | "unknown";
```

Do NOT attempt automatic inference yet.

The architecture must allow attribution later without rewriting the CI model.

---

# 22. Testing strategy

Use TDD for the domain logic.

The most thoroughly tested code must be:

```text
classifyHarnessFile()
groupChecksIntoAttempts()
calculateFirstPassGreen()
calculateEventuallyGreen()
calculateAttemptsToGreen()
calculateTimeToGreen()
detectHarnessChangedAfterFailure()
calculateCleanGreen()
```

Tests must include:

### first pass

```text
GREEN
```

### repair

```text
RED → GREEN
```

### multiple repairs

```text
RED → RED → GREEN
```

### never green

```text
RED → RED
```

### harness mutation

```text
RED
test changed
GREEN
```

### normal repair

```text
RED
source changed
GREEN
```

### mixed mutation

```text
RED
source + test changed
GREEN
```

### skipped checks

Test the chosen V1 semantics explicitly.

### duplicate webhook

Confirm duplicate GitHub delivery IDs are ignored.

---

# 23. API boundaries

Do not allow GitHub API types to leak throughout the domain.

Create normalized domain types.

Example:

```ts
export interface CiCheck {
  id: string;
  sha: string;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion:
    | "success"
    | "failure"
    | "neutral"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | "action_required"
    | "startup_failure"
    | "stale"
    | null;
  startedAt: Date | null;
  completedAt: Date | null;
}
```

GitHub adapters convert GitHub responses into these normalized types.

Metric code must not import Octokit types.

---

# 24. Environment configuration

Use Zod to validate environment variables at startup.

Expected variables:

```text
DATABASE_URL

GITHUB_APP_ID
GITHUB_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET

INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
```

For local development allow Inngest development mode.

Do not silently accept missing secrets.

---

# 25. Seed/demo mode

Create a deterministic fixture dataset so the product can be demoed without GitHub.

Include at least:

```text
20 PRs
```

containing:

* first-pass greens
* repaired PRs
* never-green PRs
* Playwright failures
* unit failures
* harness mutations
* normal source fixes

Create:

```bash
pnpm db:seed
```

The dashboard should look useful immediately after seed.

---

# 26. README

The README must allow a new developer to run the application from zero.

Include:

```text
Prerequisites

Install dependencies

Start Postgres

Configure env

Run migrations

Seed database

Run application

Run Inngest dev server

Create GitHub App

Configure webhook

Install GitHub App

Run historical sync

Run tests
```

The current Inngest local development flow can use its Dev Server while the Next.js app serves the `/api/inngest` route.

---

# 27. Definition of done

The scaffold is complete when all of the following work:

### Local demo

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

shows a populated dashboard.

### Automated tests

```bash
pnpm test
```

passes.

### GitHub integration

A GitHub App installation can:

1. receive a PR webhook
2. validate the signature
3. persist the raw event
4. trigger background processing
5. persist PR/check information
6. recompute metrics
7. display the PR in the UI

### Historical import

Installing the app on an existing repository can import recent PR history.

### Demo signal

At least one PR detail page clearly demonstrates:

```text
CI failed
      ↓
new commit
      ↓
test/config changed
      ↓
CI green
      ↓
Clean Green = NO
```

---

# 28. Implementation order

Do the work in this order.

## Milestone 1 — Pure domain engine

Implement:

```text
normalized types
CI attempt grouping
First Pass Green
Eventually Green
Attempts to Green
Time to Green
harness file classification
harness mutation detection
Clean Green V0
```

No database.

No GitHub.

All tests green.

Commit.

---

## Milestone 2 — Database

Implement:

```text
Drizzle
Postgres schema
migrations
repositories
PRs
commits
CI facts
raw events
metrics
```

Add persistence integration tests.

Commit.

---

## Milestone 3 — Seed + dashboard

Create demo fixtures.

Build:

```text
/dashboard
/repos/[repoId]
/prs/[prId]
```

The complete product story must be demonstrable with seed data.

Commit.

---

## Milestone 4 — GitHub App

Implement:

```text
Octokit App
authentication
signature validation
webhook endpoint
raw event persistence
```

Test webhook verification and duplicate deliveries.

Commit.

---

## Milestone 5 — Inngest processing

Implement:

```text
/github webhook
     ↓
raw event
     ↓
Inngest
     ↓
processor
```

Keep processing idempotent.

Commit.

---

## Milestone 6 — GitHub normalization

Support:

```text
pull_request
check_run
workflow_run
```

Normalize these into domain facts.

Recompute PR metrics after relevant changes.

Commit.

---

## Milestone 7 — Historical repository sync

Implement import of the latest ~100 PRs.

Ensure rerunning does not duplicate data.

Commit.

---

## Milestone 8 — End-to-end validation

Test against a real GitHub repository.

Produce a documented example showing:

```text
RED
→ repair
→ GREEN
```

and another showing:

```text
RED
→ harness modification
→ GREEN
→ Clean Green NO
```

Commit.

---

# 29. Explicitly defer these features

Create GitHub issues or a `docs/future.md`, but DO NOT implement:

```text
Claude Code hooks
Codex attribution
Cursor attribution
model identification

JUnit parsing
Playwright report parsing
coverage parsing
SARIF parsing

flaky-test detection

LLM review
semantic code analysis

Slack alerts

weekly email

benchmarking across companies

DORA

Jira

GitLab

Bitbucket

deployment tracking

production incidents
```

---

# 30. Engineering rules

Follow these throughout implementation:

1. Write tests before domain implementation.
2. Keep business logic independent of GitHub and the database.
3. Prefer pure functions for metric computation.
4. Persist raw webhook events.
5. Make all processing idempotent.
6. Never silently discard unsupported events.
7. Log errors with repository, PR and GitHub delivery identifiers.
8. Do not weaken tests to make CI green.
9. Do not introduce abstractions without an immediate use case.
10. Commit after each milestone.
11. Run lint, typecheck and tests before each commit.
12. Do not proceed to the next milestone while the current milestone is red.

Before implementation, write the final execution plan to:

```text
docs/superpowers/plans/2026-09-07-ai-engineering-reliability-mvp.md
```

Then execute it milestone by milestone.

At the end, provide:

* architecture summary
* database schema summary
* supported GitHub events
* metrics implemented
* tests executed and results
* known limitations
* exact commands to run locally
* next three recommended product experiments
