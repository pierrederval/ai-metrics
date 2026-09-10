# Repository page architecture

## Purpose and approved presentation

The repository page carries seven concerns in one column and hides half of them behind an accordion
that mixes configuration with analysis. It also leads with generic delivery metrics, as though the
product were a DORA dashboard. It is not: it exists to improve AI coding agents. The first thing a
reader sees must be how the agents are doing, and the delivery numbers must be attributable to the
agent that produced them.

This replaces one page with a persistent header and five tab routes. The approved presentation is
the conversation preview `2026-09-10-repository-page-architecture.html`. It is illustrative; its
`demo/checkout-service` figures are seeded demo data and its cohort figures are invented, because
the data that would produce them does not exist yet.

Nothing on the page today is deleted. Every section has a destination.

## Information architecture

Five views, each a real route beneath a shared layout, so every one is linkable, bookmarkable and
individually loadable.

`Agents` is the landing view at `/repos/[repoId]`. It answers whether the repository is a place
agents can work, which agents actually work there, and how well each performs.

`Readiness` at `/repos/[repoId]/grading` and `Involvement` at `/repos/[repoId]/ai-involvement`
already exist and move unchanged. Today they are reached by two small links inside a sentence of
body copy. The tab bar does not invent them; it stops hiding them.

`Delivery` at `/repos/[repoId]/delivery` holds the KPI cards, the daily charts, the date range, the
pull-request table, the failure breakdown and the gate-policy projection.

`Settings` at `/repos/[repoId]/settings` holds the required-gates form, the policy version, the
import control and the collection detail.

The `Advanced gate analysis` accordion is removed rather than renamed. A label that has to cover a
configuration form and two analysis tables at once is covering for a missing structure, and every
one of its children now has a home.

## The persistent header

The layout owns a breadcrumb, the repository identity, a facts line, the primary actions and a
coverage strip. All five persist across tabs because they are true regardless of which view is
open.

The facts line carries visibility, default branch, accessible pull-request count and plan. The
actions are a GitHub link and Refresh data; Refresh belongs here rather than in a drawer because it
is wanted from every view.

The coverage strip is new and it is the point. This product's claim is that missing evidence stays
unknown rather than being guessed. That claim currently lives in six definition rows halfway down
the page, below the figures it qualifies. It moves above them, stating in one line whether review
and CI evidence were both detected, when collection last succeeded, and whether background history
is current. An import in flight renders here, because an import in flight is precisely the "do not
trust these numbers yet" condition the strip exists to report. The six underlying timestamps move
to Settings, for the case where someone is debugging collection rather than reading a metric.

## The Agents view

A two-column layout: the readiness card at a fixed 330 pixels on the left, and a column beside it
carrying agents involved, agent share of work, and the cohort comparison.

The readiness card is the hero. It is the best-designed object in the product and it currently
sits one click down a buried link. At full size the tier reads instantly, and the next-tier block
turns a score into a next action.

Agent share of work states how many pull requests carry agent evidence against the total. Pull
requests with no evidence are reported as their own figure and never implied to be human.

The right column stacks naturally rather than being height-matched to the card. Card height varies
with the flavour line and the number of failing checks: a perfect score has no next-tier block and
is materially shorter, a failing repository is taller. Forcing a match would reintroduce the dead
space the cohort card was moved up to fill.

## The readiness card

`GradeCard` gains two elements between the finish line and the rubric divider.

A flavour line states what the tier means, in italic serif, written from the agent's point of view
rather than the grader's. `Silver · Holographic` alone is decoration; a reader learns nothing about
their repository from it.

| Score | Finish | Flavour line |
| --- | --- | --- |
| 0–49 | Common · Flat | An agent will guess. There is no reliable way to build this, test it, or find the thing it needs to change. |
| 50–69 | Shimmer · Light holo | An agent can start, but will stop to ask questions a document should already answer. |
| 70–79 | Bronze · Holographic | Enough context to work from. Verifying the change still takes trial and error. |
| 80–89 | Silver · Holographic | Readable, testable, navigable. An agent can find its way around and verify its own work without asking a human first. |
| 90–99 | Gold · Holographic | An agent can land a change unaided. Documentation and verification both hold under pressure. |
| 100 | Prismatic · Perfect | Nothing the rubric asks for is missing. |

A next-tier block lists the failing checks as moves, each with the points it is worth, and names the
tier the next threshold reaches. It is generated, not written: the rubric already returns per-check
points and a pass or fail, so the failing checks sorted by points are the moves and the distance to
the threshold is arithmetic. At a perfect score the block is replaced by a single line, because
there is no next tier.

`GradeCard` therefore needs the check results, not only the score. Its props gain the completed
run's `CheckResult[]`; the score, repository name, commit and rubric version are unchanged. Both the
Agents view and the Readiness tab render the same component, so the card cannot drift between them.

Increase the bottom margin of `.grade-card-finish` from 10 to 15 pixels. It was adequate while the
finish line was the last thing before the divider; with italic serif directly beneath it, the two
typographic voices need separating.

`Level 1 · Foundations` is the only line on the card that carries no information. There is no Level
2 anywhere in the product. Either it is a promise about rubric families beyond Foundations, in which
case the roadmap should say so, or it comes off the card. This spec does not decide it; it must be
decided before implementation.

## Score granularity

The rubric is five binary checks worth twenty points each, so exactly six scores can occur: 0, 20,
40, 60, 80 and 100. Against the current thresholds those map to Common, Common, Common, Shimmer,
Silver and Prismatic.

**Bronze and Gold are unreachable.** Two of the six finishes are unreachable states, and the card's
scale renders bands no repository can occupy.

Do not resolve this by deleting Bronze and Gold. The six-tier ladder is what makes the card worth
looking at, and a finer-grained rubric is the natural direction for a v0.1 scoring five things.
Resolve it by growing the rubric: more checks worth fewer points each produce a distribution that
reaches every tier. Ten checks worth ten points would do it. That is a rubric change with its own
version bump and its own comparability consequences, so it is out of scope here and must not be
smuggled into this work.

Bronze and Gold are explicitly parked by decision, not overlooked. Until the rubric grows, the card
renders correctly for all six finishes and only four occur. Fixtures and visual checks must cover
all six regardless, because the unreachable ones become reachable the moment a rule is added, and a
finish first exercised on the day it appears in production is a finish nobody has looked at.

## Cohort comparison

The cohort table reports, per agent, the pull-request count, first-pass green rate, attempts to
green and clean green — the metrics the product already computes, split by who did the work. Pull
requests with no agent evidence form their own cohort, are labelled as unattributed rather than as
human, and are never folded into a total.

This is the view the product exists to produce. `docs/future.md` already called for it: compare
first-pass rate and attempts-to-green by provider while preserving an explicit unknown cohort.

It has a dependency, and the dependency is not yet built. Repository-level AI involvement detection
stores `agent_markers` and `head_ref` on every pull request, and `detectExecuted` already derives
which pull-request identifiers belong to each agent — then aggregates them away. What is missing is
the per-pull-request projection: writing that agent set back onto the pull request, which is the
`agent_provider` column that has been present and unwritten since the first migration. Once written,
the existing metric aggregation groups by it.

**Build the per-pull-request attribution before this redesign, not after.** The Agents view's
balance depends on the cohort card filling the column beside the readiness card; shipping the layout
without it reintroduces the dead space this design was revised to remove, and a second pass would
be needed to close it again.

## Delivery, Readiness, Involvement and Settings

Delivery keeps the KPI cards, the three daily charts and the date range, and gains the pull-request
table at full width with an Agent column — possible only once per-pull-request attribution exists.
The failure breakdown and the gate-policy projection join it; a second projection of one table is a
toggle on that table, not a separate list in a drawer.

The date range moves out of the page header into Delivery and Agents, the only views it applies to.
In the header it implies it filters the pull-request table and the gate policy, which it does not.

Readiness and Involvement move unchanged.

Settings holds the required-gates form and its policy version, the collection detail, and a data
section carrying the import refresh. Configuration is not analysis; this is the split the accordion
was papering over.

## Data loading

`page.tsx` today issues seven queries to render one view. Splitting the page means each route loads
only what it renders: Agents needs the latest grade run, the detections, the cohort aggregation and
the coverage facts; Delivery needs the dashboard aggregation and the pull-request records; Settings
needs the gate policy and the collection record. The layout loads the repository record and the
coverage facts once for the header.

This is the riskiest part of the work. Moving markup is mechanical; deciding which query belongs to
which route, and not leaving the layout loading data only one tab needs, is not.

## Responsive behaviour

Above 720 pixels the Agents view is two columns. Below, it collapses to one and the readiness card
precedes the column beside it.

At phone width the card at 330 pixels consumes most of the first screen. It reduces to a compact
banner carrying score, tier and symbols; the full card renders only on the Readiness tab. The tab
bar scrolls horizontally rather than wrapping, with its scrollbar hidden.

The tab bar is a `tablist` with `tab` roles, arrow-key navigation between tabs, and a visible focus
state. Selection is expressed by route, not by client state.

## Prerequisite

Per-pull-request attribution reads `pull_requests.agent_markers` and `pull_requests.head_ref`, which
are added by the repository AI involvement branch. That work is not on the default branch at the
time of writing. It must land before this work begins, or this work must branch from it; starting
from a base without those columns will fail immediately.

## Delivery order

Per-pull-request attribution first, as argued above. Then the layout and header, which is where the
tab bar and coverage strip land and where `page.tsx` becomes Agents. Then Delivery and Settings,
which are mostly moved markup retaining their existing server actions. The card changes can land at
any point after the layout, since both surfaces render the same component.

## Out of scope

Changing the rubric or its point granularity. Changing any metric definition. Cross-repository or
organisation-level views. Any change to detection itself. The `Level 1 · Foundations` question,
which must be answered before implementation but is not answered here.
