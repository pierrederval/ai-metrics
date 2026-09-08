import { Octokit } from 'octokit';
import { expect, test } from 'vitest';
import { collectWorkflowAttempts } from './collect-workflow-attempts';

function clientFor(route: (url: URL) => { data: unknown; status?: number; next?: string }) {
  return new Octokit({
    request: {
      fetch: async (input: RequestInfo | URL) => {
        const result = route(new URL(String(input)));
        return new Response(JSON.stringify(result.data), {
          status: result.status ?? 200,
          headers: {
            'content-type': 'application/json',
            ...(result.next ? { link: `<${result.next}>; rel="next"` } : {}),
          },
        });
      },
    },
  });
}
const run = { id: 10, run_attempt: 2, head_sha: 'head' };
const attempt = (n: number) => ({
  ...run,
  run_attempt: n,
  status: 'completed',
  conclusion: n === 1 ? 'failure' : 'success',
  run_started_at: `2026-01-0${n}T00:00:00Z`,
  updated_at: `2026-01-0${n}T01:00:00Z`,
});
test('collects individual attempts and deduplicates runs shared across SHAs without inventing exact completion', async () => {
  const result = await collectWorkflowAttempts(
    clientFor((url) => ({
      data: url.pathname.includes('/attempts/')
        ? attempt(Number(url.pathname.split('/').at(-1)))
        : { total_count: 1, workflow_runs: [run] },
    })),
    'repo',
    'o',
    'r',
    ['head', 'other'],
  );
  expect(result.attempts).toHaveLength(2);
  expect(result.attempts).toEqual(
    [1, 2].map((n) =>
      expect.objectContaining({
        repositoryId: 'repo',
        runId: '10',
        attempt: n,
        headSha: 'head',
        conclusion: n === 1 ? 'failure' : 'success',
        startedAt: `2026-01-0${n}T00:00:00Z`,
        completedAt: null,
        sourceUpdatedAt: `2026-01-0${n}T01:00:00Z`,
      }),
    ),
  );
  expect(result.attempts[0].terminalObservedAt).toEqual(expect.any(String));
});
test('missing old attempt preserves later evidence and marks incomplete', async () => {
  const result = await collectWorkflowAttempts(
    clientFor((url) =>
      url.pathname.endsWith('/attempts/1')
        ? { status: 404, data: {} }
        : {
            data: url.pathname.includes('/attempts/')
              ? attempt(2)
              : { total_count: 1, workflow_runs: [run] },
          },
    ),
    'repo',
    'o',
    'r',
    ['head'],
  );
  expect(result.complete).toBe(false);
  expect(result.attempts).toHaveLength(1);
  expect(result.attempts[0].attempt).toBe(2);
});
test('filtered workflow search truncation is incomplete', async () => {
  const result = await collectWorkflowAttempts(
    clientFor(() => ({ data: { total_count: 1001, workflow_runs: [] } })),
    'repo',
    'o',
    'r',
    ['head'],
  );
  expect(result.complete).toBe(false);
});
test('forbidden Actions data is a retryable failure rather than no CI', async () => {
  await expect(
    collectWorkflowAttempts(
      clientFor(() => ({ status: 403, data: { message: 'Forbidden' } })),
      'repo',
      'o',
      'r',
      ['head'],
    ),
  ).rejects.toMatchObject({ status: 403 });
});
