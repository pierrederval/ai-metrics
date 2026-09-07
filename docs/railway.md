# Railway deployment

## Production

- Railway project: [ai-metrics](https://railway.com/project/8b16f217-f9d7-4e39-98c6-71d173f539d4) in the personal **My Projects** workspace.
- Public URL: <https://ai-metrics-production.up.railway.app>.
- Source: `pierrederval/ai-metrics`, production branch `main`, with automatic deploys.
- PostgreSQL is a separate Railway service. `DATABASE_URL` uses `${{Postgres.DATABASE_URL}}` so cloned environments resolve their own database service.
- `APP_URL` uses `https://${{RAILWAY_PUBLIC_DOMAIN}}`.
- `pnpm db:migrate` is the pre-deploy command. A failed migration stops the release before it serves traffic.
- The GitHub App credentials, webhook secret, token-encryption key, and Inngest production keys are stored as sealed Railway variables.
- The Inngest app `engineering-reliability` is synced at `/api/inngest` in Inngest Cloud Production.

The production verification performed on 2026-09-07 covered a successful Railway deployment and migration, a signed GitHub webhook response with HTTP 200, and a completed `github/webhook.received` Inngest function run. An unsigned request to the webhook returns HTTP 401 as expected.

## GitHub integration

The installed personal GitHub App is `ai-metrics-pierrederval`, restricted to `pierrederval/ai-metrics`. It has read-only Actions, Checks, Contents, Metadata, and Pull requests permissions.

GitHub did not retain an App-level webhook for Apps created through this account's settings UI, and the App webhook configuration API returned 404 because no hook object existed. A signed repository webhook therefore delivers `check_run`, `check_suite`, `pull_request`, and `workflow_run` events to `/api/github/webhook`.

Repository webhook payloads omit the GitHub App installation ID. The application resolves that ID from the payload's repository before reconciling the installation. This keeps API access scoped to the installed GitHub App while accepting the repository webhook payload shape.

## Pull-request previews

Railway PR Environments are enabled. Opening a PR against `main` creates a full isolated copy of the production environment, including a fresh PostgreSQL service and a Railway domain. Railway removes that environment after the PR closes or merges.

Two integration details need explicit handling for a fully interactive preview:

1. GitHub OAuth requires the exact generated preview callback URL to be added to the GitHub App. Do not enable a wildcard for `*.up.railway.app`, because that domain is shared with other Railway customers.
2. Inngest preview jobs should use Inngest Branch Environment keys and set `INNGEST_ENV` to Railway's `RAILWAY_GIT_BRANCH`. Production keys must not be reused for preview jobs.

Without those per-preview settings, Railway still produces a useful build and HTTP deployment check, but GitHub sign-in and background imports belong to the production integration.

## References

- [Railway PR environments](https://docs.railway.com/guides/preview-deployments-with-pr-environments)
- [Railway pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command)
- [Inngest branch environments](https://www.inngest.com/docs/platform/environments)
- [GitHub repository webhooks](https://docs.github.com/en/rest/repos/webhooks)
