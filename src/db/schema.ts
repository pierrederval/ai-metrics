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
  foreignKey,
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
import type { ReviewEvent } from '../domain/dashboard/types';
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
  credentials: text('credentials').notNull(),
  createdAt: created(),
  updatedAt: updated(),
});
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

export const dashboardPrEvidence = pgTable('dashboard_pr_evidence', {
  pullRequestId: text('pull_request_id')
    .primaryKey()
    .references(() => pullRequests.id),
  mergeHeadSha: text('merge_head_sha'),
  reviewExpected: boolean('review_expected'),
  ciExpected: boolean('ci_expected'),
  chronologyComplete: boolean('chronology_complete').notNull().default(false),
  reviewsComplete: boolean('reviews_complete').notNull().default(false),
  ciComplete: boolean('ci_complete').notNull().default(false),
  provenance: jsonb('provenance')
    .$type<{ chronology?: string[]; reviews?: string[]; ci?: string[] }>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
  collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: updated(),
});

export const reviewEvents = pgTable(
  'review_events',
  {
    id: id(),
    pullRequestId: text('pull_request_id')
      .notNull()
      .references(() => pullRequests.id),
    sourceId: text('source_id').notNull(),
    reviewerId: text('reviewer_id').notNull(),
    state: text('state').notNull(),
    commitSha: text('commit_sha'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    kind: text('kind').$type<ReviewEvent['kind']>().notNull(),
    source: text('source').notNull(),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex('review_events_source_identity').on(t.pullRequestId, t.source, t.sourceId),
    index('review_events_pr_time').on(t.pullRequestId, t.occurredAt),
    check(
      'review_events_kind',
      sql`${t.kind} IN ('review','requested','dismissed','request-removed')`,
    ),
  ],
);

export const workflowAttempts = pgTable(
  'workflow_attempts',
  {
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    runId: text('run_id').notNull(),
    attempt: integer('attempt').notNull(),
    headSha: text('head_sha').notNull(),
    status: text('status').notNull(),
    conclusion: text('conclusion'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: updated(),
  },
  (t) => [
    primaryKey({ columns: [t.repositoryId, t.runId, t.attempt] }),
    check('workflow_attempts_attempt', sql`${t.attempt} > 0`),
    index('workflow_attempts_sha').on(t.repositoryId, t.headSha),
  ],
);

export const prWorkflowAttempts = pgTable(
  'pr_workflow_attempts',
  {
    pullRequestId: text('pull_request_id')
      .notNull()
      .references(() => pullRequests.id),
    repositoryId: text('repository_id').notNull(),
    runId: text('run_id').notNull(),
    attempt: integer('attempt').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.pullRequestId, t.repositoryId, t.runId, t.attempt] }),
    foreignKey({
      columns: [t.repositoryId, t.runId, t.attempt],
      foreignColumns: [
        workflowAttempts.repositoryId,
        workflowAttempts.runId,
        workflowAttempts.attempt,
      ],
    }),
  ],
);

export const userInterests = pgTable(
  'user_interests',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    feature: text('feature').notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.feature] })],
);

export const historyBackfills = pgTable(
  'history_backfills',
  {
    id: id(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    cutoff: timestamp('cutoff', { withTimezone: true }).notNull(),
    cursor: text('cursor'),
    status: text('status').notNull(),
    retryAt: timestamp('retry_at', { withTimezone: true }),
    errorCategory: text('error_category'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check(
      'history_backfills_status',
      sql`${t.status} IN ('queued','discovering','importing','retrying','complete','partial','failed')`,
    ),
    uniqueIndex('history_backfills_one_active')
      .on(t.repositoryId)
      .where(sql`${t.status} IN ('queued','discovering','importing','retrying')`),
    index('history_backfills_retry').on(t.status, t.retryAt),
  ],
);

export const historyBackfillItems = pgTable(
  'history_backfill_items',
  {
    backfillId: text('backfill_id')
      .notNull()
      .references(() => historyBackfills.id),
    number: integer('number').notNull(),
    status: text('status').notNull().default('pending'),
    retryAt: timestamp('retry_at', { withTimezone: true }),
    errorCategory: text('error_category'),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    primaryKey({ columns: [t.backfillId, t.number] }),
    check('history_backfill_items_number', sql`${t.number} > 0`),
    check(
      'history_backfill_items_status',
      sql`${t.status} IN ('pending','importing','retrying','complete','failed')`,
    ),
    index('history_backfill_items_retry').on(t.status, t.retryAt),
  ],
);
