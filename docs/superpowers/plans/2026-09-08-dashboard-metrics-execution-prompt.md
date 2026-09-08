# New-chat implementation prompt

Implement GitHub issue #5 in pierrederval/ai-metrics:
https://github.com/pierrederval/ai-metrics/issues/5

Use superpowers:subagent-driven-development. I authorize bounded implementation subagents in this chat, with spec-compliance and code-quality review between tasks. Do not create separate user-owned tasks. The design is approved; proceed with implementation rather than restarting brainstorming.

Repository: /Users/pid/Documents/ChatGPT/agent-analytics
Planning branch: origin/codex/dashboard-metrics-design

First read AGENTS.md, superpowers:using-git-worktrees, and the installed Next.js guides relevant to the work. Fetch origin and create an isolated worktree on a new codex/ branch from current origin/main. Onboarding PR #4 is already merged. Bring in only the dashboard planning documents from the planning branch if main does not include them; do not replay onboarding commits. Preserve the original workspace, its .env, and its unrelated README.md/next-env.d.ts changes. Never print, commit, or copy real credentials into the issue or review output.

Read these files from the planning package:
1. docs/superpowers/specs/2026-09-08-dashboard-metrics-design.md
2. docs/superpowers/plans/2026-09-08-dashboard-metrics.md
3. docs/superpowers/previews/2026-09-08-fieldnote-metrics.html

Phase 0 is complete. Execute Phases 1–8 task by task using the plan. Keep the plan and issue checklists accurate, commit passing increments, and resolve review findings. Inspect the actual code before changing it; keep shared contracts synchronized between subagents. The preview is a visual reference with sample data, not production metric logic.

Critical requirements: Free is a server-enforced latest-100-PR visibility window per repository, not a collection cap; collect one year in the background. PR first-pass green combines review and CI where present and uses evidence as of merge. CI counts each workflow run once across attempts: green first pass, amber recovered on rerun, rust failed; explicitly exclude other/unknown outcomes. Preserve unknown historical evidence. Show all 7/30/90 daily positions, sum raw denominators across repositories, and derive cards and charts from the same records. Keep advanced gate analysis separate. No billing, issues, source checkout, or in-app review/CI configuration.

Run relevant unit/integration tests during implementation and the full validation described in Phase 8. Inspect the real UI at desktop/mobile sizes and exercise date navigation, Free access, chart details, and recovery states. Verify current GitHub endpoint capabilities against official documentation before relying on historical evidence that may not be available.

When complete, open an implementation PR referencing “Closes #5”, with screenshots, test evidence, migration/worker rollout notes, and any remaining limitations. Do not merge or deploy. If external permissions or missing live credentials block a smoke test, complete independent work and clearly report that limitation instead of fabricating success.
