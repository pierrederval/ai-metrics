import { inngest } from '../client';
import { dispatchImport } from '../dispatch-import';
import { listUndispatchedImports } from '../../db/queries/repository-imports';
export const reconcileImports = inngest.createFunction(
  { id: 'reconcile-repository-imports', triggers: [{ cron: '* * * * *' }] },
  async ({ step }) => {
    if (process.env.DEMO_MODE === 'true') return { demo: true };
    const ids = await step.run('find-undispatched-imports', listUndispatchedImports);
    for (const runId of ids) {
      await step.run(`dispatch-${runId}`, async () => {
        try {
          await dispatchImport(runId);
        } catch (error) {
          // Leave this run queued for the next reconciliation; continue the batch now.
          console.error('Import dispatch failed', { runId, error });
        }
      });
    }
    return { count: ids.length };
  },
);
