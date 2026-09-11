# Execution prompt — repository page architecture

Hand this to a fresh session. The plan is approved; this prompt only says where to stand
and what not to re-litigate.

---

Implement the repository page architecture redesign.

## The workspace already exists — do not rebuild it

A git worktree is set up at `/tmp/repo-redesign` on branch `repo-redesign/implementation`.
Work there. **Do not switch branches in `/Users/pid/Documents/ChatGPT/agent-analytics`** —
another session works in that checkout.

The base was resolved before planning and is not an open question:

- The branch is cut from `ai-involvement/executed-detection` (PR #16, still **open**), which is
  the only branch carrying `pull_requests.agent_markers` and `head_ref` — added by
  `drizzle/0008_orange_typhoid_mary.sql`, declared at `src/db/schema.ts:77,83`.
- The two docs-only commits from `design/repository-page-architecture` are merged in, so the
  spec and preview are present.
- **`main` has neither.** Do not rebase onto `main`, do not branch from it, and do not merge
  PR #16 to simplify the base. The stacked-PR shape is deliberate.

`pnpm install` has run and `.env` is copied in (gitignored there). Baseline before any change:
**381 unit tests and 123 integration tests passing.** Re-run both before your first commit; if
that baseline is not green, stop and report rather than working on top of it.

**Do not name any branch with a `codex/` prefix.** This product reads branch prefixes as agent
evidence, so a `codex/` branch makes its own detector report a false positive on itself.

## Read first

1. `docs/superpowers/plans/2026-09-10-repository-page-architecture.md` — the approved plan
2. `docs/superpowers/specs/2026-09-10-repository-page-architecture-design.md` — the approved spec
3. `docs/superpowers/previews/2026-09-10-repository-page-architecture.html` — illustrative only;
   its figures are seeded or invented
4. `AGENTS.md`, then the installed guides in `node_modules/next/dist/docs/` — **this is Next.js
   16.3.4 and it is not the Next.js in your training data.** At minimum read
   `01-app/03-api-reference/03-file-conventions/layout.md` and
   `01-app/03-api-reference/04-functions/use-selected-layout-segment.md` before writing app code.

**The plan and spec are approved. Do not re-plan and do not restart brainstorming.**

## How to execute

Use `superpowers:subagent-driven-development`: a fresh subagent per task, with **spec-compliance
and code-quality review between tasks**. Tasks run in the plan's numbered order — that order is
the spec's delivery order, and task 1 exists because the cohort table the Agents view is balanced
around cannot be built without it.

## Decisions already taken — apply them, do not reopen them

1. **`Level 1 · Foundations` comes off the grade card.** The spec left this open and required it
   be decided before implementation; it is decided. Remove the line and its CSS rule. The
   preview still shows it — that divergence is intended. Leave the unrelated
   `Foundations / Evidence` eyebrow at `src/components/grading/report.tsx:137` alone.
2. **`agent_provider` holds one cohort per pull request, not a set**, resolved by a deterministic
   rule. A cohort table must partition the pull requests or its counts stop reconciling with the
   total. Full evidence stays in `repo_ai_detections`.
3. **No migration.** Rows already default to `'unknown'`; that is the unattributed cohort, and the
   read layer labels it `Unattributed` — never `Human`.
4. **The next-tier block names the next _reachable_ score, not the next threshold.** With five
   20-point checks a repository at 80 cannot reach 90, so it reads `Prismatic at 100`, matching
   the preview at line 785.
5. **Tabs are `next/link` anchors carrying `role="tab"`**, not buttons. Selection is expressed by
   route. The preview's buttons are a static-mock artifact.
6. **Flavour-line copy comes from the spec's table verbatim**, not from the preview.

## Constraints

- **Do not change the rubric, its checks, or its point granularity.** Bronze and Gold are
  unreachable today and explicitly parked by decision. Cover all six finishes in fixtures anyway
  — an unreachable finish becomes reachable the moment a rule is added.
- **Do not change any metric definition.** Metrics get sliced by cohort, not redefined. Reuse
  `aggregate()` per cohort; write no new metric maths.
- **Do not change detection itself.** Task 1 extracts an existing traversal without altering its
  rules; `detect-executed.test.ts` passing unchanged is the proof. If that suite needs editing,
  the extraction was unfaithful — revert and redo it.
- **Nothing on the page today is deleted.** Every section has a destination. The
  `Advanced gate analysis` accordion goes because its children move, not because its content goes.
  If something turns out to have no home, stop and report it rather than dropping it.
- **Each route loads only what it renders.** `page.tsx` currently issues seven queries for one
  view. Splitting it badly is the main risk in this work, and the plan checks the split three
  times — run those checks, don't skip them.
- The layout **cannot** read `searchParams` (layouts do not rerender on navigation). The date
  range belongs to Delivery and Agents, never the header.

## Finish

- `pnpm check`. Note that it ends in `pnpm build`, which needs synthetic production config rather
  than the dev `.env` — see `.github/workflows/ci.yml`. If the build fails on missing production
  config, fix the env; do not edit the build.
- Run the class audit and dead-code pass in task 10. They exist because a previous plan shipped
  a CSS class that was referenced but never defined, and dead code after a `return`.
- Inspect the real pages with `pnpm dev:demo` at desktop width **and 400px**, across all five
  routes.
- Open a PR with **base `ai-involvement/executed-detection`**, not `main`. GitHub re-targets it
  automatically once #16 merges.
- **Do not merge and do not deploy.**

## If something in the plan is wrong

Fix it and say so in the same breath. Do not silently widen scope to route around it, and do not
narrow the task to make it pass.
