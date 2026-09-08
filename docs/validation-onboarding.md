# Repository onboarding validation

Validation date: 2026-09-08. Feature code baseline: `aef9435`. This records local evidence and remaining release checks; it does not assert production health.

## Automated checks

| Check | Observed result |
| --- | --- |
| `pnpm test` | Passed: 24 files, 121 tests. |
| `pnpm test:integration` | Passed: 6 files, 17 tests, using the dedicated local `_test` PostgreSQL database. Initial sandbox connection failed with `EPERM`; rerun with local database access passed. |
| `pnpm typecheck` | Passed. |
| `pnpm lint` | Passed after removal of temporary QA output (the initial run included generated files). |
| `pnpm build` | Passed after fixture removal and cleanup of stale generated QA route types. |

The production build used dummy integration values with `DEMO_MODE=false`, an HTTPS placeholder app URL, and placeholder signed-Inngest keys; it validates compilation and prerendering, not external service connectivity. The first post-cleanup build compiled but failed typechecking because the existing dev output still referenced the removed fixture; cleaning those generated entries resolved it. The final route table contains no QA route. User README and generated-import preferences were preserved.

The PostgreSQL suite applies the real migration `0001_high_hellcat.sql` in an isolated schema over the original schema and verifies that existing real PR evidence becomes tracked while empty installed repositories and demo repositories do not. Other integration tests verify concurrent starts, fixed batches, exact idempotent counters, empty completion, retry lineage and preservation of success, dispatch recovery and fairness, installation reconciliation without auto-import, and existing persistence/hydration behavior. GitHub hydration and event sending in these tests use controlled responses, not live GitHub or Inngest.

Unit tests cover authorization boundaries and run ownership, admin-only mutations, dashboard/onboarding routing, current grant refresh, latest-100 request parameters, worker retry behavior, safe status messages, unknown metrics, and injected-timer polling lifecycle behavior. Polling tests include hiding/aborting, immediate resume, no overlapping requests, late-response disposal, reconnect backoff, and stopping on terminal/401/404 responses.

## Browser checks and limitations

Browser inspection uses a temporary development-only `/qa-onboarding` route on `127.0.0.1:3107`, with the real `RepositoryPicker` and `ImportProgress` components and the existing Fieldnote shell. The page explicitly labels static fixture data and supplies initial selection, queued, discovering, importing, complete, empty, partial, and failed states. Progress uses `canAdmin=false`. No start, refresh, or retry mutations are submitted. The fixture and its separate Next output directory are removed before the production build and commit.

`DEMO_MODE=false` is used with placeholder environment values solely to satisfy startup validation. No live GitHub credentials are available; no OAuth, installation, authenticated import, hosted Inngest, or production smoke test was performed. Active fixture snapshots poll the real protected endpoint with no session. Terminal fixture snapshots can be inspected without polling. The controller inspected the browser through CUA at 1440×1000 and 390×844. At the mobile width, document client width and scroll width both measured 375px (the remaining viewport width was the scrollbar), with no horizontal overflow. Screenshots retained the original shell, sidebar, serif type, and green progress treatment.

Observed interactions and states:

- Start was disabled initially, enabled after selecting a radio, and disabled again when searching cleared selection. A search for `public` filtered the list; an unmatched search showed explicit empty-search copy. The non-admin row was disabled. Keyboard Tab from search followed by Space selected a repository and enabled Start.
- Queued and discovering displayed stage copy without a progress bar. Importing showed 36/100; after the real status endpoint returned HTTP 401, it retained that snapshot and showed the session-ended sign-in message. No new requests are scheduled after 401 by the polling implementation/tests.
- Partial showed 97/100 and three failures with 97% progress. Empty completion showed no progress bar. Complete showed 100%, the completion mark, batch coverage, and a record link. Failed showed safe public error text. Read-only progress exposed no retry mutation.
- Fixture `focusOnMount` moved focus to the heading. Normal-motion styling used the 0.25-second progress-width transition. OS reduced-motion mode was not enabled during browser inspection; the scoped CSS override was reviewed separately. No blocking visual defects were found.

The successful submit/retry path, its pending state and revalidation, authenticated reload, actual hidden-tab browser lifecycle, and OS reduced-motion behavior were not exercised in the browser. Fixture focus is evidence for the component behavior, not proof of focus following a successful server action. The QA tab was closed, the viewport reset, and the temporary server stopped after inspection.

| Requested scenario | Evidence and remaining live check |
| --- | --- |
| New account with no tracked repositories | Server routing unit test and picker fixture; real sign-in remains untested. |
| Grant access, refresh list, no import until Start | Reconciliation integration and action tests; actual installation/organization approval remains untested. |
| Administrator selection, double-submit, one fixed batch | Real picker selection inspection plus database concurrency tests; no real browser submit. |
| Reload during import and hide/show tab | Resume authorization unit tests and injected polling lifecycle tests; authenticated browser reload and visibility lifecycle remain untested. |
| Immediate dispatch interrupted, cron recovery | Database dispatch tests and mocked cron handler tests; no hosted scheduler outage exercise. |
| Hydration failure, partial counts, same-batch retry | Worker unit tests and database retry tests; terminal partial fixture; no live GitHub retry exhaustion. |
| Repository with zero PRs | Database empty completion and static browser state; no live empty repository import. |
| Access revoked during polling | Authorization and polling tests plus real unauthenticated fixture response; no live access-revocation exercise. |
| Migrated evidence and explicit demo | Migration integration and existing domain/access checks; authenticated migrated and demo browser journeys remain untested. |
| Desktop/390px keyboard, focus, motion, safe errors | Desktop/390px static states, keyboard selection, fixture heading focus, normal motion and safe error text observed as above. OS reduced-motion and actual post-submit focus remain untested. |
| Non-admin reads, cannot mutate | Authorization tests and read-only picker/progress fixtures; no live non-admin account. |
| No gate policy | Existing analyzer tests retain unknown gate-dependent metrics and imported facts; no live newly imported repository inspected. |

Before release, complete the remaining authenticated scenarios with a dedicated GitHub test installation and registered Inngest workers. Record the actual run IDs and observed results, including access revocation and reload recovery. Follow the migration and drain order in [GitHub App operations](github-app.md#import-operations-and-release-order).
