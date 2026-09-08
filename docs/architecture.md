# Architecture

The MVP is one Next.js application backed by PostgreSQL. GitHub sends a signed delivery to `/api/github/webhook`; the route verifies the untouched body, persists the raw event under its unique delivery ID, dispatches only its internal database ID to Inngest, and returns. Inngest owns hydration, normalization, repository imports, and projection recomputation.

```text
GitHub -> signed webhook -> raw github_events row -> Inngest
                                                   |
                                                   v
GitHub REST -> normalized immutable facts -> pure PR analyzer
                                                   |
                                                   v
                                  replaceable pr_metrics projection
                                                   |
                                                   v
                         server-rendered, repository-authorized UI
```

The domain layer imports neither Octokit nor Drizzle. `analyzePullRequest(facts, gatePolicy)` groups required checks by PR SHA, reconstructs green states from execution chronology, detects harness changes over observed revision edges, and returns a complete projection. Persistence replaces that projection inside the same repository advisory lock used for fact changes and gate-policy changes.

Webhook dispatch and event processing are independently idempotent. Failed dispatch leaves a stored, undispatched row for reconciliation. Processing uses a database lease, records unsupported events, retries transient errors, and marks terminal failures. PR hydration is serialized by repository and PR number; repository imports use one durable child invocation per PR and expose progress and partial errors.

GitHub App installation tokens hydrate facts. Customer GitHub App user tokens determine visibility and administration rights. Each protected request rechecks the user's currently accessible installations and repositories. Browser sessions contain random opaque values whose hashes are stored in PostgreSQL; encrypted user tokens use AES-256-GCM.

PostgreSQL remains the source of truth. The app can be deployed as a normal Node.js Next.js service with externally managed PostgreSQL and Inngest. No Redis, queue service, microservice, or analytics database is required by the application.

## Repository enrollment and durable import runs

GitHub installation membership and tracking are separate. Installation reconciliation records accessible repositories without scheduling history imports. `repositories.tracking_started_at` gates ingestion and live results; onboarding starts tracking with the first queued run in one transaction under the repository lock. Migration `0001_high_hellcat.sql` preserves non-demo repositories that already have PR evidence. Demo access stays explicit and development-only.

`repository_imports` stores run state, counters, dispatch time, retry lineage, and safe public messages. `repository_import_items` persists the fixed PR-number batch and each item's outcome. One active run per repository and idempotent item updates prevent duplicate starts or replayed work from inflating progress. Discovery requests at most 100 PRs ordered by creation date across all PR states. Imports reuse the existing PR hydration and evidence analyzer; no source-code analysis, LLM calls, billing, or checkout is added.

The post-commit dispatcher sends `github/repository.sync.requested` with repository ID and run ID. Its event ID is the run ID; the one-minute `reconcile-repository-imports` worker recovers queued records whose send did not complete. The sync worker verifies repository tracking and run ownership before work. Durable child invocations hydrate each PR, retain successful evidence after other PRs fail, and finish as complete, partial, or failed. Retrying copies the fixed batch into a linked run and skips completed items; refreshing an already tracked repository discovers a fresh latest-100 batch.

The server renders the initial status, and the client polls persisted snapshots with backoff on transient failures. Status reads and actions require current GitHub access, while mutations additionally require administrator permission. Hidden tabs pause requests; terminal, unauthenticated, and inaccessible responses stop polling. Progress reflects persisted item counts; coverage is the imported batch rather than an all-history claim. Raw facts remain useful without a gate policy, while gate-dependent metrics retain unknown semantics.

Release migration before the coordinated application/worker update and drain old active imports first. Old repository-only sync events cannot execute under the new schema; see [GitHub App operations](github-app.md#import-operations-and-release-order) and [validation evidence](validation-onboarding.md).

## Basic dashboards and retained history

Basic dashboards use separate review, workflow-attempt, and PR-completeness evidence; they do not reinterpret the advanced `pr_metrics` projection. Collection preserves review source identities, dismissal targets, workflow identities `(repository_id, run_id, attempt)`, PR links, timestamps, and provenance. Pure classifiers reconstruct PR outcomes at merge and operational workflow outcomes at the selected range end. A workflow linked to multiple visible PRs is counted once within its repository. Workflow conclusions determine outcomes; job totals do not.

The server first checks current GitHub repository access, then selects each repository's latest 100 PRs ordered by `opened_at DESC, id DESC`. That same boundary applies before dates, aggregate evidence loading, and direct PR detail reads. Free is the only active entitlement. Collection can retain older records without exposing their metrics. Interest registration uses the authenticated user and a unique `(user_id, feature)` row; it grants no entitlement.

Overview and repository pages share range resolution, database loading, pure daily aggregation, and presentation. UTC calendar days retain every date, including gaps and incomplete today. Aggregates sum raw numerators and denominators across visible repositories. Coverage combines discovery, import, hidden history, and evidence completeness; an import's completion alone cannot establish complete date coverage. Unsupported comparisons are suppressed. The repository directory separates successful synchronization timestamps from the latest failed attempt and labels source PR activity separately from local ingestion.

After a complete or partial foreground import, one retained `history_backfills` run fixes a calendar-year cutoff. Discovery scans all PR states by descending update time, so older PRs active during the year qualify. A slice performs one page or one PR hydration, committing items and cursor before the next dispatch. A final discovery sweep handles pagination movement; unchanged items are deduplicated, while a newer source update reopens an item. The horizon is not a deletion policy, and refreshing the latest-100 import does not start another year scan.

Background work reuses `syncPullRequest` directly inside its durable bounded step. A nonblocking installation advisory lock serializes background slices, with at most three background functions globally and one per repository. Queued imports, unprocessed source events, and durable foreground hydrations take priority. `foreground_hydrations` stays active through retries even after the raw webhook is marked processed. It records execution ownership and retry deadlines so recovery cannot complete another execution or shorten an existing rate-limit pause.

Foreground and background collectors share a per-PR advisory lock. Its separate coordination pool has at most three connections; the normal data pool has ten, giving a maximum of 13 PostgreSQL connections per application process. Budget for all service processes and operator tools. `closeDb()` closes both pools. An advisory-lock transaction spans a bounded network unit; no row lock is held across that API work.

The one-minute history reconciler recovers creation/dispatch gaps and due retries. The five-minute GitHub event reconciler also recovers stale foreground hydrations. Active repository/installation checks stop collection after access removal. See [worker registration and recovery](github-app.md#dashboard-release-and-background-operations), [timestamp limits](github-app.md#dashboard-evidence-collection), and [observed validation](validation-dashboard-metrics.md).
