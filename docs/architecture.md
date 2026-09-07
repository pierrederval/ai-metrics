# Architecture

The MVP is one Next.js application backed by PostgreSQL. GitHub sends a signed delivery to `/api/github/webhook`; the route verifies the untouched body, persists the raw event under its unique delivery ID, dispatches only its internal database ID to Inngest, and returns. Inngest owns hydration, normalization, repository imports, and projection recomputation.

```text
GitHub -> signed webhook -> raw github_events row -> Inngest
                                                   |
                                                   v
GitHub REST -> normalized immutable facts -> pure PR analyzer
                                                   |
                                                   v
                                  replaceable pr_metrics projection
                                                   |
                                                   v
                         server-rendered, repository-authorized UI
```

The domain layer imports neither Octokit nor Drizzle. `analyzePullRequest(facts, gatePolicy)` groups required checks by PR SHA, reconstructs green states from execution chronology, detects harness changes over observed revision edges, and returns a complete projection. Persistence replaces that projection inside the same repository advisory lock used for fact changes and gate-policy changes.

Webhook dispatch and event processing are independently idempotent. Failed dispatch leaves a stored, undispatched row for reconciliation. Processing uses a database lease, records unsupported events, retries transient errors, and marks terminal failures. PR hydration is serialized by repository and PR number; repository imports use one durable child invocation per PR and expose progress and partial errors.

GitHub App installation tokens hydrate facts. Customer GitHub App user tokens determine visibility and administration rights. Each protected request rechecks the user's currently accessible installations and repositories. Browser sessions contain random opaque values whose hashes are stored in PostgreSQL; encrypted user tokens use AES-256-GCM.

PostgreSQL remains the source of truth. The app can be deployed as a normal Node.js Next.js service with externally managed PostgreSQL and Inngest. No Redis, queue service, microservice, or analytics database is required by the application.
