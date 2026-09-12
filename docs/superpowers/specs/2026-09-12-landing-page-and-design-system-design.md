# The landing page and the shared design system

**Status:** design, approved in conversation 2026-09-12. No implementation yet.

Two things that only make sense together. fieldnote gets a public landing page
at `/`, and the visual language that page needs is extracted out of
`src/app/style.css` into `@fieldnote/design-system`, a workspace package the
product and the marketing page both consume.

The landing page is not the reason for the package. The package is the reason
the landing page can exist without forking the product's appearance — which is
how marketing sites end up showing a product that no longer looks like that.

## What this is

**The design system.** A pnpm workspace package holding the tokens, the base
element styles and nine presentational primitives. Nothing in it fetches data,
reads a session, imports from `src/`, or knows what a pull request is.

**The landing page.** A public route at `/`, replacing today's redirect to
`/dashboard`. It pitches agent readiness as something a repository earns: the
grade card is the hero, the six finishes are a ladder, and both CTAs go to
GitHub sign-in.

Neither exists today. `src/app/page.tsx` is four lines that redirect.

## The visual baseline is not up for redesign

[`docs/design/fieldnote/README.md`](../../design/fieldnote/README.md) records a
direction the user selected on 2026-09-07 and a logo approved the same day: Pine
& Mist palette, Original Ember `#BE421F`, Georgia display type, Arial interface
text, outlined Field Lines seal. Every colour and typeface in this design is
that baseline, unchanged.

What is new is structure, not appearance. Today a component that needs the
accent writes `#be421f`; after this it writes `var(--fn-color-accent)`.

Two different promises, and they must not be confused. **Colour and type are
pixel-identical** — every value is the same hex and the same face, so any visual
difference there is a migration bug. **Spacing is deliberately not**: collapsing
fourteen ad-hoc values onto an eight-step scale moves some edges by a pixel or
two, and that is the point of having a scale. Those shifts are accepted, but
they are the only ones; anything larger, or any change in layout structure, is a
bug.

## Decisions settled in conversation

| Question | Settled | Why |
| --- | --- | --- |
| Where the landing page lives | Same Next.js app, at `/` | One deploy, one token set, and "Try it now" is a same-origin link. A separate site would force the package to exist but buy nothing else. |
| What "Try it now" does | `/api/auth/login` | Both CTAs go to GitHub sign-in. No new public auth surface. The hero carries the proof instead of a demo route. |
| How the system is packaged | `packages/design-system` | A real workspace package, so "shared with the website" survives the website moving. |
| Hero card finish | Gold at 95 | Gold is the look asked for; leaving Prismatic unclaimed at the top of the ladder gives the page something to sell. |
| Headline | "Get your ultimate harness." | Uses *harness* in the sense the codebase already does — the test, CI, runner, quality and package-configuration files. |
| Dark theme | The seam, not the theme | The app is light-only and the paper identity is deliberate. Token indirection makes dark a later swap rather than a rewrite. |
| Migration shape | Tokens repo-wide in one commit, then components one at a time | One pass on tokens keeps the palette from existing twice; incremental components keep each diff reviewable. |

## No `(app)` route group is needed

Worth recording, because the obvious assumption is wrong and would cost a large
pointless diff.

`src/app/layout.tsx` is thin: `<html>`, `<body>`, the skip link, and the
stylesheet import. The app shell is applied *per section* —
`dashboard/layout.tsx`, `repos/layout.tsx`, `prs/layout.tsx`,
`settings/layout.tsx` and `onboarding/layout.tsx` each render `<AppShell>`.
`invitations/layout.tsx` renders the public panel instead.

So a public page at `/` needs no route group and no moved routes. It is
`src/app/page.tsx` with its own `<main id="main-content">`, alongside
`/signed-out` and `/invitations/[token]` as the third public surface. Existing
routes are untouched.

## The package

`pnpm-workspace.yaml` today carries only `onlyBuiltDependencies`. It gains a
`packages:` key. The app stays at the repository root and depends on
`@fieldnote/design-system` with `workspace:*`. Next transpiles the package
source directly; there is no build step and no published artifact.

### Cascade layers

`styles/index.css` declares the order once:

```css
@layer fn.reset, fn.tokens, fn.base, fn.components;
```

| Layer | Holds |
| --- | --- |
| `fn.reset` | Box sizing, `body` margin, inherited control fonts, the `:focus-visible` ring. What `style.css` does in its first 40 lines. |
| `fn.tokens` | Every custom property, on `:root`. The only layer permitted a literal colour, with one exception recorded below. |
| `fn.base` | Element defaults: headings on the display face, body copy, links, table chrome, the type scale. |
| `fn.components` | The nine primitives. Each class references semantic tokens only. |

Explicit layers matter here beyond tidiness. `style.css` has already accumulated
selectors that fight each other — the comment above `.bigcard` in that file
records `.v` and `.s` migrating between files to stop them desyncing. Layered
CSS means app and marketing rules written outside the package always win without
specificity escalation.

### Tokens, in three tiers

**Reference tier** names the palette: `--fn-pine-900` `#203f36`, `--fn-pine-600`
`#526b60`, `--fn-mist-300` `#bfcfc4`, `--fn-mist-200` `#e6ece7`, `--fn-paper-50`
`#f4f7f3`, `--fn-ember-600` `#be421f`, `--fn-ember-700` `#a6381a`,
`--fn-moss-700` `#2f6b52`, `--fn-amber-700` `#986817`, `--fn-amber-100`
`#f3e8ca`.

**Finish tier** names one colour per grade band, lifted from
`gradePresentation()`: `--fn-grade-common` `#b54740`, `--fn-grade-shimmer`
`#548eae`, `--fn-grade-bronze` `#895333`, `--fn-grade-silver` `#697e8d`,
`--fn-grade-gold` `#a77a13`, `--fn-grade-prismatic` `#7359a3`.

**Semantic tier** is what components actually reference: `--fn-color-ink`,
`--fn-color-ink-muted`, `--fn-color-ground`, `--fn-color-surface`,
`--fn-color-surface-glass`, `--fn-color-border`, `--fn-color-hairline`,
`--fn-color-accent`, `--fn-color-accent-hover`, `--fn-color-positive`,
`--fn-color-caution`, `--fn-color-caution-surface`.

Type keeps both approved faces and adds a mono role for the things fieldnote is
made of — SHAs, paths, check ids: `--fn-font-display` Georgia,
`--fn-font-ui` Arial, `--fn-font-mono` `ui-monospace`. Sizes:
`--fn-text-display` `clamp(32px, 3.3vw, 48px)`, `--fn-text-title` `27px`,
`--fn-text-subtitle` `22px`, `--fn-text-figure` `30px`, `--fn-text-body` `14px`,
`--fn-text-detail` `12.5px`, `--fn-text-label` `10px`.

Space collapses fourteen ad-hoc values to eight steps: `--fn-space-1` through
`--fn-space-8` at 4, 8, 12, 16, 24, 32, 48, 64. Radii carry role rather than
decoration: `--fn-radius-sm` `5px` for inputs, `--fn-radius-md` `8px` for
grouped content, `--fn-radius-lg` `12px` for a separate object,
`--fn-radius-card` `16px` for the grade card, `--fn-radius-pill` `999px`. One
elevation: `--fn-elevation-card`.

**The one exception.** Each grade finish is an eight-to-nine stop gradient that
only means anything whole. Naming twenty-odd stops as tokens would be
bookkeeping, not a system, so the foil gradients stay in `grade-card.css`
selected by `data-finish`, exactly as today. The card continues to expose a
single `--grade` custom property.

### The nine primitives

Admission test: the app renders it *and* the landing page renders it.

`Brand`, `Button` (accent / secondary / quiet), `Badge` (positive / caution /
neutral), `Surface`, `StatCard`, `Notice`, `Field`, `DataTable`, `GradeCard`.
`GradeBanner` travels with `GradeCard` — it shares the tier vocabulary and
cannot sit on the other side of the boundary from it.

That test excludes, deliberately: charts, the PR table, the repository picker,
import progress, cohort comparison, the grading report, the sidebar, the
workspace switcher, the account menu. Product surfaces, not system parts.

## Moving the grade card

The consequential part of this design, and the reason the package is worth
building rather than a `src/design-system/` directory.

`src/components/grading/grade-card.tsx` is the dashboard's centrepiece and now
the marketing hero. Two consumers means it moves into the package — but it moves
**presentational only**.

**What moves:** `grade-card.tsx`, `grade-card.css`, `grade-banner.tsx`,
`grade-banner.css`. Markup and foils unchanged.

**What does not move:** all of `src/domain/grading`. `gradePresentation()`,
`flavourLine()`, `finishNames`, `nextTier()` and `checkTitles` stay where they
are, tested where they are. They encode the rubric's thresholds, and a rubric is
domain knowledge, not presentation.

**The seam:** `GradeCard` takes the resolved presentation as props — `score`,
`finish`, `label`, `color`, `symbol`, `count`, `finishName`, `flavour`, `next`,
plus repository name, rubric version and SHA. It derives nothing. The dashboard
passes the output of `gradePresentation(score)`; the landing page passes a
literal of the same shape.

That shared type is what stops the marketing card drifting from the product
card. A change to the foil, the scale or the layout lands in both at once, and a
marketing card that claims an impossible tier fails to typecheck.

## The landing page

`src/app/page.tsx`, replacing the redirect. A server component that calls
`hasCurrentSession()` and redirects to `/dashboard` when a session exists, so
returning users are not shown the pitch. Signed-out visitors get the page.

Sections, in order:

1. **Nav** — Field Lines mark and wordmark, links to the rubric, how it works,
   metrics, self-host. "Sign in" quiet, "Try it now" accent.
2. **Hero** — eyebrow "Agent readiness, graded out of 100", headline "Get your
   ultimate harness.", the argument that agents are only as good as the
   repository they are handed. Both CTAs to `/api/auth/login`. Beside it the
   Gold card at 95, with a sheen crossing the foil and a pointer tilt, both
   disabled under `prefers-reduced-motion`. Four proof figures: 5 checks, 6
   finishes, 100 perfect score, 0 LLM judges.
3. **The ladder** — all six finishes as cards, Common 32 through Prismatic 100,
   each with its band and rating. The card is reissued on every graded commit,
   which is the honest difference between this and a compliance badge.
4. **The rubric** — the five readiness checks at 20 points each, titled from
   `checkTitles`. Every failing check records paths and line ranges; no model
   decides the score.
5. **Monitor · Act · Train** — three stages with honest status badges (shipped /
   scoring shipped / designed), and `demo-pr-4` from `src/demo/fixtures.ts` as
   supporting evidence: failed CI, changed a test file, turned green, therefore
   not clean green.
6. **What it measures** — the metric table, condensed to five rows.
7. **The guarantees** — no LLM judges, recomputed not stored, replays
   identically, unknown stays unknown.
8. **Sign up** — "Continue with GitHub", plus the AGPL-3.0 self-host path.
9. **Footer.**

Marketing compositions live in `src/components/marketing/` and own no tokens. A
marketing piece that wants a new colour is a signal to add a semantic token, not
a local hex.

### Copy holds to what ships

Act is "scoring shipped", Train is "designed". The README says so and the page
must not say otherwise. Every metric definition is the README's own wording, and
every tier name, flavour line and threshold is read from
`src/domain/grading/`, not rewritten for marketing.

## How we will know it works

- `pnpm check` passes: lint, typecheck, unit, integration, build.
- The dashboard, repository, PR, settings and onboarding pages keep their
  colours and type exactly, and their spacing within the pixel-or-two the scale
  normalization allows. The screenshots under `docs/screenshots/` are the
  reference.
- `src/app/style.css` contains no hex literal once extraction is done. This is
  lint-enforceable and is how drift gets caught by CI rather than by review.
- `packages/design-system` imports nothing from `src/`. Also lint-enforceable.
- The grade card renders identically on the dashboard after the move, at all six
  finishes. `gradePresentation`, `flavour`, `next-tier` and `presentation` tests
  continue to pass unmodified — they test domain logic the move does not touch.
- `/` serves the landing page to a signed-out visitor and redirects a signed-in
  one to `/dashboard`.
- The page holds at 400px wide with no horizontal scroll, and the skip link
  reaches its `<main>`.

## Out of scope

- **A public share page or README badge for the card.** The obvious next move
  for a card people want to show off, and real marketing leverage — but it is
  new public surface with caching, and a decision about whether a low grade may
  be shared. Its own design.
- **A dark theme.** The seam only.
- **A demo workspace requiring no account.** Considered and declined; "Try it
  now" goes to sign-in.
- **Restructuring the repository into `apps/*`.** Not needed, as recorded above.
- **Any change to grading, metrics, import, or the Act leg.** This design moves
  presentation and adds a page. It changes no behaviour.
