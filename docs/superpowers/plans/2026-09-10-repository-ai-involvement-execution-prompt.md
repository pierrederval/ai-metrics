# New-chat implementation prompt

Implement the first slice of repository AI involvement detection in pierrederval/ai-metrics.

Use superpowers:subagent-driven-development. I authorize bounded implementation subagents in this chat, with spec-compliance and code-quality review between tasks. Do not create separate user-owned tasks. The design and plan are approved; proceed with implementation rather than restarting brainstorming.

Repository: /Users/pid/Documents/ChatGPT/agent-analytics
Planning branch: design/repository-ai-involvement

First read AGENTS.md, superpowers:using-git-worktrees, and the installed Next.js guides in `node_modules/next/dist/docs/` relevant to server components, route handlers and layouts. Fetch origin and create an isolated worktree on a new branch from current origin/main. Do NOT name the branch with a `codex/` prefix: this feature reads branch prefixes as agent evidence, and a `codex/` branch would make the detector's first run a false positive on its own implementation. Use `ai-involvement/executed-detection`. Bring in the planning documents from the planning branch if main does not include them. Preserve the original workspace, its .env, and any unrelated working-tree changes. Never print, commit, or copy real credentials into review output.

Read these files from the planning package:
1. docs/superpowers/specs/2026-09-10-repository-ai-involvement-design.md
2. docs/superpowers/plans/2026-09-10-repository-ai-involvement-executed.md
3. docs/superpowers/previews/2026-09-10-repository-ai-involvement.html

Complete the execution preparation, then execute Tasks 1 to 5 in order using the plan. Each task is red, green, commit; keep the plan checkboxes accurate and resolve review findings before moving on. Inspect the actual code before changing it. The preview is a visual reference rendered on this repository's real history; it is not production logic.

Critical requirements: this slice covers executed evidence only. Do not implement file scanning, workflow parsing, the re-scan control, declined-signal records, declarations, or the catalogue picker; those belong to slices two and three. Never persist commit messages or pull-request bodies. Match them in flight and store only which marker matched and where. Produce no confidence score. Compute detections over every stored pull request, not only the hundred visible under Free access. Recompute once at import completion and on webhook-driven pull-request sync only, never per import item. Leave `pull_requests.agent_provider` unwritten and unread.

Before writing Task 1, run the catalogue verification queries in the plan's execution preparation against a database holding real tracked repositories. Populate the catalogue's application identities, bot logins and reviewer identities only from what those queries return. Do not populate any identity from recall. If no such database is reachable, say so explicitly and ship only the entries whose signals are textual, rather than inventing values.

Run the listed unit and integration tests during implementation, then the full release verification in the plan. Inspect the real repository page at desktop width and at 400px. Confirm the header is full width, the rail sits beside the content above 760px and above it below, and no horizontal scroll appears.

When complete, open an implementation pull request describing the slice, with screenshots, test evidence, migration notes, and an explicit list of any catalogue identities that could not be verified against real data. Do not merge or deploy. If missing live credentials block the catalogue verification or a smoke test, complete every independent task and report that limitation plainly instead of fabricating success.
