import { inngest } from '../client';
import { historySyncData } from '../events';
import {
  ensureHistoryBackfill,
  getHistoryBackfill,
  listHistoryRecovery,
  processHistorySlice,
  repositoriesMissingHistory,
} from '../../db/queries/history-backfill';
import { dispatchHistoryBackfill } from '../dispatch-history';
import { recomputeExecutedDetections } from '../../db/queries/ai-involvement';

const historyBackfillTerminalStatuses = new Set(['complete', 'partial']);

export const historyBackfillFunction = inngest.createFunction(
  {
    id: 'backfill-history',
    triggers: [{ event: 'github/history.sync.requested' }],
    retries: 3,
    // Bound open background transactions as well as same-repository steps. The DB
    // installation lock also covers different repositories belonging to one account.
    concurrency: [{ limit: 3 }, { limit: 1, key: 'event.data.repositoryId' }],
    priority: { run: '-600' },
  },
  async ({ event, step }) => {
    const { repositoryId, backfillId } = historySyncData.parse(event.data);
    await step.run('collect-one-history-slice', () =>
      processHistorySlice(repositoryId, backfillId),
    );
    // The backfill hydrates older pull requests directly through the collector
    // (see history-backfill.ts), never through sync-pull-request.ts, so nothing
    // else recomputes detections for the pull requests it hydrates. Recompute
    // once, here, the slice that observes the run reach a terminal state —
    // not per hydrated pull request. Non-fatal: detection lagging is acceptable,
    // failing the backfill lifecycle over it is not.
    await step.run('recompute-ai-involvement-on-history-completion', async () => {
      const run = await getHistoryBackfill(backfillId);
      if (!run || !historyBackfillTerminalStatuses.has(run.status)) return;
      try {
        await recomputeExecutedDetections(repositoryId);
      } catch (error) {
        console.error('AI involvement recompute failed after history backfill', {
          repositoryId,
          error,
        });
      }
    });
    await step.run('dispatch-next-history-slice', () => dispatchHistoryBackfill(backfillId));
  },
);

export const reconcileHistoryBackfills = inngest.createFunction(
  { id: 'reconcile-history-backfills', triggers: [{ cron: '* * * * *' }] },
  async ({ step }) => {
    if (process.env.DEMO_MODE === 'true') return { demo: true };
    const repositories = await step.run('find-missing-history', repositoriesMissingHistory);
    for (const repositoryId of repositories) {
      await step.run(`ensure-${repositoryId}`, async () => {
        try {
          await ensureHistoryBackfill(repositoryId);
        } catch {
          console.error('History backfill creation deferred', { repositoryId });
        }
      });
    }
    const ids = await step.run('find-history-recovery', listHistoryRecovery);
    for (const backfillId of ids) {
      await step.run(`dispatch-${backfillId}`, async () => {
        try {
          await dispatchHistoryBackfill(backfillId);
        } catch {
          console.error('History dispatch deferred', { backfillId });
        }
      });
    }
    return { count: ids.length };
  },
);
