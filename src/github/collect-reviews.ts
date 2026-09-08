import type { Octokit } from 'octokit';
import { z } from 'zod';
import type { ReviewEvent } from '../domain/dashboard/types';
import { errorStatus } from './normalize';

const transition = z.object({
  id: z.number(),
  event: z.string(),
  created_at: z.string(),
  requested_reviewer: z.object({ id: z.number() }).nullish(),
  requested_team: z.object({ id: z.number() }).nullish(),
  dismissed_review: z.object({ review_id: z.number(), state: z.string() }).nullish(),
});

export async function collectReviews(
  client: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<{ events: ReviewEvent[]; complete: boolean; issues: string[] }> {
  const events: ReviewEvent[] = [],
    issues: string[] = [];
  try {
    for await (const page of client.paginate.iterator(client.rest.pulls.listReviews, {
      owner,
      repo,
      pull_number: number,
      per_page: 100,
    })) {
      for (const review of page.data) {
        // Draft reviews have not occurred yet and are not historical decisions.
        if (review.state.toLowerCase() === 'pending') continue;
        if (!review.user || !review.submitted_at) {
          issues.push(`Review ${review.id} has no author or submission timestamp`);
          continue;
        }
        events.push({
          id: String(review.id),
          reviewerId: String(review.user.id),
          state: review.state.toLowerCase(),
          commitSha: review.commit_id ?? null,
          occurredAt: review.submitted_at,
          kind: 'review',
          dismissedReviewId: null,
        });
      }
    }
  } catch (error) {
    if (![404, 410].includes(errorStatus(error) ?? 0)) throw error;
    issues.push('Review history unavailable');
  }
  try {
    for await (const page of client.paginate.iterator(client.rest.issues.listEventsForTimeline, {
      owner,
      repo,
      issue_number: number,
      per_page: 100,
    })) {
      for (const raw of page.data) {
        if (
          !['review_requested', 'review_request_removed', 'review_dismissed'].includes(
            raw.event ?? '',
          )
        )
          continue;
        const parsed = transition.safeParse(raw);
        if (!parsed.success) {
          issues.push('Review transition has incomplete source identity or timestamp');
          continue;
        }
        const item = parsed.data;
        const dismissedReviewId = item.dismissed_review
          ? String(item.dismissed_review.review_id)
          : null;
        const affected = events.find(
          (event) => event.id === dismissedReviewId && event.kind === 'review',
        );
        if (item.event === 'review_dismissed') {
          if (!affected || !item.dismissed_review) {
            issues.push(`Dismissal ${item.id} cannot resolve its review`);
            continue;
          }
          // Timeline state is the original decision; actor is the dismissing user, not author.
          if (affected.state === 'dismissed')
            affected.state = item.dismissed_review.state.toLowerCase();
        }
        const reviewerId =
          affected?.reviewerId ??
          (item.requested_reviewer
            ? String(item.requested_reviewer.id)
            : item.requested_team
              ? `team:${item.requested_team.id}`
              : null);
        if (!reviewerId) {
          issues.push(`Review request ${item.id} has no reviewer identity`);
          continue;
        }
        if (item.requested_team)
          issues.push(`Team request ${item.id} cannot resolve historical membership`);
        events.push({
          id: `timeline:${item.id}`,
          reviewerId,
          state:
            item.event === 'review_dismissed'
              ? 'dismissed'
              : item.event === 'review_requested'
                ? 'requested'
                : 'removed',
          commitSha: null,
          occurredAt: item.created_at,
          kind:
            item.event === 'review_dismissed'
              ? 'dismissed'
              : item.event === 'review_requested'
                ? 'requested'
                : 'request-removed',
          dismissedReviewId,
        });
      }
    }
  } catch (error) {
    if (![404, 410].includes(errorStatus(error) ?? 0)) throw error;
    issues.push('Review timeline unavailable');
  }
  if (events.some((event) => event.kind === 'review' && event.state === 'dismissed'))
    issues.push('Original dismissed review decision unavailable');
  return {
    events: [...new Map(events.map((event) => [event.id, event])).values()],
    complete: issues.length === 0,
    issues,
  };
}
