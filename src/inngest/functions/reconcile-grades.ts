import { inngest } from '../client';
import { dispatchGrade } from '../dispatch-grade';
import { listUndispatchedGrades } from '../../db/queries/grade-runs';
export const reconcileGrades = inngest.createFunction(
  { id: 'reconcile-grades', triggers: [{ cron: '* * * * *' }] },
  async ({ step }) => {
    if (process.env.DEMO_MODE === 'true') return { demo: true };
    const ids = await step.run('find-undispatched-grades', listUndispatchedGrades);
    for (const runId of ids)
      await step.run(`dispatch-${runId}`, async () => {
        try {
          await dispatchGrade(runId);
        } catch {
          /* Retry unacknowledged events on the next tick. */
        }
      });
    return { count: ids.length };
  },
);
