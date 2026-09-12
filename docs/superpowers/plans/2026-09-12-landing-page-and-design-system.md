# Landing Page and Shared Design System Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task ends with a passing `pnpm check` and its own commit.

**Goal:** `@fieldnote/design-system` holds the tokens, base styles and nine primitives that the product and a new public landing page at `/` both consume, and that landing page pitches agent readiness as something a repository earns.

**Architecture:** A pnpm workspace package with four explicit cascade layers (`fn.reset`, `fn.tokens`, `fn.base`, `fn.components`) and three token tiers (reference → finish → semantic). `src/app/style.css` keeps only app-shell rules and, once extraction is done, contains no colour literal. `GradeCard` moves into the package presentationally; every threshold, flavour line and tier name stays in `src/domain/grading`, reaching the card as props. The landing page is `src/app/page.tsx` replacing today's redirect — no route group, because the app shell is already applied per section.

**Tech Stack:** TypeScript, Next.js 16 (App Router), React 19, plain CSS with `@layer` (no Tailwind, no CSS-in-JS), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-landing-page-and-design-system-design.md`
**Approved visual baseline:** `docs/design/fieldnote/README.md`
**Prior plan, for house style:** `docs/superpowers/plans/2026-09-11-authoring-runs-and-plan-workflow.md`

## Global Constraints

- **The approved baseline is not up for redesign.** Every colour and typeface comes from `src/app/style.css` or `gradePresentation()`. Introducing a new hue, a new typeface or a web font is out of scope and a review rejection.
- **Colour and type are pixel-identical after migration.** Spacing may move by a pixel or two where the eight-step scale normalizes a value; nothing larger, and no change in layout structure.
- **The package imports nothing from `src/`.** No data fetching, no `next/navigation`, no session, no database, no domain types. It is presentational and its only React import is React itself.
- **Domain logic does not move.** `gradePresentation`, `flavourLine`, `finishNames`, `nextTier` and `checkTitles` stay in `src/domain/grading`, and their existing test files must pass **unmodified**. A diff to any of those four test files means the boundary was drawn wrong.
- **No new dependency.** This plan adds no runtime package. The workspace package is transpiled by Next, not built.
- **Copy holds to what ships.** Act is "scoring shipped", Train is "designed". Metric definitions are the README's own wording.
- **Marketing owns no tokens.** A marketing component that wants a colour adds a semantic token; it never writes a hex.
- **`pnpm check` must pass before the final commit of each task.**
- End every commit message with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01KXnmXKsvPQmaxDZtcXS7AV`

## Vocabulary you must not get wrong

- A **finish** is one of the six grade-card foils: `common`, `shimmer`, `bronze`, `silver`, `gold`, `rainbow`. The user-facing name of `rainbow` is **Prismatic** (`finishNames`), and marketing copy uses the user-facing name. Never rename the `rainbow` identifier.
- A **readiness check** is one of the rubric's five criteria. It is **not** a CI check.
- A **primitive** is a package component. A **marketing composition** is a page section under `src/components/marketing/` built from primitives. Compositions never enter the package.
- **Reference / finish / semantic** name the three token tiers. Components reference the semantic tier only, except the grade card, which reads `--grade`.

## File Structure

| File | Responsibility |
| --- | --- |
| `pnpm-workspace.yaml` *(modify)* | Add the `packages:` key. |
| `package.json` *(modify)* | Depend on `@fieldnote/design-system` at `workspace:*`. |
| `packages/design-system/package.json` | Name, `exports` for `.` and `./styles`. |
| `packages/design-system/styles/index.css` | Declares `@layer` order, imports the four layer files. |
| `packages/design-system/styles/tokens.css` | All three token tiers on `:root`. |
| `packages/design-system/styles/reset.css` | Box sizing, body margin, control fonts, focus ring. |
| `packages/design-system/styles/base.css` | Element defaults and the type scale. |
| `packages/design-system/styles/components.css` | The nine primitives' classes. |
| `packages/design-system/src/*.tsx` | The nine primitives. |
| `packages/design-system/src/grade-card.{tsx,css}` | Moved from `src/components/grading/`, props-only. |
| `packages/design-system/src/grade-banner.{tsx,css}` | Moved from `src/components/grading/`. |
| `packages/design-system/src/index.ts` | Public surface. |
| `packages/design-system/boundary.test.ts` | Guards: no `src/` import, no stray hex. |
| `src/app/style.css` *(modify)* | Shrinks to app-shell rules; no colour literal. |
| `src/app/layout.tsx` *(modify)* | Imports the package stylesheet. |
| `src/app/page.tsx` *(rewrite)* | The landing page. |
| `src/app/style.test.ts` | Guard: `style.css` holds no colour literal. |
| `src/components/grading/grade-presentation.ts` | Maps domain output to the card's prop shape. |
| `src/components/marketing/*.tsx` | The page sections. |

---

### Task 1: The workspace package and its tokens

Create the package, declare the layers, and put every token in it. Nothing consumes it yet beyond the stylesheet import, so the app must look exactly as it does now.

**Files:**
- Modify: `pnpm-workspace.yaml`, `package.json`, `src/app/layout.tsx`
- Create: `packages/design-system/package.json`, `styles/{index,reset,tokens,base}.css`, `src/index.ts`
- Test: `packages/design-system/boundary.test.ts`

**Interfaces:**
- `@fieldnote/design-system/styles` — the single stylesheet entry point.
- `@fieldnote/design-system` — the component barrel, empty in this task.

Background you need: `src/app/layout.tsx` imports `./style.css` today and is the only global import. `pnpm-workspace.yaml` currently has no `packages:` key — adding one does not move the root app, which stays the workspace root.

- [ ] **Step 1: Declare the workspace and the package**

`pnpm-workspace.yaml` gains, above `onlyBuiltDependencies`:

```yaml
packages:
  - packages/*
```

`packages/design-system/package.json`:

```json
{
  "name": "@fieldnote/design-system",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./styles": "./styles/index.css"
  }
}
```

Add `"@fieldnote/design-system": "workspace:*"` to the root `package.json` dependencies, then `pnpm install`.

- [ ] **Step 2: Declare the layer order**

`styles/index.css`, and nothing else in the package may declare layer order:

```css
@layer fn.reset, fn.tokens, fn.base, fn.components;

@import './reset.css' layer(fn.reset);
@import './tokens.css' layer(fn.tokens);
@import './base.css' layer(fn.base);
@import './components.css' layer(fn.components);
```

Create `components.css` empty in this task with a comment naming Task 3.

- [ ] **Step 3: Write the tokens**

`styles/tokens.css` holds all three tiers on `:root`, exactly as the spec lists them. Take every reference value from `src/app/style.css` and every finish value from `src/domain/grading/presentation.ts`. Do not round, adjust or rename a colour.

The semantic tier references the reference tier; nothing references a hex directly except the reference tier itself.

Expect to add three to five extra semantic tokens for the `main` background wash (`style.css` builds it from `#e6ece7`, `#c8ddce`, `#ecd3c3` and `#f0f5ef`). That is intended — Task 2's guard requires it.

- [ ] **Step 4: Move reset and base**

`reset.css` takes the first ~40 lines of `style.css`: `* { box-sizing }`, `body { margin: 0 }`, the `button/input/select/textarea { font: inherit }` rule, and `:focus-visible`. `base.css` takes the element defaults: `h1`–`h3` on the display face and their sizes, `p`/`small` line height, `a`, `code`, table chrome, `.eyebrow`, `.muted`.

Delete each rule from `style.css` as you move it. Do not leave a copy behind — two definitions of `h1` in different layers is the bug this task exists to prevent.

- [ ] **Step 5: Import it**

In `src/app/layout.tsx`, import the package stylesheet **before** `./style.css`, so app rules layer over package rules:

```tsx
import '@fieldnote/design-system/styles';
import './style.css';
```

- [ ] **Step 6: Write the boundary guard**

`packages/design-system/boundary.test.ts` asserts the package imports nothing from the app. Read every `.ts`/`.tsx` under `packages/design-system/src/`, and assert no import specifier starts with `../../` or contains `src/`. It passes trivially now and holds for every later task.

- [ ] **Step 7: Verify nothing moved**

Run `pnpm dev` and compare `/dashboard`, `/repos` and a PR page against `docs/screenshots/`. Colour and type must be identical. Then `pnpm check`, then commit.

---

### Task 2: Empty `style.css` of colour literals

Replace every hex in `style.css` with a semantic token. This is the migration's highest-risk step and gets its own commit so it can be reverted alone.

**Files:**
- Modify: `src/app/style.css`
- Test: `src/app/style.test.ts`

- [ ] **Step 1: Write the failing guard**

```typescript
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('src/app/style.css', () => {
  it('holds no colour literal, so the palette exists in exactly one place', () => {
    const css = readFileSync('src/app/style.css', 'utf8');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });
});
```

It fails loudly. Good — the count it prints is the work.

- [ ] **Step 2: Replace, do not restyle**

Work rule by rule. A bare hex becomes its semantic token. A hex with an alpha suffix (`#203f3610`, `#203f3620`, `#ffffff35`) becomes either an existing token or a new semantic one named for its role — `--fn-color-hairline`, `--fn-color-row-hover` — never a new hue.

When a value appears once and means one thing, give it a role name. When it appears five times meaning five things, that is five tokens, not one shared one. Resist collapsing distinct roles onto one token to make the count smaller.

- [ ] **Step 3: Verify and commit**

Guard passes, `pnpm check` passes, and the screenshots still match on colour and type. Commit.

---

### Task 3: The eight presentational primitives

`GradeCard` is Task 4. This task does the other eight.

**Files:**
- Create: `packages/design-system/src/{brand,button,badge,surface,stat-card,notice,field,data-table}.tsx`
- Modify: `packages/design-system/styles/components.css`, `packages/design-system/src/index.ts`
- Delete: `src/components/brand.tsx`
- Test: `packages/design-system/src/primitives.test.ts`

**Interfaces:**

```typescript
export function Brand(props: { href?: string; children?: ReactNode }): JSX.Element;
export function Button(props: { variant?: 'accent' | 'secondary' | 'quiet'; size?: 'md' | 'lg' } & ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element;
export function Badge(props: { tone: 'positive' | 'caution' | 'neutral'; children: ReactNode }): JSX.Element;
export function Surface(props: { as?: 'section' | 'div'; children: ReactNode }): JSX.Element;
export function StatCard(props: { label: string; value: ReactNode; detail?: ReactNode }): JSX.Element;
export function Notice(props: { tone?: 'caution'; children: ReactNode }): JSX.Element;
export function Field(props: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>): JSX.Element;
export function DataTable(props: { children: ReactNode }): JSX.Element;
```

`Brand` is the one that already exists. It takes no `next/link` — the package cannot import it. It renders a plain `<a>`; callers that need client navigation wrap it or pass `href`. Confirm the app's two current usages (`AppShell` via `Sidebar`, `invitations/layout.tsx`, `signed-out/page.tsx`) still behave.

- [ ] **Step 1: Move the classes**

`components.css` takes `.brand*`, `button`/`.quiet-button`, `section` (as `.fn-surface`), `.bigcard` (as `.fn-stat-card`), `.notice`, `input`/`label`, `.scroll` + `table` chrome from `style.css` and `grade-banner.css`'s pill. Keep class names stable where the app already uses them so this task changes no app markup it does not have to.

- [ ] **Step 2: Write the components**

Each is a server component: no `'use client'`, no hooks except `useId` where an `id` is genuinely needed. Props in, markup out.

- [ ] **Step 3: Repoint `Brand`**

Delete `src/components/brand.tsx`. Update its importers to `@fieldnote/design-system`. The `.brand` CSS moves with it.

- [ ] **Step 4: Test what is worth testing**

Do not snapshot markup. Assert the behaviour that has a contract: `Button` maps `variant` to the right class and forwards `type`, `Badge` maps `tone` to the right class, `Field` associates its label with its input by `id`. Extend `boundary.test.ts` — it must still pass with real components present.

- [ ] **Step 5:** `pnpm check`, screenshots, commit.

---

### Task 4: Move the grade card, leave the domain behind

The consequential task. The card becomes presentational and gains a second consumer; the rubric stays where it is.

**Files:**
- Create: `packages/design-system/src/grade-card.{tsx,css}`, `grade-banner.{tsx,css}`
- Create: `src/components/grading/grade-presentation.ts`
- Delete: `src/components/grading/grade-card.{tsx,css}`, `grade-banner.{tsx,css}`
- Modify: importers of both components
- Test: `src/components/grading/grade-presentation.test.ts`

**Interfaces:**

The package declares its own finish union — it cannot import `GradePresentation`:

```typescript
export type GradeFinish = 'common' | 'shimmer' | 'bronze' | 'silver' | 'gold' | 'rainbow';

export type GradeCardProps = {
  score: number;
  finish: GradeFinish;
  label: string;
  color: string;
  symbol: 'circle' | 'star';
  count: number;
  finishName: string;
  flavour: string;
  next: { targetScore: number; targetFinish: string; moves: { id: string; title: string; points: number }[] } | null;
  repositoryName: string;
  rubricVersion: string;
  sha: string;
};
```

`src/components/grading/grade-presentation.ts` is the only place domain meets package:

```typescript
export function gradeCardProps(input: {
  score: number; repositoryName: string; sha: string; rubricVersion: string; checks: CheckResult[];
}): GradeCardProps;
```

It calls `gradePresentation`, `finishNames`, `flavourLine` and `nextTier` and returns the prop shape. No component calls those four directly any more.

- [ ] **Step 1: Pin the two unions together**

The package's `GradeFinish` and the domain's `GradePresentation['finish']` must not drift. In `grade-presentation.test.ts`, assert it at type level and at runtime:

```typescript
const _pinned: GradeFinish = null as unknown as GradePresentation['finish'];
```

plus a runtime case per finish, driving `gradeCardProps` at 32, 61, 74, 84, 95 and 100 and asserting the finish, label, symbol and count each time. Those six scores are the six bands; a threshold change breaks this test, which is the point.

- [ ] **Step 2: Move the files verbatim**

Copy `grade-card.tsx`, `grade-card.css`, `grade-banner.tsx`, `grade-banner.css` into the package. The CSS does not change at all — the foils, the `--grade` property and `data-finish` stay exactly as they are. The `.tsx` loses its four domain imports and reads the same values from props.

Keep `useId` for the rainbow gradient: two cards on one page must not share a gradient id, and the landing page renders two.

- [ ] **Step 3: Repoint the app**

`src/app/repos/[repoId]/grading/page.tsx` and the Agents view now call `gradeCardProps(...)` and spread the result. Delete the old files.

- [ ] **Step 4: Prove the domain did not move**

`git diff --stat` must show **zero** changes to `src/domain/grading/*.test.ts`. Run them explicitly:

`pnpm vitest run src/domain/grading/`

- [ ] **Step 5: Verify all six finishes render**

Not just the one the demo fixture produces. Drive `gradeCardProps` at each of the six scores in a test, and eyeball the grading page against the demo seed. `pnpm check`, commit.

---

### Task 5: Marketing compositions

Page sections, built only from primitives. None of these enter the package.

**Files:**
- Create: `src/components/marketing/{hero,tier-ladder,rubric-grid,evidence-card,loop-stages,metric-table,guarantees,signup,site-nav,site-footer}.tsx`
- Create: `src/components/marketing/marketing.css`
- Test: `src/components/marketing/tier-ladder.test.ts`, `hero.test.ts`

Background you need: the hero card is Gold at 95 with `next` pointing at Prismatic 100. The ladder renders all six finishes. Both build their props through `gradeCardProps` so a marketing card cannot claim a tier the rubric cannot produce.

- [ ] **Step 1: The ladder is derived, not typed out**

Define the six sample scores once — `[32, 61, 74, 84, 95, 100]` — and map them through `gradePresentation` to get name, colour, symbol and count. Test that the ladder renders six rungs in ascending score order, that the finishes are the six distinct ones, and that Prismatic is last and labelled "Prismatic", not "rainbow".

- [ ] **Step 2: The hero**

Headline "Get your ultimate harness.", eyebrow "Agent readiness, graded out of 100", both CTAs to `/api/auth/login`. Proof figures: 5 checks, 6 finishes, 100 perfect score, 0 LLM judges. Test that the hero card's props come out Gold with score 95 and a non-null `next` targeting 100.

- [ ] **Step 3: The rest**

`rubric-grid` reads its five titles from `checkTitles` — never a hand-typed copy. `evidence-card` renders the `demo-pr-4` sequence. `loop-stages` carries the three honest badges. `metric-table` uses `DataTable`. `guarantees` and `signup` are plain compositions.

- [ ] **Step 4: The motion, and its opt-out**

`marketing.css` carries the hero card's sheen animation and the glow. Both sit behind `@media (prefers-reduced-motion: reduce) { animation: none }`. The pointer tilt is the page's only client JavaScript: a tiny `'use client'` wrapper that bails when `matchMedia('(prefers-reduced-motion: reduce)').matches`. If that wrapper starts to grow, drop the tilt rather than grow it.

- [ ] **Step 5:** `pnpm check`, commit.

---

### Task 6: The landing page

**Files:**
- Rewrite: `src/app/page.tsx`
- Modify: `src/app/style.css` if the public surface needs a rule
- Test: `src/app/page.test.ts`

- [ ] **Step 1: The route**

```tsx
import { redirect } from 'next/navigation';
import { hasCurrentSession } from '../auth/session';

export const metadata = { title: 'Get your ultimate harness', description: '...' };

export default async function Landing() {
  if (await hasCurrentSession()) redirect('/dashboard');
  return <main id="main-content" tabIndex={-1}>{/* sections */}</main>;
}
```

`hasCurrentSession()` already exists in `src/auth/session.ts` — do not add an auth helper.

The `<main id="main-content">` is required: `layout.tsx` renders a skip link pointing at it, and this page supplies no `AppShell` to provide one.

- [ ] **Step 2: Order the sections**

Nav, hero, ladder, rubric, Monitor · Act · Train with the evidence card, metric table, guarantees, signup, footer. Everything meant to be read is visible at rest — no section parked at `opacity: 0` waiting on a scroll observer.

- [ ] **Step 3: Test the routing contract**

A signed-out visitor gets the page; a signed-in one is redirected to `/dashboard`. Mock `hasCurrentSession`; this is a unit test and touches no database.

- [ ] **Step 4: Hold it at 400px**

No horizontal scroll on the body at 400px wide. Side gutter never below 16px. The metric table is the one element allowed to scroll, inside its own `overflow-x: auto`. Tab from the top: the skip link reaches `<main>`, and every CTA takes a visible focus ring.

- [ ] **Step 5:** `pnpm check`, commit.

---

## Final verification

Prove the spec's success criteria rather than asserting them. Run each and paste the output into the pull-request body.

- [ ] **`style.css` holds no colour literal** — `pnpm vitest run src/app/style.test.ts`
- [ ] **The package imports nothing from the app** — `pnpm vitest run packages/design-system/boundary.test.ts`
- [ ] **The grading domain was not touched** — `git diff --stat main -- src/domain/grading/` shows no change to any `*.test.ts`, and `pnpm vitest run src/domain/grading/` passes
- [ ] **All six finishes resolve correctly through the new seam** — `pnpm vitest run src/components/grading/grade-presentation.test.ts`
- [ ] **The ladder cannot claim a tier the rubric cannot produce** — `pnpm vitest run src/components/marketing/tier-ladder.test.ts`
- [ ] **`/` serves the page signed-out and redirects signed-in** — `pnpm vitest run src/app/page.test.ts`
- [ ] **Everything passes together** — `pnpm check`
- [ ] **The product still looks like itself** — run `pnpm dev:demo`, open `/dashboard`, `/repos`, a PR page and the grading page, and compare against `docs/screenshots/`. Colour and type identical; spacing within a pixel or two.
- [ ] **The landing page holds at 400px** — no horizontal body scroll, skip link reaches `<main>`, CTAs show a focus ring.

## Not in this plan

A public share page or README badge for the card; a dark theme beyond the token seam that makes one possible; a demo workspace that needs no account; any `apps/*` restructure; and any change to grading, metrics, import or the Act leg. This plan moves presentation and adds one page. It changes no behaviour.
