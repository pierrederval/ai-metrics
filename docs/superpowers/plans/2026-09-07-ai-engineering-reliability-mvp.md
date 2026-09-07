# AI Engineering Reliability MVP — Execution Plan

Approved 2026-09-07. Original requirements: [original specification](../../original-spec.md).

## Goal and architecture
Build one deployable Next.js/TypeScript application using PostgreSQL, Drizzle, Octokit, Inngest, Zod and Vitest. Preserve raw evidence, normalize facts, derive reproducible pure projections. No incremental metric counters or LLM judgments. Include GitHub customer sign-in and repository-scoped authorization.

## Locked domain decisions
Explicit versioned repository gate lists identify app + exact check name. Empty configuration is unknown. One attempt per PR SHA; preserve execution/rerun history. First-pass requires initial executions to succeed; successful reruns never erase initial failure. Eventually-green includes the first attempt. Attempts-to-green is the one-based SHA index, including same-SHA repair as one. Time-to-green runs from first CI start to first simultaneous complete green state. New executions invalidate a prior gate result while pending. Missing, skipped and neutral gates are not success.

Outcomes are nullable: pending, unconfigured or incomplete history is displayed separately with denominators. Preserve provable failures. Harness mutation means a classified change in a later observed PR revision after failed CI, through first green or latest revision. Use revision comparisons and observed order, not author dates. Unknown diff/order evidence stays unknown. Clean Green is eventuallyGreen AND NOT harnessChangedAfterFailure with nullable logic. Wording: “Harness modified after failed CI.”

Pure domain interfaces cover revisions, policies, executions, changed files, evidence, timelines and metrics; analyzePullRequest(facts, gatePolicy) is the entry point. No Octokit/database types in domain code.

## Milestones
- [x] 1. Bootstrap strict TS, pnpm, lint/typecheck/Vitest. TDD classifier, attempts, chronology, metrics, mutation and timeline. Verify before commit.
- [x] 2. Drizzle schema/migrations for nine core entities plus gate policy versions, revision history, observations, PR/run associations, users, encrypted credentials, sessions and dispatch state. Idempotent writes and transactional PR locks/projections. Docker PostgreSQL and integration tests. Verify before commit.
- [ ] 3. At least 20 repeatable demo PRs; dashboard, repository and PR timeline; aggregate denominators, failure breakdown, gate settings and import progress. Central access checks and explicit non-production fixture-only demo mode. Verify build and tests before commit.
- [ ] 4. GitHub App OAuth, state validation, token encryption/refresh, server sessions/logout, revalidated repository access and administrator mutations. Signed raw-byte webhook verification and unique delivery persistence. Document minimal read permissions. Verify before commit.
- [ ] 5. Inngest webhook/PR sync/repository sync/recompute events with internal IDs. Persist before dispatch, replay unfinished dispatch, reconcile stale processing, serialize per-PR work. Verify before commit.
- [ ] 6. Normalize pull_request, check_run, check_suite, workflow_run, installation and installation_repositories. Preserve Actions attempts; correlate jobs and checks. Paginate and record incomplete/revoked evidence; distinct cumulative/revision diffs. Verify before commit.
- [ ] 7. Resumable latest-100 PR historical import, all states, creation order. Metadata, commits, files, checks, Actions and completeness. Install trigger and authorized retry; repeated import idempotence. Verify before commit.
- [ ] 8. Full local/build/security/replay validation. Real GitHub validation only with available authorized credentials/repository; report honestly otherwise. README, architecture/domain/GitHub setup/future docs. Final architecture/schema/events/metrics/test/limitations/commands/experiments report.

## Validation
Domain tests: all original scenarios, same-SHA reruns, concurrency, absent gates, skipped/neutral checks, late events, force pushes, renamed files, missing timing, duplicate and permuted input. Integration: invalid signatures, duplicate delivery, dispatch failure/crash recovery, concurrent updates/replay, cross-repository access/revocation/expired credentials/non-admin writes.

Boolean rates exclude unknowns and show denominators. Average attempts includes known green PRs; median time uses known durations. Gate failure rate uses failed terminal relevant executions / terminal relevant executions excluding neutral/skipped. Empty denominator is an em dash. pnpm test is database-independent; pnpm test:integration uses dedicated Postgres. Run lint, typecheck and applicable tests before each milestone commit; build from milestone 3 onward. Never advance with failing checks.

## Defaults
GitHub.com only. GitHub App user OAuth; no separate tenant/team system. Additional env: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, APP_URL, TOKEN_ENCRYPTION_KEY. Explicit local demo needs only DB; production refuses demo auth. No hosting provider selected. All original deferred features go in docs/future.md. Work inline on codex/reliability-mvp in the fresh repository; no external publishing.
