import { markFailed } from './reconcile';
import { inngest } from '../client';
import { eventData } from '../events';
import { processEvent } from '../process-event';
import { handleGithubEvent } from '../../github/handle-event';
export const processGithubEvent = inngest.createFunction(
  {
    id: 'process-github-event',
    triggers: [{ event: 'github/webhook.received' }],
    retries: 5,
    onFailure: async ({ event, error }) => {
      const { eventId } = eventData.parse(event.data.event.data);
      await markFailed(eventId, error.message);
    },
    concurrency: { limit: 1, key: 'event.data.eventId' },
  },
  async ({ event, step }) => {
    const { eventId } = eventData.parse(event.data);
    return step.run('process-raw-event', () => processEvent(eventId, handleGithubEvent));
  },
);
