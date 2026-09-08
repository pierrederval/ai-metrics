# Dashboard metrics validation and release handoff

Validation date: 2026-09-08. Scope: [issue #5](https://github.com/pierrederval/ai-metrics/issues/5), [approved design](superpowers/specs/2026-09-08-dashboard-metrics-design.md), and [implementation plan](superpowers/plans/2026-09-08-dashboard-metrics.md). The implementation builds on merged onboarding PR #4. No production deployment, scheduler rollout, GitHub configuration mutation, or merge was performed.

## Automated verification

Phase 8 reran the complete checks against the implemented Phases 1–7, after the browser fixes. The final review fix reran them after correcting custom-date bounds:

| Command | Observed result |
| --- | --- |
| `pnpm lint` | Passed, exit 0 |
| `pnpm typecheck` | Passed, exit 0 |
| `pnpm test` | 217 tests in 38 files passed, exit 0 |
| `TEST_DATABASE_URL=postgres://reliability:reliability@localhost:55432/reliability_test pnpm test:integration` | 67 tests in 14 files passed, exit 0 |
| `pnpm build` with synthetic production configuration | Next.js 16.3.4 compiled, checked types, generated pages, and finished successfully, exit 0 |

Integration tests used the dedicated local `_test` PostgreSQL database, including migration/schema, Free access, hydration persistence, backfill recovery, foreground lifecycle/deadlines, aggregation, and interest persistence cases. Unit tests cover review/CI classifications, endpoint normalization, UTC ranges, weighted rates and exclusions, rendering, authorized callers, and interest action failures. Passing mocked and database tests does not establish production scheduler or GitHub retention behavior.

The build set `NODE_ENV=production`, `DEMO_MODE=false`, an HTTPS `APP_URL` on `example.invalid`, synthetic GitHub/encryption/Inngest values, `INNGEST_DEV=0`, and a newly generated RSA key in process memory. It used the dedicated local test database URL. The generated key was unrelated to any installed App and was not saved. No original `.env` was copied, printed, or changed. The worktree's generated `next-env.d.ts` returned to its normal `.next/types` import during the build; the original checkout's unrelated files remained outside this change.

## Browser evidence

The controller exercised the actual local Next application with explicit synthetic records in disposable `ai_metrics_ui_test`, at 1024×900 and 390×844. Screenshots are viewport captures: the browser returned 1009×887 desktop and 375×812 mobile JPEG images for those requested layouts. Their extensions match the returned format; image bytes were preserved. Their fixture totals demonstrate the implementation and are not live GitHub results or expected values from the illustrative design preview.

| Area | Observed result |
| --- | --- |
| Shared dashboard and navigation | Three KPI/chart panels, separate repository directory, correct active navigation, GitHub links, source labels, and range preservation from Overview/directory to repository |
| Presets and custom dates | Exactly 7, 30, and 90 daily positions per chart; valid custom week; reversed dates blocked by native validation; custom input refreshed after preset navigation; Apply/preset focus retained |
| Long mobile range | 366 daily buttons and selector options per chart retained; chart width/scroll width both 301px and document scroll width 375px at a 390px viewport after the overflow fix |
| Daily details and colors | Click/tap targets and keyboard Tab update date details and denominators; green `#416951`, amber `#c49a48`, rust `#995735` match the approved preview |
| Free visibility | Fixture retains 120 PRs; 100 visible. Hidden PR 120 returns 404, while visible PR 001 renders its advanced record. Date filters and interest registration do not unlock the hidden record |
| Pending/empty/failed | Pending workflow excluded from the denominator with a gap and em dash; failed empty import exposes unknown coverage, no fabricated counts/rates, no successful fetch, and advisory “detected” wording |
| Disconnected access | Deactivated repository route returns 404 |
| Interest failure and success | Real server action rejects signed-out request with retry; retry control receives focus. Synthetic valid local session persists one row, shows success only after persistence, and remains registered after reload/reopen |
| Dialog accessibility | Escape and Close return focus to the trigger; success status receives focus; 390px layout fits |

The synthetic repository's seven-day query returned 28 merges, first-pass 7/21, and CI success 14/21. Its 30-day query returned 100 merges, first-pass 25/75, and CI success 50/75; 90 days retained those totals with 90 positions. Free coverage stayed partial. These match independent fixture expectations and displayed cards. The custom-input, focus, and full-year chart overflow defects found during browser checks were fixed and retested before this final suite.

Reduced-motion CSS was inspected; the OS motion preference was not toggled. Mobile-sized browser interaction exercised click/tap targets, not a physical touch device. Reversed-range rejection was observed in the browser; other malformed/future/bounds cases have automated coverage. Local Next development logs emitted a negative `performance.measure` timestamp while displaying the correct 404 UI; no framework patch was attempted, and the production build passed without that diagnostic.

| Screenshot | Evidence |
| --- | --- |
| [Before desktop](screenshots/dashboard-metrics/before-desktop.jpg) / [before mobile](screenshots/dashboard-metrics/before-mobile.jpg) | Baseline synthetic dashboard |
| [After desktop](screenshots/dashboard-metrics/after-desktop.jpg) / [after mobile](screenshots/dashboard-metrics/after-mobile.jpg) | Shared dashboard and coverage |
| [Desktop charts](screenshots/dashboard-metrics/charts-desktop.jpg) / [mobile charts](screenshots/dashboard-metrics/charts-mobile.jpg) | Daily panels, local legends, responsive layout |
| [Repository directory](screenshots/dashboard-metrics/repositories-desktop.jpg) | Separate repository navigation and metadata |
| [Interest success](screenshots/dashboard-metrics/interest-mobile.jpg) / [interest failure](screenshots/dashboard-metrics/interest-error-mobile.jpg) | Persisted success and recoverable error UI |

## Authorized live GitHub smoke

Using the existing read-only App installation for `pierrederval/ai-metrics`, the controller ran the implemented `syncPullRequest` twice for PR #4 into isolated `ai_metrics_live_test`. Both runs left identical counts: one `dashboard_pr_evidence` row, zero review rows, zero workflow-attempt rows, and zero PR/workflow links. The same double hydration was rerun after the foreground coordination changes and shut down both database pools successfully.

The repository had no workflows, reviews, or review timeline transitions to hydrate. PR #4 classified as **ineligible**, with `chronologyComplete=false`, review/CI completeness true, and review/CI applicability false from the observed empty endpoints. This proves endpoint reachability, empty-evidence handling, and idempotent persistence. It does **not** validate live approval, dismissal, rerun identities, or first-pass success; those are verified by deterministic fixtures and integration tests. No unknown outcome was overridden to populate a card.

The implemented `discoverHistoryPage` also returned all four repository PRs, including #4, with four source-update timestamps and `nextPage=null`. No worker event was sent by that smoke. Real multi-page history, rate limits, and recovery scheduling were exercised through tests, not through production GitHub traffic.

App permissions already included Actions, Pull requests, and Checks read. A read-only App configuration check found **`pull_request_review` missing from subscriptions**. Enabling it is a required rollout action before relying on fresh review webhooks; no configuration or permissions were changed. Existing Pull requests read permission covers the PR timeline endpoint. Real credentials were accessed only in process memory for the authorized smoke and did not enter fixtures, screenshots, logs, or this report.

## Interpretation and remaining release work

Free means latest 100 PRs per repository by creation time with stable ID tie-breaking, selected before dates. It limits visibility, not collection. A completed/partial first import starts independent one-year activity backfill; old active PRs can qualify, and collected records are retained. See [migration order, worker registration, recovery, and the 13-connection per-process budget](github-app.md#dashboard-release-and-background-operations).

Custom dates require a finished complete/partial two-sweep discovery. Its cutoff establishes the lower bound; later persisted `dashboard_pr_evidence.collected_at` for visible PRs in a discovered, authorized repository can extend the upper bound beyond the initial backfill completion, capped at today. Hidden PRs, unselected/revoked repositories, and mutable provider timestamps cannot extend it. Without established discovery the bounds remain unknown. This selectable range does not establish continuous collection: coverage still uses the scan's original completion time, later empty days remain gaps, and unsupported comparisons remain suppressed. The final query regressions cover a September 8 backfill followed by September 15 collection, visibility/access isolation, and the today clamp; component coverage verifies the advanced input maximum and defaults.

PR outcomes are evaluated as of merge. Workflow outcomes use run-attempt conclusions, never job totals. GitHub's mutable `updated_at` is stored as source metadata rather than exact completion. An observed terminal snapshot gives a conservative upper bound; earlier historical cutoffs stay unknown. Operational day attribution can fall back to that observation only when start and observation share one UTC day. Missing chronology, deleted/dismissed review transitions, unresolved team history, unsupported provider mappings, retention gaps, or truncated workflow results can reduce coverage and suppress comparisons. Pending, cancelled, skipped, neutral, and unknown results stay outside the CI rate denominator.

Final independent whole-branch spec/code review and the implementation PR remain controller-owned. Production migration execution, worker registration/scheduling, subscription enablement, capacity testing, and deployment remain unperformed. Do not infer production readiness from this build or from the isolated live reads. Deferred performance review concerns are the materialization of visible IDs across accessible repositories and sequential evidence/lifecycle reads; no unreviewed performance refactor was included in the handoff.
