import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
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
