# Roadmap

fieldnote is a loop: **Monitor** what coding agents do, **Act** on what the
evidence shows, **Train** the agents on their own record.

Monitor is shipped. This document records what Act and Train are, what they
reuse, and what they still need. Neither has a design document yet — each gets
its own design and plan before it is built, the way every shipped feature here
did.

## Act — opening readiness pull requests

**What it is.** When a repository's agent-readiness grade shows failing checks,
fieldnote opens a pull request that fixes them: adding the missing `AGENTS.md`,
the missing documented setup block, the missing documented test command.

**Why this and not something more aggressive.** Repository readiness is
preventive and safe. It improves every future agent run in that repository, it
needs no pull-request history to be useful, and a wrong suggestion costs a
closed pull request rather than a broken build. Reverting an agent's harness
edit is the more dramatic version of Act and is deliberately not first.

**What it reuses.** `GradeResult.checks[]` in
[`src/domain/grading/types.ts`](../src/domain/grading/types.ts) already carries,
per failing check, the `status`, an `explanation`, the `paths` inspected, and
`lineRanges` proving the finding. Grade runs, dispatch, and recovery already
exist in [`src/db/queries/grade-runs.ts`](../src/db/queries/grade-runs.ts) and
the Inngest functions.

**What it still needs.**

- Write scope on the GitHub App, which today is read-only. This is a permission
  change every installation must accept, so it must be worth asking for.
- Authoring per failed check: turning a check identifier into file content that
  suits the repository rather than a fixed template.
- Idempotency. A repository must never receive the same readiness pull request
  twice, including after a closed-without-merge outcome.
- Explicit opt-in per repository, and a bound on how often fieldnote may open a
  pull request.

**Open question.** Whether the pull request body should carry the grade
evidence (paths and line ranges) inline, or link back to the fieldnote grading
page. Inline is self-contained; linking keeps the diff clean.

## Train — an MCP server for coding agents

**What it is.** An MCP server that serves a repository's own record back to the
coding agent working in it. Before starting a task, the agent asks what it
keeps getting wrong here, and gets an answer computed from that repository's
actual merged history.

Roughly:

```
> Before I start: what do I keep getting wrong in this repo?

  Across the last 40 pull requests:
  1. Modified test files after CI failed        7x  → not clean green
  2. Needed 3 or more SHAs to reach green      12x
  3. Failed the lint gate on first attempt      9x

  Readiness: 60/100 — setup and test commands undocumented.
```

**What it reuses.** `failureBreakdown()` in
[`src/metrics/aggregate.ts`](../src/metrics/aggregate.ts) already returns, per
gate, the check name, producing App, failure count, total, and the set of pull
requests it failed on — sorted, with denominators. `aggregate()` supplies the
rates. `latestGrade()` supplies readiness. The metrics behind the answer are
computed; what is missing is the server that speaks them.

**What it still needs.**

- A read-only MCP server and its transport.
- Authentication that scopes a caller to exactly the repositories it may read.
  This is the hard part: an MCP token is easier to leak than a session, and the
  underlying data is a team's engineering record.
- A tool surface small enough to be useful in a prompt. Three tools, not
  thirteen.
- A decision about phrasing. "Your top mistakes" is a judgment; the pipeline
  makes none anywhere else. The server should report what the evidence shows and
  let the agent draw the conclusion.

**Open question.** Whether Train reads per-agent or per-repository. Per-agent is
the stronger promise — the agent sees _its own_ record — but attribution of a
pull request to a specific agent is itself unbuilt work, designed on the
`design/repository-ai-involvement` branch and not yet merged. Per-repository
needs no attribution and is the honest first version.

## Not planned

Excluded work, and why, is recorded in [future.md](future.md).
