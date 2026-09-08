import type { Octokit } from 'octokit';
import type { WorkflowAttempt } from '../domain/dashboard/types';
import { errorStatus } from './normalize';

export async function collectWorkflowAttempts(
  client: Octokit,
  repositoryId: string,
  owner: string,
  repo: string,
  shas: string[],
): Promise<{ attempts: WorkflowAttempt[]; complete: boolean; issues: string[] }> {
  const attempts: WorkflowAttempt[] = [],
    issues: string[] = [];
  const runs = new Map<number, number>();
  for (const sha of new Set(shas)) {
    try {
      let count = 0;
      for (let page = 1; ; page++) {
        const response = await client.rest.actions.listWorkflowRunsForRepo({
          owner,
          repo,
          head_sha: sha,
          per_page: 100,
          page,
        });
        count += response.data.workflow_runs.length;
        for (const run of response.data.workflow_runs)
          runs.set(run.id, Math.max(runs.get(run.id) ?? 0, run.run_attempt ?? 1));
        const hasNext = response.headers.link?.includes('rel="next"');
        if (!hasNext || page >= 10) {
          if (count < response.data.total_count || hasNext || response.data.total_count >= 1000)
            issues.push(`Workflow search may be truncated for ${sha}`);
          break;
        }
      }
    } catch (error) {
      if (![404, 410].includes(errorStatus(error) ?? 0)) throw error;
      issues.push(`Workflow history unavailable for ${sha}`);
    }
  }
  for (const [runId, lastAttempt] of runs) {
    for (let attempt = 1; attempt <= lastAttempt; attempt++) {
      try {
        const { data } = await client.rest.actions.getWorkflowRunAttempt({
          owner,
          repo,
          run_id: runId,
          attempt_number: attempt,
        });
        if (data.run_attempt !== attempt) {
          issues.push(`Workflow ${runId} attempt ${attempt} identity mismatch`);
          continue;
        }
        attempts.push({
          repositoryId,
          runId: String(runId),
          attempt,
          headSha: data.head_sha,
          status: data.status ?? 'unknown',
          conclusion: data.conclusion,
          startedAt: data.run_started_at ?? null,
          // GitHub documents updated_at as mutable metadata, not exact completion.
          completedAt: null,
          sourceUpdatedAt: data.updated_at,
          terminalObservedAt: data.status === 'completed' ? new Date().toISOString() : null,
        });
      } catch (error) {
        if (![404, 410].includes(errorStatus(error) ?? 0)) throw error;
        issues.push(`Workflow ${runId} attempt ${attempt} unavailable`);
      }
    }
  }
  return { attempts, complete: issues.length === 0, issues };
}
