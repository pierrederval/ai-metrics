import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  primaryKey,
  check,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { ImportState, ItemState } from '../domain/import/types';
import type {
  Gate,
  PullRequestFacts,
  PrMetrics,
  CiCheck,
  ChangedFile,
} from '../domain/pull-request/types';
const id = () => text('id').primaryKey();
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
export const installations = pgTable('github_installations', {
  id: id(),
  githubInstallationId: text('github_installation_id').notNull().unique(),
  accountLogin: text('account_login').notNull(),
  accountType: text('account_type').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});
export const repositories = pgTable('repositories', {
  id: id(),
  installationId: text('installation_id')
    .notNull()
    .references(() => installations.id),
  githubRepositoryId: text('github_repository_id').notNull().unique(),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  defaultBranch: text('default_branch').notNull(),
  isPrivate: boolean('is_private').notNull(),
  active: boolean('active').notNull().default(true),
  isDemo: boolean('is_demo').notNull().default(false),
  trackingStartedAt: timestamp('tracking_started_at', { withTimezone: true }),
  syncStatus: text('sync_status').notNull().default('idle'),
  syncProgress: integer('sync_progress').notNull().default(0),
  syncError: text('sync_error'),
  createdAt: created(),
  updatedAt: updated(),
});
export const pullRequests = pgTable(
  'pull_requests',
  {
    id: id(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    githubPrId: text('github_pr_id').notNull().unique(),
    githubPrNumber: integer('github_pr_number').notNull(),
    title: text('title').notNull(),
    state: text('state').notNull(),
    authorLogin: text('author_login').notNull(),
    headSha: text('head_sha').notNull(),
    baseSha: text('base_sha').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    mergedAt: timestamp('merged_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    agentProvider: text('agent_provider').notNull().default('unknown'),
    facts: jsonb('facts').$type<PullRequestFacts>().notNull(),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('pr_repo_number').on(t.repositoryId, t.githubPrNumber)],
);
export const commits = pgTable(
  'commits',
  {
    id: id(),
    pullRequestId: text('pull_request_id')
      .notNull()
      .references(() => pullRequests.id),
    sha: text('sha').notNull(),
    authorLogin: text('author_login'),
    committedAt: timestamp('committed_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [uniqueIndex('commit_pr_sha').on(t.pullRequestId, t.sha)],
);
export const revisions = pgTable('pr_revisions', {
  id: id(),
  pullRequestId: text('pull_request_id')
    .notNull()
    .references(() => pullRequests.id),
  sha: text('sha').notNull(),
  previousSha: text('previous_sha'),
  observedAt: timestamp('observed_at', { withTimezone: true }),
  diffComplete: boolean('diff_complete').notNull(),
  createdAt: created(),
});
export const ciRuns = pgTable('ci_runs', {
  id: id(),
  repositoryId: text('repository_id')
    .notNull()
    .references(() => repositories.id),
  githubRunId: text('github_run_id'),
  runAttempt: integer('run_attempt').notNull().default(1),
  headSha: text('head_sha').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  conclusion: text('conclusion'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
});
export const prRuns = pgTable(
  'pr_ci_runs',
  {
    pullRequestId: text('pull_request_id')
      .notNull()
      .references(() => pullRequests.id),
    ciRunId: text('ci_run_id')
      .notNull()
      .references(() => ciRuns.id),
  },
  (t) => [primaryKey({ columns: [t.pullRequestId, t.ciRunId] })],
);
export const ciChecks = pgTable('ci_checks', {
  id: id(),
  ciRunId: text('ci_run_id')
    .notNull()
    .references(() => ciRuns.id),
  githubCheckRunId: text('github_check_run_id').notNull(),
  appId: text('app_id').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  conclusion: text('conclusion'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  normalized: jsonb('normalized').$type<CiCheck>().notNull(),
  createdAt: created(),
  updatedAt: updated(),
});
export const observations = pgTable('ci_observations', {
  id: id(),
  ciCheckId: text('ci_check_id')
    .notNull()
    .references(() => ciChecks.id),
  payload: jsonb('payload').$type<CiCheck>().notNull(),
  createdAt: created(),
});
export const changedFiles = pgTable('changed_files', {
  id: id(),
  pullRequestId: text('pull_request_id')
    .notNull()
    .references(() => pullRequests.id),
  commitSha: text('commit_sha'),
  fromSha: text('from_sha'),
  provenance: text('provenance').notNull(),
  path: text('path').notNull(),
  changeType: text('change_type').notNull(),
  additions: integer('additions').notNull(),
  deletions: integer('deletions').notNull(),
  normalized: jsonb('normalized').$type<ChangedFile>().notNull(),
  createdAt: created(),
});
export const githubEvents = pgTable('github_events', {
  id: id(),
  deliveryId: text('delivery_id').notNull().unique(),
  eventName: text('event_name').notNull(),
  action: text('action'),
  installationId: text('installation_id'),
  repositoryId: text('repository_id'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  processingError: text('processing_error'),
  disposition: text('disposition').notNull().default('pending'),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
});
export const gatePolicies = pgTable(
  'gate_policies',
  {
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    version: integer('version').notNull(),
    gates: jsonb('gates').$type<Gate[]>().notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.repositoryId, t.version] })],
);
export const prMetrics = pgTable('pr_metrics', {
  id: id(),
  pullRequestId: text('pull_request_id')
    .notNull()
    .unique()
    .references(() => pullRequests.id),
  ciAttemptCount: integer('ci_attempt_count').notNull(),
  firstPassGreen: boolean('first_pass_green'),
  eventuallyGreen: boolean('eventually_green'),
  attemptsToGreen: integer('attempts_to_green'),
  timeToFirstGreenSeconds: integer('time_to_first_green_seconds'),
  failedCheckCount: integer('failed_check_count').notNull(),
  uniqueFailedGateCount: integer('unique_failed_gate_count').notNull(),
  testFilesChanged: integer('test_files_changed').notNull(),
  harnessFilesChanged: integer('harness_files_changed').notNull(),
  harnessChangedAfterFailure: boolean('harness_changed_after_failure'),
  cleanGreen: boolean('clean_green'),
  evidenceStatus: text('evidence_status').notNull(),
  evidenceReasons: jsonb('evidence_reasons').$type<string[]>().notNull(),
  analyzerVersion: text('analyzer_version').notNull(),
  gatePolicyVersion: integer('gate_policy_version').notNull(),
  projection: jsonb('projection').$type<PrMetrics>().notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
});
export const users = pgTable('users', {
  id: id(),
  login: text('login').notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  credentials: text('credentials').notNull(),
  createdAt: created(),
  updatedAt: updated(),
});
export const workspaces = pgTable('workspaces', {
  id: id(),
  name: text('name').notNull(),
  defaultForUserId: text('default_for_user_id')
    .unique()
    .references(() => users.id),
  createdAt: created(),
  updatedAt: updated(),
});
export const workspaceMemberships = pgTable(
  'workspace_memberships',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').$type<'owner' | 'member'>().notNull(),
    createdAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    check('workspace_memberships_role', sql`${t.role} IN ('owner','member')`),
  ],
);
export const workspaceRepositories = pgTable(
  'workspace_repositories',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    connectedBy: text('connected_by')
      .notNull()
      .references(() => users.id),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.repositoryId] })],
);
export const sessions = pgTable('sessions', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: created(),
});

export const repositoryImports = pgTable(
  'repository_imports',
  {
    id: id(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    retryOf: text('retry_of').references((): AnyPgColumn => repositoryImports.id),
    state: text('state').$type<ImportState>().notNull(),
    total: integer('total'),
    completed: integer('completed').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    message: text('message'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    createdAt: created(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'repository_imports_state',
      sql`${t.state} IN ('queued','discovering','importing','complete','partial','failed')`,
    ),
    check('repository_imports_total', sql`${t.total} BETWEEN 0 AND 100`),
    check('repository_imports_completed', sql`${t.completed} >= 0`),
    check('repository_imports_failed', sql`${t.failed} >= 0`),
    check(
      'repository_imports_counts',
      sql`${t.total} IS NULL OR ${t.completed} + ${t.failed} <= ${t.total}`,
    ),
    uniqueIndex('repository_imports_one_active')
      .on(t.repositoryId)
      .where(sql`${t.state} IN ('queued','discovering','importing')`),
    index('repository_imports_latest').on(t.repositoryId, t.createdAt.desc()),
    uniqueIndex('repository_imports_one_retry')
      .on(t.retryOf)
      .where(sql`${t.retryOf} IS NOT NULL`),
  ],
);
export const repositoryImportItems = pgTable(
  'repository_import_items',
  {
    runId: text('run_id')
      .notNull()
      .references(() => repositoryImports.id),
    number: integer('number').notNull(),
    state: text('state').$type<ItemState>().notNull().default('pending'),
  },
  (t) => [
    primaryKey({ columns: [t.runId, t.number] }),
    check('repository_import_items_number', sql`${t.number} > 0`),
    check('repository_import_items_state', sql`${t.state} IN ('pending','complete','failed')`),
  ],
);

export const workspaceInvitations = pgTable(
  'workspace_invitations',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: text('accepted_by').references(() => users.id),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('workspace_invitations_open_email')
      .on(t.workspaceId, t.email)
      .where(sql`${t.acceptedAt} IS NULL AND ${t.revokedAt} IS NULL`),
  ],
);

export const invitationDeliveries = pgTable(
  'invitation_deliveries',
  {
    id: id(),
    invitationId: text('invitation_id')
      .notNull()
      .references(() => workspaceInvitations.id),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => users.id),
    encryptedToken: text('encrypted_token'),
    encryptedPayload: text('encrypted_payload'),
    attempts: integer('attempts').notNull().default(0),
    firstAttemptAt: timestamp('first_attempt_at', { withTimezone: true }),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    state: text('state')
      .$type<'queued' | 'sending' | 'sent' | 'failed' | 'cancelled'>()
      .notNull()
      .default('queued'),
    createdAt: created(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    providerId: text('provider_id'),
    errorCode: text('error_code'),
  },
  (t) => [
    index('invitation_deliveries_owner_time').on(t.requestedBy, t.createdAt),
    index('invitation_deliveries_workspace_time').on(t.workspaceId, t.createdAt),
    index('invitation_deliveries_invitation_time').on(t.invitationId, t.createdAt),
    check(
      'invitation_deliveries_state',
      sql`${t.state} IN ('queued','sending','sent','failed','cancelled')`,
    ),
  ],
);

export const gradingRubrics = pgTable(
  'grading_rubrics',
  {
    family: text('family').notNull(),
    version: text('version').notNull(),
    evaluatorVersion: text('evaluator_version').notNull(),
    definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.family, t.version] })],
);
export const gradeRuns = pgTable(
  'grade_runs',
  {
    id: id(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    family: text('family').notNull(),
    rubricVersion: text('rubric_version').notNull(),
    evaluatorVersion: text('evaluator_version').notNull(),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => users.id),
    requestedWorkspaceId: text('requested_workspace_id')
      .notNull()
      .references(() => workspaces.id),
    retryOf: text('retry_of').references((): AnyPgColumn => gradeRuns.id),
    state: text('state').$type<'queued' | 'running' | 'complete' | 'failed'>().notNull(),
    sha: text('sha'),
    result: jsonb('result').$type<import('../domain/grading/types').GradeResult>(),
    errorCode: text('error_code'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    createdAt: created(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    check('grade_runs_state', sql`${t.state} IN ('queued','running','complete','failed')`),
    check('grade_runs_score', sql`(${t.result}->>'score')::integer BETWEEN 0 AND 100`),
    check(
      'grade_runs_result',
      sql`(${t.state} = 'complete' AND ${t.sha} IS NOT NULL AND ${t.completedAt} IS NOT NULL AND ${t.result} IS NOT NULL AND ${t.result}->>'score' IS NOT NULL) OR (${t.state} <> 'complete' AND ${t.result} IS NULL)`,
    ),
    uniqueIndex('grade_runs_one_active')
      .on(t.repositoryId, t.family)
      .where(sql`${t.state} IN ('queued','running')`),
    index('grade_runs_latest').on(t.repositoryId, t.createdAt.desc()),
  ],
);
