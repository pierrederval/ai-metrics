# Repository AI involvement

## Purpose and approved presentation

Report which AI coding agents are involved in a repository, and on what evidence. The question is
what is being used, not what could be used, so every claim carries the observation that supports it
and the reader can disagree with it. This is repository-level reporting. Per-pull-request
attribution stays out of scope; `pull_requests.agent_provider` remains unwritten and unread until a
later release claims it.

The approved presentation is the conversation preview `2026-09-10-repository-ai-involvement.html`.
It is illustrative. Its `example-org` figures are invented; its `pierrederval/agent-analytics`
figures are this repository's real history and stand as the worked example.

Detection makes no quality judgment and produces no confidence score. A number such as "82% likely
Cursor" is an inference presented as a measurement, which the product does not do. State is binary,
evidence is shown, and the reader decides what it is worth.

## Evidence classes

Three classes, labelled separately and never merged.

Executed evidence proves an agent ran against this repository. It derives entirely from rows already
persisted, requires no GitHub call, and carries an occurrence count and a last-seen date.

Configured evidence proves an agent is set up here. It derives from repository files at a pinned
commit, requires GitHub calls, and carries no activity count.

Declared evidence is a person's assertion, recorded with who made it and when. It exists because
detection cannot reach an agent that runs in an editor and leaves no commit trailer, no bot author,
no branch prefix and no committed configuration.

The disagreements between classes are the most useful output. Configured without executed means the
setup may be stale or the agent runs only locally. Executed without configured means an agent is
running that the repository does not describe. Declared without either means someone believes a tool
is in use that leaves no trace at all.

## Refresh cadence

Executed detection is a single aggregate over the repository's stored rows. It recomputes on
completion of a repository import, and on each webhook-driven pull-request sync. It must not
recompute per item during an import: an import walks a hundred pull requests, and recomputing the
whole repository on each would repeat the same aggregate a hundred times to reach the answer the
final pass gives anyway. Import items therefore mark the repository as due, and the import's
completion step performs one recompute. A detector version change marks every tracked repository
due.

Configured detection runs against a pinned commit on import completion, on push to the default
branch, and on demand. Any user who can view the repository may request a re-scan; a ten-minute
cooldown on `refreshed_at` rate-limits it. A re-scan is refused while an import is still running,
because scanning files before the pull-request history is known produces a panel that changes twice
within minutes.

Detection never rides the grade run. Executed evidence would freeze at grade time, and each new
agent added to the catalogue would bump `rubricVersion` and invalidate the comparability of every
previous score.

## Storage

`repo_ai_detections` holds one row per repository, agent and signal, where signal is `executed`,
`configured` or `declared`. Each row carries `kind` (`coding-agent` or `llm-in-ci`), `first_seen_at`,
`last_seen_at`, `occurrences` (distinct pull requests carrying the evidence; null except for executed rows), an
`evidence` jsonb array,
`detector_version` and `refreshed_at`. Declared rows additionally carry the declaring user and the
declaration timestamp. Re-running a detector updates rows in place; it does not accumulate history.

`evidence` is an array because one row commonly rests on several observations: an executed row may
cite both a check-run application identity and bot-authored commits, and a configured row may cite
both `CLAUDE.md` and several files under `.claude/`. Each entry carries a path or a source
identifier and, for file evidence, a blob SHA and line range, in the shape `EvidenceLineRange`
already uses.

`repo_detection_state` holds one row per repository: the scanned commit, the detector version, the
last refresh, and an incomplete reason where collection was truncated or GitHub was unavailable. It
exists so that no detections found is distinguishable from never looked, the same distinction
`evidenceStatus` already draws between `unconfigured` and `complete`.

The two detectors are separate modules with separate rule sets and separate evidence shapes. They
write to one table so that everything AI involved in a repository is a single indexed query rather
than a union.

Detections are computed over every pull request stored for the repository, not only the hundred
visible under Free access. Involvement is a property of the repository rather than of a pull-request
listing, and the count would otherwise silently understate what the repository does.

## Executed detection

A pure function over persisted rows, testable from fixtures in the manner of the domain functions
the original specification names as the most thoroughly tested code.

Check application identity matches `ci_checks.app_id` against catalogue entries. Commit authorship
matches `commits.author_login`. Pull-request authorship matches `pull_requests.author_login`. Review
authorship matches `review_events.reviewer_id`, which already stores the GitHub numeric user
identity. Branch prefix matches the head reference: this is the only signal that identifies Codex in
this repository, where thirteen of thirteen pull requests came from `codex/*` branches with no bot
author and no agent application. Branch prefix is the weakest signal in the set because a human may
name a branch anything; the panel therefore shows the pull-request count rather than asserting
confidence.

Commit message trailers and pull-request body markers are matched during collection. Agents sign
their work deliberately and machine-readably, with trailers such as `Co-Authored-By: Claude` and
body markers such as `Generated with Claude Code`. Both arrive inside responses already fetched:
`pulls.listCommits` returns `commit.message`, which is currently discarded, and `pulls.get` returns
`body`, which `prSchema` does not parse. Neither costs an additional request.

Pull-request comments are deferred. `issues.listComments` would add one paginated request per pull
request, a hundred additional requests per import, for a signal that largely duplicates what the
trailers already prove. Revisit if the free signals underperform.

Two collection changes are required. `prSchema` must parse `head.ref`, and `pull_requests` needs a
column to hold it. Commit messages and pull-request bodies must be matched in flight.

## Configured detection

A pure function over collected documents. Every rule is a path pattern and a content check, and both
must pass.

`CLAUDE.md` and files under `.claude/`, `.cursorrules` and files under `.cursor/rules/`,
`.github/copilot-instructions.md`, and files under `.gemini/` are unambiguous by path and need no
content check. Workflow files under `.github/workflows/` are examined for known agent actions, which
produce coding-agent evidence, and separately for language-model provider hosts, provider secret
names and model identifiers, which produce `llm-in-ci` evidence.

Workflow rules must match provider-specific names rather than generic ones. This repository's own
`ci.yml` contains `GITHUB_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` and an `openssl genrsa` invocation;
a rule keyed on the substring `KEY` would report all three as language-model usage. A step guarded
by `if: false` is recorded as a declined match rather than counted.

`AGENTS.md` is claimed by several tools and attributable to none. It produces a row naming an
unidentified agent, carrying the file as evidence, with a control offering the catalogue so a person
can say which tool it belongs to. Attributing it to any single vendor would make this repository the
detector's first false positive, since the file here is written by `next dev` and re-added on every
run.

A rule that matches a path and then fails its content check records the decline and its reason. The
panel shows these. Silent rejection of a file the user can see in their own repository reads as a
defect and is the fastest way to lose trust in a detector.

## Declarations

Any user who can view a repository may declare an agent, or correct an existing declaration. The
panel shows who declared it and when, so a wrong assertion is traceable and anyone can fix it. A
declaration may exist with no supporting signal, which is the case it exists to serve.

Detection never overwrites a declaration. Where detection later finds evidence for a declared agent,
it attaches that evidence to the row; the declaration and its author remain.

## Presentation

The repository page keeps a full-width header. Below it, a content column carries the existing
sections and a rail beside them carries the summary. The rail lists at most four agents, sorted
executed before configured and then by last seen, and collapses the remainder into a count. The cap
reflects that the rail is a summary, not the record. Below 760 pixels the layout becomes one column
and the rail precedes the sections.

The rail links to `/repos/[repoId]/ai-involvement`, which holds the full table, the evidence, the
declined signals and the scan stamp. This mirrors the existing `Agent readiness` link, which already
routes to `/repos/[repoId]/grading`.

Semantic colour separates executed from configured, reusing the existing notice amber `#986817` for
configured and adding `#2f6b52` for executed. The terracotta accent keeps its current meaning and is
not spent here. Agent marks render monochrome in the ink colour: the official brand colours of
Cursor, Copilot and Anthropic are all pure black, so brand tinting produces a row of identical black
squares beside one orange one.

A repository that has never been scanned says so rather than presenting an empty table.

## Privacy and collection limits

Commit messages, pull-request bodies and any future comment text are matched during collection and
never persisted. Only the matched marker and its location are stored. This follows the rule already
stated in `collect-readiness.ts`, that callers must not serialize raw documents to clients, and the
rule on `ReadinessCollectionError`, that persisted errors retain no provider content.

Workflow evidence records secret names, never secret values. Workflow YAML references secrets by
name, so a name is all that is available and all that is stored.

The tree-walking and blob-fetching logic in `collect-readiness.ts` is generic; only its path filter
and byte limits are specific to grading. Extract the walker into a shared module parameterized by
filter and limits, so grading and detection each bring their own. Sharing one budget would let a
repository with many workflow files starve the grader.

## Versioning and catalogue verification

The catalogue is a versioned data array, not code. Adding an agent is a new entry and a
`detector_version` increment.

The catalogue's application identities, bot logins and reviewer identities must be verified against
real collected data before the rules ship. Query the distinct `app_id` and `name` pairs in
`ci_checks`, the distinct `author_login` values in `commits`, and the distinct `reviewer_id` values
in `review_events` across tracked repositories, and populate the catalogue from what is observed.
Values recalled rather than observed are not acceptable in a detector whose entire value is that its
claims are checkable.

`AgentProvider` gains `copilot` and `devin`. The enum currently omits Copilot, which is the agent
most likely to appear in an enterprise repository.

## Delivery order

The work divides into three slices, each independently useful and each shippable without the next.

The first slice is executed detection and the rail. It needs the two tables, the executed detector,
`head.ref` collection, the in-flight trailer and body matching, and both presentation surfaces. It
touches no file collection at all and answers the question that prompted this work: which agent is
actually being used. On this repository it would report Codex on branch evidence and nothing else.

The second slice is configured detection. It needs the collector refactor, the configured detector,
the workflow rules, the declined-signal record, and the re-scan control with its cooldown. It adds
the configured-without-executed gap, which is where the advice value sits.

The third slice is declarations. It needs the declared signal, the catalogue picker, the author
record, and the rule that detection never overwrites a declaration. It is last because it is most
useful once people can already see what detection missed.

Catalogue verification against real collected data precedes the first slice, since the executed
rules are built from its values.

## Out of scope

Per-pull-request attribution, and any write to `pull_requests.agent_provider`. Pull-request comment
collection. Confidence scoring. Cross-repository or organisation-level rollups. Any use of a
language model in the detection path.
