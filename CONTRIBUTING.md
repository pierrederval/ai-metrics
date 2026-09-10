# Contributing to fieldnote

Thanks for considering a contribution. This document covers setup, the checks
your pull request must pass, and what a good change looks like in this
codebase.

## Setup

Requires Node.js 24+, pnpm 10.27+, and Docker with Compose (or PostgreSQL 17+).

```bash
pnpm install
cp .env.example .env
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Create the dedicated integration database once:

```bash
docker compose exec postgres createdb -U reliability reliability_test
```

## Checks

Every pull request into `main` runs five separate checks, each as its own
GitHub check run: `lint`, `typecheck`, `unit`, `integration`, and `build`.

Run them all locally before pushing:

```bash
pnpm check
```

Or individually:

```bash
pnpm lint
pnpm typecheck
pnpm test              # no database required
pnpm test:integration  # refuses any database not ending in _test
pnpm build
```

## What a good change looks like here

**Facts and metrics stay separate.** Raw GitHub deliveries establish
provenance, normalized rows make data queryable, and the pure analyzer projects
facts into metrics. Do not compute a metric during ingestion, and do not reach
for the network or a database inside the analyzer.

**Replay must be deterministic.** The same facts and the same gate policy must
produce the same metric values, every time. `computed_at` is added only when a
projection is stored. If a change makes output depend on wall-clock time,
ordering, or a live API, it needs a different design.

**No LLM judgments in the pipeline.** fieldnote's claim is that its numbers are
recomputable and defensible. A model in the metric path forfeits that, and it
is the reason to use this over a prompt.

**Unknown is a real value.** When evidence cannot support a claim, the outcome
is `null` — not `false`. Aggregate rates exclude unknowns and show their
denominators. Silently coercing missing evidence into failure or success is the
bug this codebase most wants to avoid.

**Tests before implementation.** New behaviour arrives with a failing test
first. Domain and metric logic belongs in `pnpm test` with no database;
persistence and hydration belong in `pnpm test:integration`.

**Follow the existing shape.** Domain logic in `src/domain/`, metric projection
in `src/metrics/`, queries in `src/db/queries/`, durable work in
`src/inngest/`. New database structure arrives as a checked-in Drizzle
migration.

## Larger changes

Features here are designed before they are built — see
[`docs/superpowers/specs/`](docs/superpowers/specs/) for the format. If you are
proposing something substantial, open an issue describing the design before
writing the implementation, so the discussion happens while it is still cheap.

## Documentation

If a change alters what the numbers mean, update
[`docs/domain-model.md`](docs/domain-model.md). If it alters what fieldnote does
not claim, update [`docs/validation.md`](docs/validation.md).

## License

By contributing, you agree that your contributions are licensed under
[AGPL-3.0](LICENSE).
