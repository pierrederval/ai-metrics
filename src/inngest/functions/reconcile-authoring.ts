import { inngest } from '../client';
import { dispatchAuthoringPlan } from '../dispatch-authoring';
import { listUndispatchedPlans } from '../../db/queries/authoring-runs';

export const reconcileAuthoring = inngest.createFunction(
  { id: 'reconcile-authoring', triggers: [{ cron: '* * * * *' }] },
  async ({ step }) => {
    if (process.env.DEMO_MODE === 'true') return { demo: true };
    const ids = await step.run('find-undispatched-plans', listUndispatchedPlans);
    for (const runId of ids)
      await step.run(`dispatch-${runId}`, async () => {
        try {
          await dispatchAuthoringPlan(runId);
        } catch {
          /* Retry unacknowledged events on the next tick. */
        }
      });
    return { count: ids.length };
  },
);
