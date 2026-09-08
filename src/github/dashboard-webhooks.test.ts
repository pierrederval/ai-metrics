import { expect, test } from 'vitest';
import { dashboardWebhookEvidence } from './dashboard-webhooks';
test('stored review submission and workflow completion retain source identity and conservative receipt bound', () => {
  const receivedAt = new Date('2026-01-01T01:00:00Z');
  const evidence = dashboardWebhookEvidence(
    'repo',
    1,
    ['head'],
    [
      {
        eventName: 'pull_request_review',
        receivedAt,
        payload: {
          action: 'submitted',
          pull_request: { number: 1 },
          review: {
            id: 41,
            user: { id: 7 },
            state: 'approved',
            submitted_at: '2026-01-01T00:01:00Z',
            commit_id: 'head',
          },
        },
      },
      {
        eventName: 'workflow_run',
        receivedAt,
        payload: {
          workflow_run: {
            id: 10,
            run_attempt: 1,
            head_sha: 'head',
            status: 'completed',
            conclusion: 'success',
            run_started_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:05:00Z',
          },
        },
      },
      {
        eventName: 'pull_request_review',
        receivedAt,
        payload: {
          action: 'submitted',
          pull_request: { number: 2 },
          review: {
            id: 99,
            user: { id: 9 },
            state: 'approved',
            submitted_at: '2026-01-01T00:01:00Z',
          },
        },
      },
    ],
  );
  expect(evidence.reviews).toHaveLength(1);
  expect(evidence.reviews[0]).toMatchObject({
    id: '41',
    occurredAt: '2026-01-01T00:01:00Z',
    dismissedReviewId: null,
  });
  expect(evidence.attempts[0]).toMatchObject({
    completedAt: null,
    sourceUpdatedAt: '2026-01-01T00:05:00Z',
    terminalObservedAt: receivedAt.toISOString(),
  });
});
