# Fieldnote teams and repository readiness

## Status and scope

Visual design approved in conversation on 2026-09-08; user requested implementation planning. This document consolidates those decisions. Technical defaults and the scoring rubric below are proposed implementation choices, not previously approved scoring policy. Execute accounts/workspaces first, then repository grading. Each has its own implementation plan.

Visual reference: `docs/superpowers/previews/2026-09-08-workspaces-grader.html`. It is a mockup, not application code: do not copy its global CSS, inline handlers, fake saves, example users, demonstration slider, or simulated authorization into production.

## Global constraints

- Keep Fieldnote’s current visual style; Railway is a feature reference only.
- Use existing Next.js 16.3.4, React 19.2.8, PostgreSQL, Drizzle, Vitest, and Inngest conventions; do not upgrade dependencies for this work.
- Read relevant installed guides in `node_modules/next/dist/docs/` before application code changes.
- GitHub is the only sign-in provider. Resend delivers workspace invitations.
- Workspace membership grants access to every connected repository’s analytics and grading evidence, including private repositories.
- Owner manages settings, invitations, and members; Member reads analytics and runs graders. Connecting repositories additionally requires current GitHub administrator permission.
- Every completed grade preserves its commit SHA, rubric version, evaluator version, results, and evidence. Never silently recompute historical grades.
- No repository code execution, LLM grading, harness grading, or deployment grading in v0.1.
- Never include secrets, invitation tokens, GitHub credentials, or raw repository files in logs or client props.

## Accounts and workspaces

Persist user display name separately from GitHub login/avatar; refreshing GitHub identity does not overwrite an edited display name. First successful sign-in creates exactly one default workspace and Owner membership transactionally, including concurrent callbacks. Existing users receive a default workspace on their next authenticated visit. Store a nullable unique `default_for_user_id` on workspaces so deleting or removing membership cannot accidentally create multiple defaults.

Use workspaces, workspace_memberships (unique workspace/user), workspace_repositories (unique workspace/repository), workspace_invitations, and invitation_deliveries. Keep repositories globally canonical under their existing GitHub ID; linking one to multiple workspaces does not duplicate PRs or grades. Existing repository data is not assigned to arbitrary users: owners reconnect authorized repositories to their workspace, preserving imported history.

Use an HTTP-only selected-workspace cookie as a preference, never authorization. Validate membership on every page, action, and API request. Invalid selection falls back to the user's default membership, then earliest membership. An explicit unauthorized workspace ID yields 404, not fallback. Avoid shared caching of user-specific data. Workspace membership and installation/repository active status control reads; fresh GitHub permission controls linking, not reading. Allow Owners with GitHub admin access to connect/disconnect; existing import refresh/retry requires Owner plus GitHub admin to preserve current mutation policy. Members may request repository grades.

Prevent removing or demoting the last Owner using a workspace row lock. Owners can promote/demote members and remove other members. Self-removal is supported only when another Owner remains. Workspace deletion, billing, project-specific roles, and repository transfers are out of scope. Workspace creation and name edits are supported, with trimmed names of 1–80 characters.

## Invitations

Owner invites an email as Member. Normalize with trim/lowercase, not provider-specific dot or plus removal. Tokens contain 32 random bytes, are hashed in invitation rows, expire after seven days, and are accepted once. Resend rotates the token and expiry, invalidating the previous link. Revoke invalidates immediately. Limit creation/resends to 20 per owner per hour and 100 per workspace per day; minimum 60 seconds between sends for one invitation. Enforce limits transactionally in PostgreSQL.

Acceptance is a POST after explicit confirmation; an email scanner GET cannot consume it. Require a fresh GitHub verified-email match, including non-primary verified emails. Failure to fetch emails never bypasses the check. GitHub App user Email addresses read permission must be configured; do not assume OAuth scopes apply to GitHub App authentication. Use a short-lived HTTP-only invitation-continuation cookie through OAuth; only internal invitation paths are accepted. Do not reveal recipient or workspace information to an unauthenticated invalid-token request. Redact token URLs from application telemetry; use `Referrer-Policy: no-referrer` on invitation pages.

Invitation creation and a durable delivery row commit together. Store the delivery token encrypted using the existing encryption utility, only until delivery completes or is revoked. Inngest delivers via Resend using the delivery ID as idempotency key; dispatch reconciliation handles crashes before event send. Retry 429, network, and 5xx failures with bounded retries within 24 hours; terminal errors expose a safe failure status and owner resend action. Resend creates a new delivery ID. Do not automatically repeat uncertain delivery beyond the provider's idempotency window. Recheck invitation validity before sending; stale emails may still arrive during a race but cannot be accepted. Wipe encrypted payload on terminal status. Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` server-side; missing configuration leaves the app usable but invitations unavailable with an owner-facing explanation.

## UI

Sign-in is one centered card with the existing Fieldnote logo inside, GitHub logo/button, short workspace explanation, and the existing soft sage/cream background. Remove the preview’s marketing column and welcome heading. The authenticated shell has a closed-by-default workspace dropdown in the sidebar and a compact top-right profile menu with account settings, workspace settings, and sign out. Consistent row heights and padding; keyboard navigation, Escape, outside click, focus restoration, and accessible expanded state. Reuse this shell on settings, repositories, and PR detail pages. Settings include account name, workspace name, member roles, pending invitations, resend/revoke, and prominent rust Owner badges. Mobile navigation must remain available, unlike the mockup’s hidden sidebar.

## Grader data and proposed v0.1 rubric

Grading assesses the repository's default branch at a resolved commit, independent of PR metrics. Run manually from repo detail; show latest completed report alongside a separately queued/running/failed run. Persist immutable rubric definitions and append-only completed runs. Each run stores requesting workspace/user for audit, while results are repository-scoped and readable only through a current workspace link. Version keys: family `agent-readiness`, rubric `0.1.0`, evaluator `1.0.0`. Future families can be added without columns for every grader.

Proposed deterministic rubric: five checks, 20 points each, no partial credit in this first engine. A 100 means every documented check passed, not universal proof of readiness.

1. Root `AGENTS.md` or `CLAUDE.md` has non-whitespace content. Either counts; both do not double-score.
2. Root `README.md` has non-whitespace content (match filename case-insensitively).
3. At least one nonempty Markdown file beneath `docs/` (case-insensitive extension).
4. README, root agent instructions, or docs contain a Markdown heading matching `setup|install|installation|getting started` and a fenced code block before the next heading of equal or higher depth.
5. Those documents contain a heading matching `test|testing|validation|verification|checks` and a fenced code block before the next heading of equal or higher depth.

Collect the complete Git tree at the pinned SHA; on truncated recursive tree, walk subtrees with bounded traversal. Read only rubric-relevant UTF-8 regular blobs, skip symlinks/submodules, maximum 200 documents, 128 KiB/file, 2 MiB total, 10,000 tree entries. A resource limit, unreadable required blob, GitHub permission error, or rate limit produces an incomplete/failed assessment with no numeric score. Absence confirmed by complete tree is a failed check worth zero. Do not execute code or interpret instructions in repository contents. Persist paths/blob SHAs, check IDs, matched line ranges, and explanations; no raw full-file copies. Render evidence as escaped text and links pinned to SHA. Five binary checks produce multiples of 20; visual bands at 70 and 90 are still defined for subsequent rubrics. The arbitrary preview scores are demonstrations only.

Allow one queued/running assessment per repository/family. Duplicate click returns its ID. Worker locks/claims a run and resolves SHA once. Retries resume the same run and SHA. Completed runs are never overwritten. Failed runs can be retried as a new run linked to the old one. Authorized readers see old reports after rubric upgrades and a clear outdated-version indicator; no score deltas across rubric versions.

## Approved grade appearance

Compact card; preserve readable content while strengthening rarity finishes. One reusable score presentation function drives score, pointer, rating, finish, and symbol. Scale positions are 0%, 50%, 70%, 80%, 90%, 100%, not evenly spaced labels.

| Score | Label | Finish | Top-right symbol |
|---|---|---|---|
| 0–49 | Bad | Flat red, no shimmer | Red circle |
| 50–69 | Mediocre | Light holographic | Flat blue circle |
| 70–79 | Good | Bronze holographic | One bronze star |
| 80–89 | Very good | Silver holographic | Two silver stars |
| 90–99 | Excellent | Gold holographic | Three gold stars |
| 100 | Excellent | Rainbow holographic, Prismatic · Perfect score | Three prismatic stars |

Scale: white outlined `#ffffff` below 50, blue `#548eae` at 50–69, bronze `#895333`, silver `#b5c3cf`, gold `#e0b735`. Score/pointer at 50–69 use `#548eae`. Keep labels and symbols so color is not the only signal. Grade has no numeric display while evidence is incomplete. Disable pointer-driven motion under reduced-motion preference; touch users receive the static finish. No Pokémon characters/artwork or third-party card branding.

## Validation and release

Dedicated `_test` database only for integration tests. Verify tenant isolation across dashboard, PRs, reports, API polling, and actions; concurrent default creation and last-owner changes; verified email, expiry, replay, resend and delivery failures; pinned-SHA evidence and rubric immutability. Visually inspect desktop and mobile, keyboard interaction, all grade boundaries and reduced motion. Run `pnpm check` before release, reporting unavailable external prerequisites honestly. Preserve pre-existing README and next-env changes.

Sources checked 2026-09-08: https://resend.com/docs/api-reference/emails/send-email and https://docs.github.com/en/rest/users/emails?apiVersion=2022-11-28. Recheck provider details at execution time.
