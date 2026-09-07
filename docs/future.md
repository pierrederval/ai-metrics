# Deferred work

The MVP intentionally excludes: Claude Code hooks; Codex, Cursor, Gemini, model, or automatic agent attribution; JUnit and Playwright report parsing; coverage and SARIF parsing; flaky-test detection; LLM review or semantic analysis; Slack alerts and weekly email; cross-company benchmarking; DORA metrics; Jira; GitLab; Bitbucket; deployment tracking; and production-incident correlation.

Likely next experiments:

1. Compare adoption and metric trust between explicit required-gate selection and an assisted suggestion flow that still requires administrator confirmation.
2. Ask teams to review PR timelines with source-only repairs versus harness modifications, measuring whether the evidence changes review behavior without adding an automated judgment.
3. Pilot opt-in agent attribution supplied by CI metadata, then compare first-pass rate and attempts-to-green by provider while preserving an explicit unknown cohort.
