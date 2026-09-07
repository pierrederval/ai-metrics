import { inngest } from '../client';
import { recomputeData } from '../events';
import { recomputePr } from '../../db/queries/persist-pr';
export const recomputePrFunction = inngest.createFunction(
  {
    id: 'recompute-pr',
    triggers: [{ event: 'metrics/pr.recompute.requested' }],
    retries: 5,
    concurrency: { limit: 1, key: 'event.data.prId' },
  },
  async ({ event, step }) => {
    const { prId } = recomputeData.parse(event.data);
    await step.run('recompute', () => recomputePr(prId));
    return { prId };
  },
);
