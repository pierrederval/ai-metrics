# Ubiquitous Language

The terms fieldnote's code, schema and interface are held to. Where a word
already carries a different meaning somewhere in this repository, that
collision is named rather than left for someone to discover in review.

## Authoring — the Act leg

fieldnote grades deterministically and authors with an LLM. Every table below
is a place an LLM may have written something; no table outside this group is.
That is the boundary the names exist to make visible.

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Authoring run** | One attempt to turn a repository's failing readiness checks into changes fieldnote proposes or writes. | Act run, agent run, job |
| **Plan run** | An authoring run that reads a repository and proposes remedies, writing nothing. | Plan phase, exploration |
| **Execute run** | An authoring run that writes the selected remedies, runs what it wrote, and opens a pull request. | Execute phase, apply run |
| **Remedy** | One file an authoring run proposes to write in order to make one failing readiness check pass. | Move, plan item, fix, change |
| **Note** | One entry in an authoring run's ordered record: a finding, a question, an answer, or a remark. | Message, transcript line |
| **Finding** | Something the agent observed in the repository and recorded before its sandbox was destroyed. | Observation, insight |
| **Remark** | A note that is neither a question nor an answer — most often the record of why a plan fell back to its deterministic floor. | Comment, log |
| **Speaker** | Who wrote a note: the agent or the human. | Role, author |
| **Author version** | The agent configuration and prompt version that produced an authoring run. Provenance, recorded because an LLM in the path means replay cannot be promised. | Prompt version, agent version |
| **Authored pull request** | The pull request an execute run opened, linked back to the run that opened it. | Act PR |
| **Sandbox** | The ephemeral, per-run box an authoring run's agent works inside, destroyed when the run ends. | Box, container, VM |
| **Deterministic floor** | The plan derived from the grade alone, with no agent: one remedy per failing readiness check, its rationale the check's own explanation. | Fallback, stub |

## Grading — the boundary authoring must not cross

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Grade run** | One deterministic evaluation of a repository against a rubric at a pinned commit. | Scoring run |
| **Readiness check** | One of the rubric's five criteria, identified by a check id such as `root-agent-instructions`. | Check (bare), grading check |
| **CI check** | A check run reported by GitHub for a pull request, produced by some GitHub App. | Check (bare) |
| **Rubric** | An immutable, versioned definition of the readiness checks and their points. | Ruleset, criteria |

## Relationships

- A **repository** has many **grade runs** and many **authoring runs**.
- An **authoring run** is either a **plan run** or an **execute run**; at most one authoring run per repository is queued or running at a time.
- An **execute run** fulfils exactly one **plan run**.
- A **plan run** produces one or more **remedies** and zero or more **notes**.
- A **remedy** addresses exactly one **readiness check** and names exactly one path; a run never names the same path twice.
- An **execute run** opens at most one **authored pull request**.
- A **grade run** is the only source of a remedy's rationale until an agent supplies a better one.

## Example dialogue

> **Dev:** "When a **plan run** finishes, has fieldnote decided anything?"

> **Domain expert:** "No. It has proposed **remedies** — one file each, each tied to a failing **readiness check**. Nobody has ticked anything, so nothing is selected and no **execute run** exists yet."

> **Dev:** "And if the **sandbox** never boots?"

> **Domain expert:** "The run still completes, on the **deterministic floor** — one remedy per failing check, rationale taken from the check's own explanation. It writes a **remark** saying why, and leaves `model` null."

> **Dev:** "So a null `model` means the agent didn't write this plan."

> **Domain expert:** "Exactly. That's the honest signal. An **author version** is always recorded, because something produced the plan; a `model` is recorded only when an LLM did."

## Flagged ambiguities

- **"check" already means two things.** A **readiness check** is a rubric criterion (`GradeResult.checks[].id`); a **CI check** is a GitHub check run (`ci_checks`, "Failed Check Count"). `authoring_remedies.check_id` means the first. Never write bare "check" in new code or prose.
- **"plan" will mean two things in this project.** A **plan run** is an authoring run; a *plan* in `docs/superpowers/plans/` is an implementation plan for a human or an agent to execute. Survivable because one is schema and one is documentation, but say which one aloud.
- **"role" was proposed for a note's speaker and is rejected.** `workspace_memberships.role` already means `owner | member`. A note has a **speaker**.
- **"repair" is taken.** The pull-request analyzer already uses "repair commit" for a commit that follows failed CI. A remedy is not a repair.
- **"act_*" as a table prefix is rejected.** No other table in this schema is named for a leg of the product — Monitor's tables are `pull_requests` and `ci_runs`, not `monitor_*`. Tables are named for what they hold.
