# GitHub App setup

Create a GitHub.com App under Developer settings. Enable user authorization and expiring user tokens. Set the user callback to `APP_URL/api/auth/callback`, the setup URL to `APP_URL/dashboard`, and the webhook URL to `APP_URL/api/github/webhook`.

Repository permissions (all read-only): Metadata (mandatory), Pull requests, Contents (commit and comparison file lists), Checks, Actions. No organization or user permissions are needed. Gate policy uses explicit administrator-selected names; branch protection/ruleset permissions are not required.

Subscribe to pull_request, check_run, check_suite, workflow_run, installation, installation_repositories. Installation lifecycle events are delivered automatically where GitHub does not expose a subscription checkbox.

Generate a private key and place it in GITHUB_PRIVATE_KEY (escaped newlines accepted). Configure GITHUB_APP_SLUG, GITHUB_APP_ID, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and GITHUB_WEBHOOK_SECRET; use at least 16 random characters for the webhook secret. Generate TOKEN_ENCRYPTION_KEY with `openssl rand -hex 32`. Set DEMO_MODE=false. In production APP_URL must use HTTPS and Inngest signing/event keys are required.

Install on selected repositories, sign in with GitHub, and choose a repository in onboarding to start its first analysis. Select required gates after the import discovers checks; saving a policy recomputes all imported PR projections and increments the visible policy version.

User access is checked with GitHub App user tokens against accessible installations and repositories on each protected request. Only users with GitHub repository administrator permission can change gates or request manual imports. Removed/suspended installations and repositories are denied. Credentials use AES-256-GCM at rest; browser sessions contain opaque random identifiers, stored hashed in PostgreSQL. OAuth state expires after ten minutes. User-token refresh is serialized per user.

The webhook verifies HMAC-SHA256 against raw bytes before parsing. Delivery identifiers are unique. Unsupported event names/actions remain stored with an explicit disposition once processing is enabled.

## Connect repositories and follow imports

Set `GITHUB_APP_SLUG` to the URL slug from `https://github.com/apps/<slug>`. Onboarding uses it for the install/access link. Installing the app or granting additional repositories makes them available for selection; it does not start tracking or import history. Organization approval may be required before repositories appear. After access is granted, use **Refresh repositories**, choose a repository, then **Start first analysis**. Starting analysis requires repository administrator permission. Other members with current GitHub access can read tracked records, but cannot start, refresh, or retry imports or change gate policy.

An initial import fixes a batch of the newest 100 PRs by creation date, including open, closed, and merged PRs, or all PRs when fewer exist. Repeated starts reuse the existing run. A partial retry creates a linked run using the same batch and preserves completed items; it only rehydrates unfinished items. A fresh refresh selects a new latest-100 batch. New webhook activity updates tracked repositories independently of that initial coverage. With no required-gate policy, imported PR and CI facts remain visible, while gate-dependent outcomes remain unknown. A zero-PR completion shows an empty record, not invented metrics.

The onboarding URL stores the repository and run ID so a reload can resume the persisted run. Status reads recheck current access; polling pauses while the browser tab is hidden and stops for terminal states or denied access. A repository administrator can request a fresh import from the repository page. The operator CLI `pnpm github:sync <repository-id>` also requests a fresh import, but only for an already tracked, active repository; it cannot enroll an installed repository.

## Import operations and release order

The database is the durable queue: starting analysis atomically sets `tracking_started_at` and creates a `repository_imports` row. An immediate event send is attempted after commit. If it fails, `reconcile-repository-imports` runs every minute and retries undispatched queued rows. Keep that Inngest function registered alongside the import worker. The separate raw-webhook reconciler continues to run every five minutes.

In the Inngest development or production UI, inspect `github/repository.sync.requested` events and the `sync-repository` function. Match `event.data.runId` to `repository_imports.id`; `event.data.repositoryId` identifies the repository. Event IDs use the run ID for deduplication. The worker records durable per-PR steps and separate completed/failed counts. Use read-only database inspection when diagnosing a run:

```sql
SELECT id, repository_id, state, total, completed, failed,
       retry_of, dispatched_at, created_at, finished_at
FROM repository_imports
WHERE id = '<run-id>';

SELECT number, state
FROM repository_import_items
WHERE run_id = '<run-id>'
ORDER BY number;
```

Before cutover, stop new legacy import requests and drain old active Inngest imports. Apply `drizzle/0001_high_hellcat.sql` with `pnpm db:migrate` before deploying the new application and worker definitions as one coordinated release. The migration marks non-demo repositories with existing PR evidence as tracked and leaves installed repositories without evidence untracked. Existing imported history remains readable without inventing a historical run.

Old repository-only sync events are incompatible: the new event schema requires both repository ID and run ID, and the worker verifies tracking and run ownership. Do not replay old events or fabricate run IDs to bypass enrollment. After migration and coordinated worker deployment, use the normal administrator action or the tracked-repository CLI to request a valid run. Confirm the queued-run reconciler is registered and follow its event/run ID before opening new requests. Migration tests and local fixtures do not establish production health; see [onboarding validation](validation-onboarding.md) for the checks actually performed.
