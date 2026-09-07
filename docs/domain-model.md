# Domain model

GitHub facts and metric projections are intentionally separate. Raw deliveries establish provenance, normalized rows make data queryable, and the JSON `PullRequestFacts` aggregate supplies the pure analyzer. Replaying the same facts and gate policy produces the same metric values; `computed_at` is added only when the projection is stored.

## Facts

- An installation owns repositories. Active flags reflect installation suspension/deletion and repository access changes.
- A pull request stores canonical metadata plus its normalized fact aggregate.
- Revisions preserve observed `previous SHA -> new SHA` edges. A revision comparison is trusted for harness mutation only when GitHub reports the previous SHA as the merge base and the file list is complete.
- CI runs identify workflow executions and `run_attempt`; a many-to-many association lets a run apply to more than one PR.
- CI checks identify the producing GitHub App and exact check name. Immutable observations preserve webhook/API evidence while the canonical row supports queries.
- Changed files record whether evidence came from the cumulative PR diff or a revision comparison. Cumulative files are never attributed to one repair commit.
- Gate policies are immutable, versioned repository configurations.

## Metrics

- A CI attempt is one evaluated PR SHA, containing all executions of configured gates on that SHA.
- First Pass Green requires every configured gate's first execution on the first evaluated SHA to succeed.
- Eventually Green is true when any SHA reaches a simultaneous complete successful state.
- Attempts to Green is the one-based SHA index of the earliest chronological green state.
- Time to Green is the interval from the first relevant execution start to that green state.
- Failed Check Count counts terminal failed required executions. Unique Failed Gate Count deduplicates by producing App and exact name.
- Harness Changed After Failure detects a test, CI, runner, quality, or package-configuration file on a later observed revision after failed CI and through the first green state.
- Clean Green is `eventuallyGreen && !harnessChangedAfterFailure`, using nullable three-valued logic.

Outcomes remain `null` when the policy is unconfigured, relevant work is pending, or historical evidence cannot support the claim. Aggregate rates exclude unknown values and show their denominators. This prevents missing evidence from being silently counted as failure or success.

## Core tables

`github_installations`, `repositories`, `pull_requests`, `commits`, `pr_revisions`, `ci_runs`, `pr_ci_runs`, `ci_checks`, `ci_observations`, `changed_files`, `github_events`, `gate_policies`, `pr_metrics`, `users`, and `sessions` are defined in `src/db/schema.ts` and created by checked-in Drizzle migrations.
