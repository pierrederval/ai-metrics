# Overview and repository metrics

## Purpose and approved presentation

Replace the gate-dependent basic dashboard with useful PR, review, and CI evidence. Retain the Fieldnote shell, serif headings, paper surfaces, green, and rust accent. Overview combines connected, currently accessible repositories; Repositories becomes a separate navigation destination; selecting a repository opens the same dashboard scoped to that repository, followed by PR records.

The approved interactive design is the conversation preview `fieldnote-metrics.html`. It is illustrative, not production data or a reusable implementation. In particular, production totals must derive from chart source records rather than the preview's sample multipliers.

## Pages

Overview and repository detail share a date picker, three KPI cards, and three aligned daily charts. Presets are rolling Last 7, 30, and 90 days, default 7, with a custom range. A 30-day choice displays 30 daily positions; 90 displays 90. Sparse labels keep dates readable; hover, keyboard, and touch access reveal daily values and denominators. Narrow screens stack panels without losing dates or data. Respect reduced motion.

The repository list shows repository identity, a real GitHub link, last successful fetch, latest imported PR activity, accessible PR count, import status, and detected review/CI evidence. Distinguish no detected evidence from confirmed configuration absence. Issue collection and latest-issue metadata are deferred. Repository detail also exposes recent PRs and links to their records.

The three KPIs are PRs merged, first-pass green, and CI success. Compare against the immediately preceding equal-length period when comparable evidence exists. Count changes use percentages; rate changes use percentage points. A zero prior denominator yields no percentage comparison. Missing or materially unequal coverage suppresses misleading comparisons.

## Dates and aggregation

Use UTC calendar days initially and display the timezone. Include today, marked as incomplete. Share the selected range through URL parameters and preserve it between aggregate and repository views. Validate start/end order and constrain the selectable history to collected coverage. Daily charts retain empty days: merged count is zero only when coverage is known; missing percentage denominators produce gaps, never 0% success.

Aggregate raw numerators and denominators across accessible repositories; never average repository percentages. Deduplicate workflow identities within a repository when linked to more than one PR.

## PR metrics

Merged PRs are counted by merge timestamp within the range, regardless of review or CI eligibility.

Green requires approval when review applies and successful CI when CI applies. Review-only and CI-only PRs can qualify. Where both apply, both must pass. Neither present means not eligible, not successful. Missing or incomplete evidence is unknown and is displayed separately.

First-pass green additionally requires no Changes requested review decision before approval and no CI failures or reruns before success. Ordinary review comments do not fail first pass. Evaluate CI for the merged revision and first-pass attempt history leading to it; earlier failed revisions prevent first-pass qualification. Review approval must apply at merge, with dismissed or superseded approvals handled from available event history. Pending requested review cannot be mistaken for review absence.

Use evidence as it stood at merge. Later discoveries may correct incomplete historical records, but post-merge reviews and executions cannot change the historical outcome. When GitHub cannot supply sufficient historical evidence, record unknown rather than infer success. Preserve raw timestamps and provenance for reproducible calculations.

## CI metric and colour semantics

Count a workflow run once, across its attempts. Green means its first attempt passed. Amber means it passed after a rerun. Rust means its latest completed attempt failed. CI success is green plus amber; the card also states the share that passed after reruns. Count pending, cancelled, skipped, neutral, and unknown separately from the success-rate denominator; do not silently classify them as failures or successes.

Bucket workflow results by the latest terminal attempt completion date as of the displayed range end. A run with a later rerun can move between completion-day buckets when the range endpoint advances; this operational CI view is distinct from the frozen-at-merge PR view. Restrict to workflows linked to visible PRs. Provider checks without workflow attempt identity require an explicit supported mapping before inclusion; otherwise expose them as unsupported evidence rather than double-counting jobs and workflows.

Percentage bars always total 100% for eligible results. CI bars stack green, amber, and rust, with labels explaining all three. First-pass PR bars use green for first-pass and rust for the eligible remainder; rust there means not first-pass, not necessarily currently failed. PR-count bars retain a count scale. Legends must be local enough that these meanings cannot be confused.

## History and Free access

Free access means the latest 100 PRs per repository by creation time, with a stable ID tie-breaker. It limits how far back the user can view, not what is collected. New PRs continue arriving; older collected records remain stored. Compute the visible set before applying date filters, so filtering dates or requesting direct records cannot bypass the limit.

Import the latest 100 first, then backfill one year of PR activity in the background. Discover PRs created or updated during that year, including older PRs merged or active within it. Retain records as new activity arrives; one year is the initial backfill horizon, not an automatic deletion policy. Collect review history and CI attempts for discovered PRs where available. GitHub retention or rate limits can leave historical evidence incomplete; expose this honestly.

Enforce entitlement consistently on server-side list/detail queries, metric/chart queries, and any export route. Retaining hidden history must not expose its metrics to Free users. Existing GitHub authorization remains a prerequisite for every access, regardless of plan.

Show a coverage notice when the date range exceeds the Free window or evidence is incomplete. Expand history opens a coming-soon panel. Register interest stores an idempotent request for the signed-in user and displays success only after persistence. No payments, automatic plan activation, external notification, or email sending in this release. A future paid entitlement can unlock already-collected history immediately where backfill is complete.

## Advisory setup

Import and dashboards remain available without detected review or CI. Show an advisory with a GitHub link explaining that green metrics require evidence. Do not claim configuration absence based on a single PR or incomplete scan. Configuring review and CI inside Fieldnote is deferred.

## Architecture and delivery boundaries

Build on durable imports from onboarding PR #4. Keep initial import and background history work distinguishable, with separate progress and recoverable dispatch. Paginate and checkpoint backfill, throttle for rate limits, prioritize current activity, and resume without duplicating records or metrics. Repository access removal stops future collection and protected reads.

Separate raw GitHub evidence collection, pure metric classification, history entitlement selection, database aggregation, and shared dashboard presentation. Retain the existing advanced gate-policy analysis separately; these basic metrics must not silently reinterpret its stored projections. Add review and attempt history persistence where current facts cannot reproduce the agreed classifications.

Repository metadata should distinguish last successful synchronization from a failed recent attempt. Latest PR activity comes from imported source timestamps, not local ingestion timestamps. Expose pending, empty, partial, disconnected, and failed states without fabricated data.

Billing, issue analytics, source checkout, paid source-code analysis, and CI/review configuration are outside scope.

## Verification

Test PR review-only, CI-only, combined, neither, missing-history, dismissed-approval, changes-requested, and post-merge event cases. Test first-pass, recovered, repeated-failure, cancellation, skipped, and pending CI classifications and workflow deduplication.

Verify weighted aggregate numerators, UTC boundaries, empty denominators, incomplete comparisons, actual 7/30/90 daily positions, and repository/Overview parity. Verify direct record access and date filters cannot reveal PRs outside the latest 100 while collection retains older records.

Integration tests cover idempotent one-year backfill, older PRs updated within the year, pagination checkpoints, authorization loss, rate-limit retry, interest registration, and failure recovery. Browser checks cover navigation, presets/custom dates, chart detail access, the three colours and labels, Free coverage notices, advisory states, responsive layout, and reduced motion. Live GitHub smoke tests verify evidence availability; unavailable history must remain explicitly unknown.

## Review notes

The visual layout, rolling presets, three-colour CI presentation, advisory setup, 100-PR Free visibility, one-year background backfill, and interest CTA were approved in conversation. UTC bucketing, workflow time attribution, treatment of non-success terminal states, review-history fidelity, and persistence boundaries are concrete proposed rules for review before implementation planning.
