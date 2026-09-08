import { z } from 'zod';
import type { ReviewEvent, WorkflowAttempt } from '../domain/dashboard/types';
const reviewPayload = z.object({
  action: z.literal('submitted'),
  pull_request: z.object({ number: z.number() }),
  review: z.object({
    id: z.number(),
    user: z.object({ id: z.number() }),
    state: z.string(),
    submitted_at: z.string(),
    commit_id: z.string().nullish(),
  }),
});
const runPayload = z.object({
  workflow_run: z.object({
    id: z.number(),
    run_attempt: z.number().int().positive(),
    head_sha: z.string(),
    status: z.string(),
    conclusion: z.string().nullable(),
    run_started_at: z.string().nullish(),
    updated_at: z.string(),
  }),
});
export function dashboardWebhookEvidence(
  repositoryId: string,
  number: number,
  shas: string[],
  events: { eventName: string; receivedAt: Date; payload: Record<string, unknown> }[],
): { reviews: ReviewEvent[]; attempts: WorkflowAttempt[] } {
  const reviews: ReviewEvent[] = [],
    attempts: WorkflowAttempt[] = [];
  for (const event of events) {
    if (event.eventName === 'pull_request_review') {
      const parsed = reviewPayload.safeParse(event.payload);
      if (!parsed.success || parsed.data.pull_request.number !== number) continue;
      const review = parsed.data.review;
      reviews.push({
        id: String(review.id),
        reviewerId: String(review.user.id),
        state: review.state.toLowerCase(),
        commitSha: review.commit_id ?? null,
        occurredAt: review.submitted_at,
        kind: 'review',
        dismissedReviewId: null,
      });
    } else if (event.eventName === 'workflow_run') {
      const parsed = runPayload.safeParse(event.payload);
      if (!parsed.success || !shas.includes(parsed.data.workflow_run.head_sha)) continue;
      const run = parsed.data.workflow_run;
      attempts.push({
        repositoryId,
        runId: String(run.id),
        attempt: run.run_attempt,
        headSha: run.head_sha,
        status: run.status,
        conclusion: run.conclusion,
        startedAt: run.run_started_at ?? null,
        completedAt: null,
        sourceUpdatedAt: run.updated_at,
        terminalObservedAt: run.status === 'completed' ? event.receivedAt.toISOString() : null,
      });
    }
  }
  return { reviews, attempts };
}
