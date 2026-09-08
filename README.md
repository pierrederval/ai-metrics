# AI Engineering Reliability

An evidence-first MVP for reconstructing pull-request and CI history from GitHub. It stores raw webhook deliveries, normalizes GitHub facts, and recomputes deterministic reliability metrics. V1 makes no LLM-based quality judgments.

## Prerequisites

- Node.js 24+
- pnpm 10.27+
- Docker with Compose, or PostgreSQL 17+
- A GitHub App for live integration; the seeded demo does not need one

## Run the seeded demo

```bash
pnpm install
cp .env.example .env
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard). The seed is repeatable and contains 21 PRs. PR `demo-pr-4` demonstrates failed CI, a test-file change, successful CI, and `Clean Green = No`.

The checked-in `.env.example` enables explicit development-only demo mode. The application rejects demo mode when `NODE_ENV=production`.

## Run tests and checks

Create the dedicated integration database once:

```bash
docker compose exec postgres createdb -U reliability reliability_test
```

Then run:

```bash
pnpm test
pnpm test:integration
pnpm lint
pnpm typecheck
pnpm build
```

`pnpm test` has no database dependency. `pnpm test:integration` refuses any database whose name does not end in `_test`. `pnpm check` runs the complete suite and production build.

## Enable GitHub integration

Follow [docs/github-app.md](docs/github-app.md), set `DEMO_MODE=false`, and fill every GitHub and encryption variable in `.env`. Apply migrations, start the application, then start the durable worker UI:

```bash
pnpm db:migrate
pnpm dev
pnpm inngest:dev
```

Configure the GitHub App webhook as `APP_URL/api/github/webhook`, install the app, and sign in through `/api/auth/login`. Installation grants repository availability. In onboarding, a repository administrator chooses a repository and starts its latest-100-PR analysis. Administrators can retry partial imports, request a fresh batch, and select required gates from the repository page. Set `GITHUB_APP_SLUG` for the access-management link.

Operators can also request a fresh import for an already tracked repository by internal repository ID:

```bash
pnpm github:sync repository:123456789
```

## Key commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the Next.js application |
| `pnpm inngest:dev` | Run Inngest locally against `/api/inngest` |
| `pnpm db:migrate` | Apply checked-in Drizzle migrations |
| `pnpm db:seed` | Repeatably create the 21-PR demo dataset |
| `pnpm github:sync <id>` | Queue a historical repository import |
| `pnpm test` | Run deterministic unit/domain tests |
| `pnpm test:integration` | Run PostgreSQL and hydration tests |
| `pnpm check` | Run lint, types, all tests, and production build |

## Documentation

- [Architecture](docs/architecture.md)
- [Domain model](docs/domain-model.md)
- [GitHub App setup](docs/github-app.md)
- [Validation and limitations](docs/validation.md)
- [Deferred work](docs/future.md)
- [Execution plan](docs/superpowers/plans/2026-09-07-ai-engineering-reliability-mvp.md)
