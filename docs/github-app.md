# GitHub App setup

Create a GitHub.com App under Developer settings. Enable user authorization and expiring user tokens. Set the user callback to `APP_URL/api/auth/callback`, the setup URL to `APP_URL/dashboard`, and the webhook URL to `APP_URL/api/github/webhook`.

Repository permissions (all read-only): Metadata (mandatory), Pull requests, Contents (commit and comparison file lists), Checks, Actions. No organization or user permissions are needed. Gate policy uses explicit administrator-selected names; branch protection/ruleset permissions are not required.

Subscribe to pull_request, check_run, check_suite, workflow_run, installation, installation_repositories. Installation lifecycle events are delivered automatically where GitHub does not expose a subscription checkbox.

Generate a private key and place it in GITHUB_PRIVATE_KEY (escaped newlines accepted). Configure GITHUB_APP_ID, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and GITHUB_WEBHOOK_SECRET; use at least 16 random characters for the webhook secret. Generate TOKEN_ENCRYPTION_KEY with `openssl rand -hex 32`. Set DEMO_MODE=false. In production APP_URL must use HTTPS and Inngest signing/event keys are required.

Install on selected repositories, sign in with GitHub, and open the repository page. Select required gates after initial synchronization discovers checks; saving a policy recomputes all imported PR projections and increments the visible policy version.

User access is checked with GitHub App user tokens against accessible installations and repositories on each protected request. Only users with GitHub repository administrator permission can change gates or request manual imports. Removed/suspended installations and repositories are denied. Credentials use AES-256-GCM at rest; browser sessions contain opaque random identifiers, stored hashed in PostgreSQL. OAuth state expires after ten minutes. User-token refresh is serialized per user.

The webhook verifies HMAC-SHA256 against raw bytes before parsing. Delivery identifiers are unique. Unsupported event names/actions remain stored with an explicit disposition once processing is enabled.
