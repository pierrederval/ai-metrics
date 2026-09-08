# Repository onboarding and first PR import

Date: 2026-09-08
Status: Proposed design, ready for user review

## Outcome

A signed-in customer with no tracked repository selects one GitHub repository and explicitly starts its first analysis. Fieldnote imports up to the latest 100 pull requests, displays truthful progress, and opens the engineering record when results are available. Use the existing application's visual design throughout.

PR and CI statistics are the initial product scope. Source-code analysis is a separate future paid package. This work adds no checkout, sandbox, LLM analysis, billing, or upsell step.

The initial visual exploration used an analysis placeholder. This design connects onboarding to the existing real PR import pipeline; production must never simulate an import or display fabricated results.

## Existing system

The application is Next.js with PostgreSQL/Drizzle and Inngest. The repository worker lists the latest 100 PRs by creation date, including open and closed PRs, then invokes one durable child job per PR. Hydration collects PR metadata, commits, changed-file metadata, check runs, and GitHub Actions job attempts. Persistence stores evidence and computes deterministic metrics together.

The worker already records successful PR counts and complete, partial, and failed outcomes. Repository-level jobs are singletons; child jobs are serialized by repository and PR number. Raw signed webhook deliveries are retained and dispatched durably. GitHub user credentials determine access; installation credentials fetch repository facts.

Currently, installation events can start imports for all accessible repositories. The dashboard displays accessible repositories without a distinct tracking selection. These behaviors must change together.

## Product flow

1. GitHub authentication remains the existing entry point.
2. On return, load currently accessible installed repositories and reconcile missing local repository records without starting imports.
3. If any accessible repository is already tracked, show the dashboard and any ongoing import status. Otherwise show onboarding.
4. Show GitHub as connected and ask the user to select one repository. Nothing is selected by default. Display owner/name and visibility, and support searching the available list.
5. The primary action is “Start first analysis”; it stays disabled until a repository is selected. Explain the scope before submission: “Import the latest 100 pull requests and their CI history.”
6. Revalidate repository access and administration rights on the server, save tracking selection, and durably request the import. Repeated submissions reuse the active request.
7. Replace the selection panel with import progress. Closing or refreshing the page does not interrupt the job; returning resumes the persisted view.
8. Once complete, show a quiet completion state and a “View engineering record” action. Do not force navigation while the user is reading.

Selection does not itself cause a network import until the primary action is submitted. Later repository additions reuse this flow. A return visit never starts another import automatically.

## Selection and authorization

Tracking is repository-level, shared among users who already have GitHub access to that repository. Introduce a nullable `trackingStartedAt` on repositories; GitHub installation availability and tracking are separate concepts. Installation reconciliation never overwrites this field.

Keep the existing rule that initiating imports requires repository administrator rights. A user with read access can view a tracked repository and its progress. In the picker, repositories lacking administration rights display “Ask a repository admin to enable analysis” and cannot be submitted. This preserves the current permission boundary rather than silently broadening it.

Every start, retry, status read, and results request must check current GitHub access. Revoked access hides the repository even if it was previously tracked. Workers check active installation/repository state and tracking before hydration. Webhook-triggered PR hydration and manual imports must also respect tracking.

Existing non-demo repositories with imported PR records are migrated to tracked so current users retain their engineering records. Installed repositories without imported records remain untracked. Development demo mode stays explicitly opt-in; normal onboarding and production never substitute seed data for missing results.

## GitHub access states

GitHub login and GitHub App repository access are distinct. If no installed repositories are available, explain the missing access and offer the configured GitHub App installation/settings link. On return, refresh available repositories without enqueuing analysis. Missing repository search results offer the same access route. Organization approval pending is a waiting state with a refresh action, not a successful connection or import.

Failure to fetch the repository list shows a retry action and preserves the session. Do not interpret a GitHub error as an empty list. Never render an invented repository in the real picker.

## Durable import state

Add a repository import record rather than relying only on the existing aggregate status fields. Each run has an ID, repository ID, creation/start/finish timestamps, state, discovered total, successful count, failed count, and a safe user-facing error summary. Persist the selected PR numbers once discovery completes; retain per-PR outcomes so retries target failures from that same initial batch.

States are queued, discovering, importing, complete, partial, and failed. Total is unknown until discovery completes. Before then use an indeterminate activity indicator, with no percentage. During import show “X of Y PRs imported” and separately disclose failures. Success requires every selected PR to complete. A zero total is a successful import with an explicit “No pull requests yet” empty state.

Save tracking and the queued run atomically in PostgreSQL. Use the run ID as the Inngest event identity. A scheduled dispatcher retries queued undispatched runs; do not depend on the browser keeping a request alive. Prevent multiple active runs per repository with a database-enforced constraint and transaction. Protect terminal updates against an older run overwriting a newer run. Keep the existing worker retry behavior, but make progress writes idempotent under durable step replay.

Partial runs retain successful records, offer “View imported PRs,” and allow authorized users to retry only the failed batch items. A fully failed run retains the selected repository and offers retry. A temporary GitHub rate limit remains an honest waiting/retrying state rather than advancing progress. Do not expose internal stack traces, credentials, or raw infrastructure errors.

The browser polls an authenticated status endpoint while the run is active, approximately every two seconds while visible, backing off on failures and pausing in hidden tabs. Poll immediately when returning to the tab. Stop polling terminal states. A status transport failure shows “Reconnecting to import status” without claiming that the job itself failed.

## Statistics and evidence

Import the newest 100 PRs by creation date, or all PRs if fewer exist; include open, closed, and merged PRs. This is a count-limited initial snapshot, not a complete repository history. Label its coverage on the results screen. New webhook updates continue for tracked repositories after the initial import.

No repository clone is required. Changed-file metadata and CI evidence remain part of PR statistics; this does not introduce source-code analysis.

Existing reliability metrics depend on configured required CI gates. Import completion means evidence was imported, not that every reliability metric is computable. Show available PR facts immediately; offer administrators the existing gate configuration from the repository screen, with explanatory copy for unavailable reliability metrics. Do not add a gate configuration step to onboarding or invent defaults for which checks define success.

Historical first-pass and attempts-to-green measurements can remain unknown because pre-installation head chronology is missing. Preserve evidence reasons and existing unknown-value denominator rules. No fabricated percentages, scores, durations, or historical outcomes.

## Visual design and motion

Reuse `src/app/style.css`, the existing sidebar, serif headings, green palette, rust accents, background treatment, and established component spacing. The earlier preview defines the flow, not a replacement design system.

Keep the selected repository visually anchored as the picker collapses into a compact repository heading. Use a brief 200–300 ms opacity/vertical-position transition to reveal the import panel. Animate real progress changes over roughly 250 ms. A restrained completion check appears when the server reports completion. Avoid confetti, artificial delays, auto-incrementing progress, or motion that implies unreported work.

Keep button and focus behavior accessible. Announce stage changes and occasional progress updates through a polite live region without announcing every poll. Respect `prefers-reduced-motion` by removing movement and progress interpolation. Layout must remain usable on narrow screens and with keyboard navigation.

## Implementation boundaries

- Repository discovery/access: `src/auth/access.ts`, `src/github/repositories.ts`, and existing GitHub App configuration.
- Tracking/import persistence: `src/db/schema.ts`, a Drizzle migration, and focused repository-import queries.
- Import dispatch/progress: existing `src/inngest/functions/sync-repository.ts`, PR child worker, and a queued-import reconciliation function registered in the Inngest route.
- Event gating: `src/github/handle-event.ts` and direct import entry points, including the CLI and repository action.
- Onboarding UI: focused repository picker and import progress components, authenticated server actions/status route, and dashboard routing.
- Results: reuse existing repository pages and gate configuration; filter overview data to accessible tracked repositories.

No new service or UI dependency is required. Before changing Next.js code, read the relevant local guides in `node_modules/next/dist/docs/` as required by AGENTS.md.

## Verification and acceptance

- Signed-in user with no tracked repository sees setup, not seed data or empty metric cards.
- Installation and unrelated webhook events cannot import unselected repositories.
- An administrator can select an accessible repository and start exactly one durable run, even with repeated clicks or dispatch failure.
- Unauthorized and revoked-access requests cannot start or inspect imports.
- Import discovery fixes a maximum-100 PR batch and reports the actual total; replay cannot double-count successes.
- Refresh and navigation preserve selection and server-reported progress.
- Empty, failed, partial, reconnecting, and revoked-access states are truthful and actionable.
- Retrying partial imports does not discard successful evidence or silently expand the original batch.
- Existing repositories with imported evidence remain available after migration.
- Unknown evidence and unconfigured gates remain distinguishable from failure and zero values.
- Verify desktop/mobile layout, keyboard focus, reduced motion, and transitions in the real app.
- Run focused unit and database integration tests for selection, authorization, durable dispatch, progress, retry, and migration; then run repository lint, typecheck, unit/integration suites, and production build. Report any unavailable service-dependent verification explicitly.

## Deferred scope

Source-code checkout and analysis, paid entitlements and billing, deeper historical backfills, multi-repository selection in the initial picker, and analytics beyond the current PR/CI evidence model are separate work.
