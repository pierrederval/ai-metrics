# Vercel deployment

An alternative to the [Railway deployment](railway.md) that runs the same
application on serverless functions. Nothing in the architecture prevents it:
there is no custom server, no filesystem state, and every long-running job is
already an Inngest step function. This document records what the platform needs
that a single long-lived container did not.

No production Vercel deployment exists yet. What follows is the configuration
the repository now carries, not a verification record.

## What the repository provides

- [`vercel.json`](../vercel.json) runs `pnpm db:migrate && pnpm build`. Vercel
  has no pre-deploy hook, so migrations run on the build machine before the
  deployment serves traffic. A failed migration fails the build.
- [`src/db/connection.ts`](../src/db/connection.ts) sizes each pool per purpose
  and disables prepared statements behind a transaction pooler.
- [`src/lib/env.ts`](../src/lib/env.ts) derives `APP_URL` from the deployment's
  own hostname when the variable is unset.
- [`/api/inngest`](../src/app/api/inngest/route.ts) declares `maxDuration = 300`.

## PostgreSQL

Vercel functions scale horizontally, so the database has to sit behind a
transaction pooler (Neon, Supabase, or any pgbouncer). Two consequences:

1. **Prepared statements must be off.** Transaction pooling gives each
   transaction a different server connection, so postgres-js's default named
   prepared statements are never found again. `DATABASE_POOLED=true` — or a
   `pgbouncer=true` parameter in `DATABASE_URL`, which providers add themselves —
   sets `prepare: false`.
2. **Pools shrink.** Each instance opens its own pool, so the per-instance
   ceilings drop from 10 data and 3 coordination connections to 3 and 1 when
   `VERCEL=1`.

Set `DIRECT_DATABASE_URL` to the unpooled endpoint. Migrations and `drizzle-kit`
use it in preference to `DATABASE_URL`, keeping DDL off the pooler.

The advisory locks in `withPullRequestLock` and `processHistorySlice` are
transaction-scoped (`pg_try_advisory_xact_lock`), which is exactly what survives
transaction pooling, and they release when the connection closes if a function is
killed mid-step. They need no change.

## Inngest

Install the [Vercel integration](https://www.inngest.com/docs/deploy/vercel). It
syncs the app at `/api/inngest` on every deploy and sets `INNGEST_EVENT_KEY` and
`INNGEST_SIGNING_KEY`, including per-branch keys for preview deployments. Set
`INNGEST_DEV=0`.

Every cron in `src/inngest/functions/` fires from Inngest Cloud, not Vercel Cron,
so the platform's cron limits do not apply. They do arrive as function
invocations: the five `* * * * *` reconcilers alone are roughly 7,000 invocations
a day, which is metered on Vercel and was free CPU time on a container.

Inngest invokes one HTTP request per step, so `maxDuration` bounds a single step
rather than a whole run. The longest step hydrates one pull request. On a plan
that does not allow 300 seconds, lower the value in the route.

## Environment and URLs

Vercel does not interpolate environment variables, so a preview deployment cannot
be given its own `APP_URL` by hand. Left unset, the application derives it:
`VERCEL_PROJECT_PRODUCTION_URL` in production, `VERCEL_BRANCH_URL` — stable per
branch, unlike the per-deployment `VERCEL_URL` — in previews. Setting `APP_URL`
explicitly always wins, and a custom production domain should set it.

Preview deployments carry the same two integration caveats as Railway PR
environments, for the same reasons:

1. The exact preview callback URL must be registered on the GitHub App. Using
   the branch hostname keeps that registration stable across pushes. Do not add a
   wildcard for `*.vercel.app`; it is shared with other Vercel customers.
2. Preview jobs must use Inngest branch-environment keys, which the Vercel
   integration provisions. Production keys must not be reused.

The webhook at `/api/github/webhook` receives the raw delivery body. Vercel caps
a function request body at 4.5 MB; GitHub `check_suite` and `workflow_run`
payloads sit well below that, but a delivery above the cap would be rejected
before the signature check runs.

## Migrations on previews

The build command migrates whatever `DATABASE_URL` the deployment's environment
resolves to. Give preview deployments their own database — a Neon branch, or a
separate Supabase project — or override the build command per environment so a
preview build never migrates the production database.

## References

- [Vercel functions: duration and limits](https://vercel.com/docs/functions/limitations)
- [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
- [Inngest on Vercel](https://www.inngest.com/docs/deploy/vercel)
- [Neon connection pooling](https://neon.tech/docs/connect/connection-pooling)
