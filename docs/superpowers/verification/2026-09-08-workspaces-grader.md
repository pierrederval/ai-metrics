# Fieldnote implementation verification

Worktree: `/private/tmp/fieldnote-workspaces-grader`; branch `codex/fieldnote-workspaces-grader`.

## Team workspaces

- Lint, TypeScript, 145 unit tests and 61 database integration tests passed.
- Production build passed with dedicated test database and production-shaped fixture configuration. No deployment was performed.
- Real application inspected at 1440 × 900 and 375 × 812 using synthetic users in the dedicated `_test` database.
- Verified logo-only sign-in card, compact closed workspace dropdown, keyboard selection, top-right profile menu, rust Owner badge, account/workspace name persistence, workspace creation, read-only Member controls, last-owner rejection and sign-out.
- Verified a separate user receives a generic unavailable page for a private repository outside their workspace.
- Verified missing Resend configuration produces an error instead of a success state. Provider sends and GitHub email lookup are mocked in automated tests; no real invitation email was sent.
- Browser QA caught and fixed canceled native sign-out submission and stale form state after workspace creation. Database verification caught and fixed test fixture cleanup order.

## Repository grader

Implementation and verification in progress at the time of writing. No completed-grader claim yet.

### Completed 2026-09-10

The grader was run end to end against `pierrederval/ai-metrics` through the installed GitHub App, on the branch that became PR #12.

- Run reached `state=complete` in under five seconds at pinned commit `bfa73d4136bb7336ed2fe3955e8162aea8ec6c87`.
- Score 60/100: `root-agent-instructions`, `root-readme` and `docs-markdown` passed at 20 points each; `documented-setup` and `documented-tests` scored 0.
- The report page rendered the stored result, and the repository page linked to it.
- The `grade_runs_one_active` partial unique index was observed rejecting a second concurrent request for the same repository.

Two defects blocked every earlier attempt and are fixed:

- Next 16.3 delivers Page params with their escaped segment values, so `repository:1360100266` arrived as `repository%3A1360100266` and never matched a stored id. Repository and grading pages returned 404 and the grade action failed before writing any row, which is why `grade_runs` and `grading_rubrics` were empty. Resolved with the `pageRouteId` helper.
- Repository and pull request links rendered non-canonical pathnames, so Link prefetch retried continuously instead of caching a route segment.

Open question, not a defect in the plumbing: `documented-setup` and `documented-tests` scored 0 against a repository whose README documents `pnpm dev` and `pnpm test`. Review rubric detection before a score is shown to anyone.

## External setup and limits

Live GitHub OAuth, GitHub installation collection and Resend delivery have not been exercised during this implementation. Configure the exact callback URL, GitHub Account Email addresses read permission, repository Contents read permission, verified Resend sender and API key, public HTTPS APP_URL, and Inngest environment keys before deployment verification. Apply additive migrations before serving the new application. Application rollback retains the new tables and records.

Do not deploy or send real invitation email as part of local verification. Preserve existing README.md and next-env.d.ts edits in the original checkout.
