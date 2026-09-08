import { inngest } from '../client';
import { historySyncData } from '../events';
import {
  ensureHistoryBackfill,
  listHistoryRecovery,
  processHistorySlice,
  repositoriesMissingHistory,
} from '../../db/queries/history-backfill';
import { dispatchHistoryBackfill } from '../dispatch-history';

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
