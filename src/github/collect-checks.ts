import type { Octokit } from 'octokit';
import { normalizeCheck, errorStatus } from './normalize';
import type { CiCheck } from '../domain/pull-request/types';
export async function collectChecks(
  client: Octokit,
  owner: string,
  repo: string,
  sha: string,
  issues: string[],
) {
  const checks: CiCheck[] = [];
  const executions: CiCheck[] = [];
  const correlated = new Set<string>();
  try {
    const remote = await client.paginate(client.rest.checks.listForRef, {
      owner,
      repo,
      ref: sha,
      filter: 'all',
      per_page: 100,
    });
    checks.push(...remote.map((c) => normalizeCheck(c)));
    const runs = await client.paginate(client.rest.actions.listWorkflowRunsForRepo, {
      owner,
      repo,
      head_sha: sha,
      per_page: 100,
    });
    for (const run of runs) {
      for (let attempt = 1; attempt <= (run.run_attempt ?? 1); attempt++) {
        const jobs = await client.paginate(client.rest.actions.listJobsForWorkflowRunAttempt, {
          owner,
          repo,
          run_id: run.id,
          attempt_number: attempt,
          per_page: 100,
        });
        for (const job of jobs) {
          const checkId = job.check_run_url?.split('/').at(-1);
          if (!checkId) {
            issues.push('Actions job has no associated check identity');
            continue;
          }
          let c = checks.find((c) => c.id === checkId);
          if (!c) {
            const { data } = await client.rest.checks.get({
              owner,
              repo,
              check_run_id: Number(checkId),
            });
            c = normalizeCheck(data, attempt);
            checks.push(c);
          }
          c = { ...c };
          correlated.add(checkId);
          executions.push(c);
          c.execution = attempt;
          c.workflowRunId = String(run.id);
          c.workflowName = run.name ?? 'GitHub Actions';
          // Actions is authoritative for the execution, Checks supplies gate identity.
          c.sha = sha;
          c.status =
            job.status === 'completed'
              ? 'completed'
              : job.status === 'in_progress'
                ? 'in_progress'
                : 'queued';
          c.conclusion = job.conclusion ?? null;
          c.queuedAt = job.started_at;
          c.startedAt = job.started_at;
          c.completedAt = job.completed_at;
        }
      }
    }
  } catch (error) {
    if (![404, 410, 422].includes(errorStatus(error) ?? 0)) throw error;
    issues.push(`CI history unavailable for ${sha}`);
  }
  return [...checks.filter((c) => !correlated.has(c.id)), ...executions];
}
