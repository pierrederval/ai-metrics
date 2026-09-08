import { RetryAfterError } from 'inngest';
import { GithubCollectionRetryError } from '../../github/retry-errors';
import { inngest } from '../client';
import { prSyncData } from '../events';
import {
  finishForegroundHydration,
  runForegroundHydration,
} from '../../db/queries/foreground-hydration';
export const syncPullRequestFunction = inngest.createFunction(
  {
    id: 'sync-pull-request',
    triggers: [{ event: 'github/pr.sync.requested' }],
    retries: 5,
    onFailure: async ({ event, error }) => {
      const data = prSyncData.parse(event.data.event.data);
      const { repositoryId, number, sourceEventId } = data;
      await finishForegroundHydration(data, 'failed', event.data.run_id);
      console.error('Pull request synchronization failed', {
        repositoryId,
        pullRequestNumber: number,
        sourceEventId,
        error: error.message,
      });
    },
    concurrency: { limit: 1, key: 'event.data.repositoryId + ":" + event.data.number' },
  },
  async ({ event, step, runId }) => {
    const data = prSyncData.parse(event.data);
    return step.run('hydrate-and-project-pr', async () => {
      try {
        return await runForegroundHydration(data, runId);
      } catch (error) {
        if (error instanceof GithubCollectionRetryError)
          throw new RetryAfterError(error.message, new Date(error.retryAt));
        throw error;
      }
    });
  },
);
