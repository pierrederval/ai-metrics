export type AgentProvider =
  'claude-code' | 'codex' | 'cursor' | 'gemini' | 'other' | 'human' | 'unknown';
export type Conclusion =
  | 'success'
  | 'failure'
  | 'neutral'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'action_required'
  | 'startup_failure'
  | 'stale';
export interface Gate {
  appId: string;
  name: string;
}
export interface GatePolicy {
  version: number;
  gates: Gate[];
}
export interface CiCheck extends Gate {
  id: string;
  sha: string;
  execution: number;
  workflowRunId?: string;
  workflowName?: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: Conclusion | null;
  queuedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}
export interface ChangedFile {
  path: string;
  previousPath?: string;
  changeType: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
}
export interface Revision {
  sha: string;
  previousSha: string | null;
  observedAt: string | null;
  files: ChangedFile[];
  diffComplete: boolean;
}
export interface PullRequestFacts {
  openedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  revisions: Revision[];
  checks: CiCheck[];
  files: ChangedFile[];
  historyComplete: boolean;
  issues: string[];
}
export interface CiAttempt {
  sha: string;
  checks: CiCheck[];
  order: number;
  greenAt: string | null;
  green: boolean | null;
  firstPass: boolean | null;
}
export interface PrMetrics {
  ciAttemptCount: number;
  firstPassGreen: boolean | null;
  eventuallyGreen: boolean | null;
  attemptsToGreen: number | null;
  timeToFirstGreenSeconds: number | null;
  failedCheckCount: number;
  uniqueFailedGateCount: number;
  testFilesChanged: number;
  harnessFilesChanged: number;
  harnessChangedAfterFailure: boolean | null;
  cleanGreen: boolean | null;
  evidenceStatus: 'complete' | 'pending' | 'incomplete' | 'unconfigured';
  evidenceReasons: string[];
  analyzerVersion: string;
  gatePolicyVersion: number;
}
export const gateKey = (gate: Gate) => JSON.stringify([gate.appId, gate.name]);
export const isFailure = (conclusion: Conclusion | null) =>
  conclusion !== null && !['success', 'neutral', 'skipped'].includes(conclusion);
