# Validation and known limitations

## Verified locally

- A fresh PostgreSQL database accepts the migration and deterministic 21-PR seed.
- Unit tests cover classifier rules, green/repair/never-green sequences, skipped and neutral conclusions, all failure conclusions, same-SHA reruns, concurrent SHA completion order, missing gates/times/history, renamed harness files, duplicate/permuted facts, aggregate denominators, token encryption, authorization, and signature verification.
- Integration tests cover concurrent PR replay, versioned gate recomputation, duplicate deliveries, dispatch recovery, processing idempotency, and repeated GitHub REST hydration into the same projection.
- The local webhook smoke test rejects an invalid signature, stores a repeated valid delivery once, and observes Inngest processing it through `/api/inngest`.
- The production build renders all application and API routes.

## Live GitHub validation

No GitHub App credentials or authorized test repository were present during implementation. The code therefore has not been exercised against a live installation. The exact manual acceptance path is:

1. Configure the App using `docs/github-app.md`, install it on a test repository, and sign in.
2. Select the repository's required gates and run the historical import.
3. Open a PR whose first CI attempt fails, push a source-only repair, and confirm eventual and Clean Green are Yes while First Pass Green is No.
4. Open another PR, fail CI, modify a classified test/config file, and pass CI. Confirm the page says “Harness modified after failed CI.” and Clean Green is No.

## Known limitations

- GitHub does not guarantee complete historical webhook, PR-head, or rerun chronology. When the API cannot reconstruct evidence, outcomes stay unknown.
- Required-gate configuration is applied as the current policy when recomputing imported history; the policy version is shown and retained, but historical branch-protection policy is not inferred.
- Check-level failures are counted; JUnit, Playwright report, coverage, SARIF, and individual-test parsing are deferred.
- Harness mutation is evidence of a classified file change, not intent or misconduct.
- GitHub.com is the only supported forge and host in V1.
- Session cleanup and encryption-key rotation need operational jobs before a production launch.
- Imports intentionally cap at the latest 100 PRs by creation time.
