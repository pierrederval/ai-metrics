# Team accounts and workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship GitHub sign-in, workspace ownership and team invitations with tenant-scoped access.

**Architecture:** Retain canonical GitHub repositories and existing OAuth sessions. Add workspace links and memberships as the application authorization boundary; GitHub permission is checked separately for connection. Durable encrypted invitation deliveries use Inngest and Resend.

**Tech Stack:** Next.js 16.3.4, React 19.2.8, TypeScript, PostgreSQL, Drizzle, Inngest, Vitest; GitHub REST and Resend REST through existing server-side fetch/Octokit.

**Spec:** `docs/superpowers/specs/2026-09-08-workspaces-grader-design.md`

## Global Constraints

- Keep Fieldnote’s current visual style; Railway is a feature reference only.
- Use existing Next.js 16.3.4, React 19.2.8, PostgreSQL, Drizzle, Vitest, and Inngest conventions; do not upgrade dependencies for this work.
- Read relevant installed guides in `node_modules/next/dist/docs/` before application code changes.
- GitHub is the only sign-in provider. Resend delivers workspace invitations.
- Workspace membership grants access to every connected repository’s analytics and grading evidence, including private repositories.
- Owner manages settings, invitations, and members; Member reads analytics and runs graders. Connecting repositories additionally requires current GitHub administrator permission.
- Every completed grade preserves its commit SHA, rubric version, evaluator version, results, and evidence. Never silently recompute historical grades.
- No repository code execution, LLM grading, harness grading, or deployment grading in v0.1.
- Never include secrets, invitation tokens, GitHub credentials, or raw repository files in logs or client props.


## Execution preparation

- [x] Read the spec and saved preview; the user approved the five-check, 20-points-per-check initial policy at execution time.
- [x] Inspect `git status --short`; preserve existing README.md and next-env.d.ts changes. Read AGENTS.md and installed Next guides for layouts, cookies, route handlers, server actions, and authentication. Use the executing skill's workspace isolation workflow at execution time.
- [x] Use `pnpm exec vitest run <unit-test-path>` for unit tests and `pnpm exec vitest run --config vitest.integration.config.ts <integration-test-path>` for database tests. Integration configuration refuses databases whose names do not end in `_test`.

## File ownership and task order

The file lists below are the ownership map. Create files only when their task is implemented. Existing `src/db/schema.ts` remains the schema registry; domain policies are pure, DB services own transactions, auth wrappers resolve the caller, UI never grants access. Complete tasks sequentially. Each numbered implementation item is a separate small edit/check, not one large coding step.

### Task 1: Workspace persistence and default provisioning

**Files:** Modify `src/db/schema.ts`; create `src/workspaces/store.ts`, `src/workspaces/store.integration.test.ts`; generate the next available `drizzle/*.sql` and metadata.

**Interfaces:**
Consumes existing `users`, `repositories`, `db()` and `randomUUID`.
Produces `Role = 'owner' | 'member'`; `Workspace = {id:string; name:string}`; `ensureDefaultWorkspace(userId:string):Promise<Workspace>`; `createWorkspace(userId:string,name:string):Promise<Workspace>`; `listWorkspaces(userId:string):Promise<Array<Workspace & {role:Role}>>`.

- [x] **Write the first regression test** in the listed test file, using Vitest imports and the named production imports. Database cases use the existing integration setup and cleanup conventions.

```ts
test('concurrent sign-ins create one default', async () => {
  const [a,b] = await Promise.all([ensureDefaultWorkspace('fixture-user'), ensureDefaultWorkspace('fixture-user')]);
  expect(a.id).toBe(b.id);
  expect(await listWorkspaces('fixture-user')).toHaveLength(1);
});
```

- [x] **Run red:** `pnpm exec vitest run --config vitest.integration.config.ts src/workspaces/store.integration.test.ts`. Expected: missing export/module or failing assertion; fix harness errors before implementation.

- [x] Add user `displayName` and `avatarUrl` nullable columns; add workspaces (`id`, `name`, nullable unique `defaultForUserId`, timestamps), memberships (composite workspace/user PK, checked role), links (workspace/repository PK, `connectedBy`, timestamp). Keep canonical repository IDs untouched.
- [x] Implement provisioning with a user row lock and unique default constraint inside one transaction. Normalize name with the shared schema below. Insert workspace and owner together; return the existing default on duplicate requests.

```ts
export const workspaceName = z.string().trim().min(1).max(80);
// Transaction order: lock user -> select default -> insert workspace -> insert owner.
await tx.execute(sql`select id from users where id = ${userId} for update`);
```

- [x] Generate migration with `pnpm db:generate`; inspect additive SQL and foreign keys. Add integration assertions for a second named workspace, invalid/blank names, FK rejection and duplicate membership. Apply migrations to the dedicated test DB through the existing migration test pattern.


- [x] **Run green:** `pnpm exec vitest run --config vitest.integration.config.ts src/workspaces/store.integration.test.ts`. Expected: all task cases pass. Run `pnpm typecheck` and fix integration signatures before continuing.
- [x] **Commit only this task’s listed files**, including generated migration metadata when applicable: `git commit -m "feat: persist team workspaces and default ownership"`. Stage paths explicitly; do not stage unrelated changes.

### Task 2: Session identity and workspace authorization

**Files:** Modify `src/auth/session.ts`, `src/auth/access.ts`, `src/app/api/auth/callback/route.ts`, `src/app/dashboard/page.tsx`, `src/app/onboarding/actions.ts`; create `src/workspaces/access.ts`, `src/workspaces/access.integration.test.ts`; update existing access tests.

**Interfaces:**
Consumes Task 1. Produces `currentUser():Promise<{id:string;login:string;displayName:string|null;avatarUrl:string|null}>`, `requireWorkspace(workspaceId?:string,role?:Role):Promise<Workspace & {role:Role}>`, `setActiveWorkspace(workspaceId:string):Promise<void>`, `linkRepository(workspaceId:string,repositoryId:string):Promise<void>`. Keep `accessibleRepositories(refresh?:boolean)` for workspace-filtered reads; extract old GitHub discovery into `githubAccessibleRepositories(refresh?:boolean)`.

- [x] **Write the first regression test** in the listed test file, using Vitest imports and the named production imports. Database cases use the existing integration setup and cleanup conventions.

```ts
test('a GitHub-visible repo is not automatically a workspace repo', async () => {
  // Seed two users, two memberships and one repo link; mock currentUser/cookies.
  expect(await accessibleRepositories()).toEqual([]);
  await expect(linkRepository('other-workspace','fixture-repo')).rejects.toThrow();
});
```

- [x] **Run red:** `pnpm exec vitest run --config vitest.integration.config.ts src/workspaces/access.integration.test.ts`. Expected: missing export/module or failing assertion; fix harness errors before implementation.

- [x] Extract session identity lookup from `userClient` without changing token refresh. Route unauthenticated page access to `/signed-out`; preserve existing POST logout behavior. On callback, upsert GitHub fields without replacing edited displayName; provision default before redirect.
- [x] Resolve membership every request. Use existing HTTP-only cookie options for `fieldnote-workspace`; explicit IDs cannot fall back. In cookie mode reject stale preference and choose an existing membership deterministically.

```ts
const membership = await db().select().from(workspaceMemberships)
  .where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.userId, user.id)));
if (!membership[0] || (role === 'owner' && membership[0].role !== 'owner')) notFound();
```

- [x] Split GitHub discovery from read authorization. Link only after Owner membership and a fresh GitHub admin grant. All linked active repos are readable by members without user GitHub repo calls. Keep existing admin import actions behind Owner + GitHub admin; explicit disconnect removes only the workspace link.
- [x] Audit `requireRepository`, `requireTrackedRepository`, dashboard `prRows` input, onboarding, PR page, import polling route and repo actions. Add tests for Member reads without GitHub grant, outsider rejection, suspended installations, disconnect, changed selected workspace and explicit cross-workspace IDs. Preserve demo mode's development-only protection and give demo UI a fixed read-only workspace.


- [x] **Run green:** `pnpm exec vitest run --config vitest.integration.config.ts src/workspaces/access.integration.test.ts`. Expected: all task cases pass. Run `pnpm typecheck` and fix integration signatures before continuing.
- [x] **Commit only this task’s listed files**, including generated migration metadata when applicable: `git commit -m "feat: scope repository access to workspace membership"`. Stage paths explicitly; do not stage unrelated changes.

### Task 3: Invitation lifecycle and member management

**Files:** Modify `src/db/schema.ts`; create `src/workspaces/invitations.ts`, `src/workspaces/members.ts`, `src/workspaces/invitation-policy.ts`, `src/workspaces/invitations.integration.test.ts`; generate migration and metadata.

**Interfaces:**
Produces `normalizeEmail(email:string):string`; `createInvitation(workspaceId:string,email:string):Promise<{id:string}>`; `resendInvitation(id:string):Promise<void>`; `revokeInvitation(id:string):Promise<void>`; `acceptInvitation(token:string,verifiedEmails:string[]):Promise<{workspaceId:string}>`; `changeMemberRole(workspaceId:string,userId:string,role:Role):Promise<void>`; `removeMember(workspaceId:string,userId:string):Promise<void>`. All mutation services resolve currentUser and authorize internally; verifiedEmails is server-only freshly fetched GitHub data, never form input.

- [x] **Write the first regression test** in the listed test file, using Vitest imports and the named production imports. Database cases use the existing integration setup and cleanup conventions.

```ts
test('email normalization preserves plus aliases', () => {
  expect(normalizeEmail(' Person+team@Example.com ')).toBe('person+team@example.com');
});
```

- [x] **Run red:** `pnpm exec vitest run --config vitest.integration.config.ts src/workspaces/invitations.integration.test.ts`. Expected: missing export/module or failing assertion; fix harness errors before implementation.

- [x] Add invitations: id, workspaceId, email, tokenHash, invitedBy, expiresAt, acceptedAt, revokedAt, createdAt; unique open workspace/email (resend updates existing row). Add deliveries: id, invitationId, encryptedToken, state, createdAt, dispatchedAt, sentAt, providerId, safe error code. Add delivery count indexes for rate limits.
- [x] Issue tokens and queued delivery atomically; store only token hash in invitation. Encrypted delivery uses existing AES helper and configured encryption key.

```ts
const token = randomBytes(32).toString('base64url');
const expiresAt = new Date(Date.now() + 7 * 86400000);
const digest = tokenHash(token);
const encryptedToken = encrypt(token, integrationEnv().TOKEN_ENCRYPTION_KEY);
```

- [x] Serialize invite limits with workspace row locking: 20/owner/hour, 100/workspace/day, 60s resend cooldown. Resend rotates hash, invalidates prior delivery, resets expiry. Revocation is terminal. Escape/validate inputs and avoid account-existence disclosure.
- [x] In acceptance lock invitation, verify unexpired/unrevoked status and fresh verified email membership; upsert Member, mark accepted atomically. Replay by same member is idempotent, others fail. Lock workspace for owner role changes and reject removing/demoting last owner.
- [x] Add DB tests for wrong/unverified email, 7-day expiry boundary, duplicate acceptance, resend-old-token rejection, revoke, concurrent limits, duplicate member invite and concurrent last-owner removal. Fixture users/repos must be real DB inserts; no production credentials.


- [x] **Run green:** `pnpm exec vitest run --config vitest.integration.config.ts src/workspaces/invitations.integration.test.ts`. Expected: all task cases pass. Run `pnpm typecheck` and fix integration signatures before continuing.
- [x] **Commit only this task’s listed files**, including generated migration metadata when applicable: `git commit -m "feat: implement secure workspace invitations and roles"`. Stage paths explicitly; do not stage unrelated changes.

### Task 4: Durable Resend delivery and invitation OAuth continuation

**Files:** Create `src/email/resend.ts`, `src/email/resend.test.ts`, `src/inngest/functions/send-invitation.ts`, `src/inngest/functions/reconcile-invitations.ts`, `src/workspaces/delivery.ts`, `src/workspaces/delivery.integration.test.ts`, `src/app/invitations/[token]/page.tsx`, `src/app/invitations/[token]/actions.ts`; modify `src/lib/env.ts`, `.env.example`, `src/inngest/events.ts`, `src/app/api/inngest/route.ts`, auth login/callback routes and `docs/railway.md`.

**Interfaces:**
Consumes Task 3 and existing `inngest`, `encrypt/decrypt`, `userClient`. Produces `sendInvitationEmail(input:{deliveryId:string;to:string;workspaceName:string;url:string}):Promise<{id:string}>`; `deliverInvitation(deliveryId:string):Promise<void>`; `dispatchInvitation(deliveryId:string):Promise<void>`. Event `workspace/invitation.send.requested` carries `{deliveryId:string}` only.

- [x] **Write the first regression test** in the listed test file, using Vitest imports and the named production imports. Database cases use the existing integration setup and cleanup conventions.

```ts
test('provider failure is not reported as sent', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}',{status:429})));
  await expect(sendInvitationEmail({deliveryId:'d',to:'a@example.com',workspaceName:'Team',url:'https://example.com/invitations/token'})).rejects.toThrow();
});
```

- [x] **Run red:** `pnpm exec vitest run src/email/resend.test.ts`. Expected: missing export/module or failing assertion; fix harness errors before implementation.

- [x] Add independently parsed optional email configuration; missing config gives an unavailable result before creating an invite. Use plain-text email to avoid HTML injection. Verify Resend sender domain and GitHub App Email addresses read permission in deployment docs.

```ts
const response = await fetch('https://api.resend.com/emails', {
  method: 'POST', signal: AbortSignal.timeout(15000),
  headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type':'application/json', 'Idempotency-Key': input.deliveryId},
  body: JSON.stringify({from, to:[input.to], subject:'Join your Fieldnote workspace',
    text:`You were invited to ${input.workspaceName}. Sign in with GitHub to accept:
${input.url}
This invitation expires in seven days.`}),
});
if (!response.ok) throw new Error(`Email delivery failed (${response.status})`);
```

- [x] Dispatch stable delivery event IDs and acknowledge after send. Reconciliation scans undispatched rows each minute. Worker rechecks live invitation, decrypts token server-side, retries transient failure at most five times inside 24h, records terminal failure and clears encrypted payload. Reconcile terminal worker failure so UI cannot stay queued forever. Use the same idempotency key after ambiguous timeouts.
- [x] Build GET invitation confirmation (never accepts). Carry token through a 10-minute HTTP-only cookie set by login; after OAuth redirect only to the internal invitation path. Add no-referrer metadata/header. POST acceptance fetches `client.rest.users.listEmailsForAuthenticatedUser`, filters `verified===true`, invokes service and switches workspace. Missing permission/API failure displays reauthorization guidance, never trusts public profile email.
- [x] Add DB delivery tests for duplicate dispatch, crash before acknowledgment, revoke-before-send and terminal failure. Add route/action tests for invalid OAuth state, expired continuation, open redirect attempts, unauthenticated token privacy and GET-not-consuming. Run the delivery integration test with the dedicated integration command.


- [x] **Run green:** `pnpm exec vitest run src/email/resend.test.ts`. Expected: all task cases pass. Run `pnpm typecheck` and fix integration signatures before continuing.
- [x] **Commit only this task’s listed files**, including generated migration metadata when applicable: `git commit -m "feat: deliver and accept workspace invitations via Resend"`. Stage paths explicitly; do not stage unrelated changes.

### Task 5: Production sign-in, navigation and settings

**Files:** Create `src/components/brand.tsx`, `src/components/app-shell.tsx`, `src/components/workspace-switcher.tsx`, `src/components/account-menu.tsx`, `src/app/settings/account/page.tsx`, `src/app/settings/workspace/page.tsx`, `src/app/settings/actions.ts`, `src/app/settings/actions.test.ts`; modify `src/app/layout.tsx`, `src/components/sidebar.tsx`, `src/app/signed-out/page.tsx`, `src/app/style.css`, dashboard/onboarding pages and `.env.example`.

**Interfaces:**
Consumes currentUser, listWorkspaces, requireWorkspace and invitation/member services. Produces server actions `saveAccountName(form:FormData)`, `saveWorkspaceName(form:FormData)`, `createNamedWorkspace(form:FormData)`, `switchWorkspace(form:FormData)` returning `Promise<{error?:string}>`; invitation forms call Task 3 services. Shell receives only sanitized names, avatar URL, workspace IDs and roles.

- [x] **Write the first regression test** in the listed test file, using Vitest imports and the named production imports. Database cases use the existing integration setup and cleanup conventions.

```ts
test('workspace rename checks the caller, not a submitted role', async () => {
  vi.mocked(requireWorkspace).mockRejectedValue(new Error('Forbidden'));
  const form = new FormData(); form.set('name','Renamed'); form.set('role','owner');
  await expect(saveWorkspaceName(form)).rejects.toThrow('Forbidden');
});
```

- [x] **Run red:** `pnpm exec vitest run src/app/settings/actions.test.ts`. Expected: missing export/module or failing assertion; fix harness errors before implementation.

- [x] Extract current logo into Brand. Build centered sign-in card and hide authenticated chrome on signed-out/invitation entry pages using a deliberate shell boundary. Keep async cookies/params conventions. Reuse existing OAuth endpoint, not the preview click handler.
- [x] Implement shell dropdown and profile menu with scoped CSS; use semantic buttons and list options, arrows/Home/End, Escape/outside click and focus return. Selection calls an authorized server action and refreshes server data. Retain usable mobile navigation.

```tsx
<button type="button" aria-expanded={open} aria-controls="workspace-options"
  onClick={() => setOpen(!open)}>{activeWorkspace.name}</button>
```

- [x] Wire real settings reads and mutation forms; trim account/workspace names 1–80 chars. Rust Owner pill; Member read-only settings; show pending, sent, failed, revoked, expired states and form errors. Add create workspace, connect/disconnect, invite/resend/revoke, role changes and removal. Use revalidatePath after mutations; never display success for failed delivery.
- [x] Browser-check at 375px and 1440px: sign-in, closed dropdown, switching, profile alignment, keyboard, invitation loading/error/success, account versus workspace name, last-owner error. Compare saved preview and capture screenshots; verify a second logged-in user cannot read another workspace by URL/API.
- [x] Run `pnpm check`; document tested environment, migration/rollback strategy (application rollback retains additive tables), sender-domain setup and pending external configuration. Do not deploy or send test invitations to real people without task authorization.


- [x] **Run green:** `pnpm exec vitest run src/app/settings/actions.test.ts`. Expected: all task cases pass. Run `pnpm typecheck` and fix integration signatures before continuing.
- [x] **Commit only this task’s listed files**, including generated migration metadata when applicable: `git commit -m "feat: ship Fieldnote team settings and navigation"`. Stage paths explicitly; do not stage unrelated changes.

## Verification notes

Lint, typecheck, 145 unit tests, 61 database integration tests, and production build passed. Browser inspection used 1440×900 and 375×812 with synthetic users in the dedicated test database. Verified sign-in, menus, keyboard switching, independent saved names, creation, Member controls, last-owner error, missing-email-configuration error, logout and outsider denial. Invitation acceptance/delivery success is covered by mocked-provider and database tests; live GitHub OAuth and Resend delivery remain external configuration checks and were not claimed as passed. No real emails or deployment performed.

## Coverage review

Tasks 1–2 cover identity, defaults, migration and access. Tasks 3–4 cover roles, invitations, limits, delivery and OAuth acceptance. Task 5 covers the approved shell/sign-in/settings and release checks. Grading is intentionally in the following plan.
