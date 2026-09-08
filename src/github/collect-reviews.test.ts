import { Octokit } from 'octokit';
import { expect, test } from 'vitest';
import { collectReviews } from './collect-reviews';

const at = '2026-01-02T12:00:00Z';
const review = { id: 41, user: { id: 7 }, state: 'DISMISSED', commit_id: 'head', submitted_at: at };
function clientFor(route: (url: URL) => { data: unknown; status?: number; next?: string }) {
  return new Octokit({
    request: {
      fetch: async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        const result = route(url);
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
test('paginated reviews reconstruct original dismissed decision and resolve its author, with source timestamps', async () => {
  const client = clientFor((url) =>
    url.pathname.endsWith('/reviews')
      ? url.searchParams.get('page') === '2'
        ? { data: [{ ...review, id: 42, state: 'COMMENTED' }] }
        : { data: [review], next: 'https://api.github.com/repos/o/r/pulls/1/reviews?page=2' }
      : {
          data: [
            {
              id: 91,
              event: 'review_dismissed',
              actor: { id: 99 },
              created_at: '2026-01-03T12:00:00Z',
              dismissed_review: { review_id: 41, state: 'approved' },
            },
            { id: 92, event: 'review_requested', requested_reviewer: { id: 8 }, created_at: at },
            {
              id: 93,
              event: 'review_request_removed',
              requested_reviewer: { id: 8 },
              created_at: at,
            },
          ],
        },
  );
  const result = await collectReviews(client, 'o', 'r', 1);
  expect(result.complete).toBe(true);
  expect(result.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: '41',
        reviewerId: '7',
        kind: 'review',
        state: 'approved',
        occurredAt: at,
        commitSha: 'head',
        dismissedReviewId: null,
      }),
      expect.objectContaining({
        id: 'timeline:91',
        reviewerId: '7',
        kind: 'dismissed',
        dismissedReviewId: '41',
        occurredAt: '2026-01-03T12:00:00Z',
      }),
      expect.objectContaining({ id: '42', state: 'commented' }),
      expect.objectContaining({ kind: 'requested', reviewerId: '8' }),
      expect.objectContaining({ kind: 'request-removed', reviewerId: '8' }),
    ]),
  );
});
test('unavailable timeline preserves known reviews and marks history incomplete', async () => {
  const result = await collectReviews(
    clientFor((url) =>
      url.pathname.endsWith('/reviews') ? { data: [review] } : { status: 410, data: {} },
    ),
    'o',
    'r',
    1,
  );
  expect(result.complete).toBe(false);
  expect(result.events).toHaveLength(1);
  expect(result.events[0].state).toBe('dismissed');
  expect(result.issues.length).toBeGreaterThan(0);
});
test('unresolved team request retains identity and unknown history', async () => {
  const result = await collectReviews(
    clientFor((url) => ({
      data: url.pathname.endsWith('/reviews')
        ? []
        : [{ id: 92, event: 'review_requested', requested_team: { id: 12 }, created_at: at }],
    })),
    'o',
    'r',
    1,
  );
  expect(result.complete).toBe(false);
  expect(result.events[0].reviewerId).toBe('team:12');
});
test('forbidden review history is retryable failure, never empty complete evidence', async () => {
  await expect(
    collectReviews(
      clientFor(() => ({ status: 403, data: { message: 'Forbidden' } })),
      'o',
      'r',
      1,
    ),
  ).rejects.toMatchObject({ status: 403 });
});
