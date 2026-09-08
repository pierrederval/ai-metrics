import { inngest } from '../client';
import { repositorySyncData } from '../events';
import { latestPullRequests } from '../../github/sync-repository';
import { assertTrackedRepository } from '../../github/repositories';
import { syncPullRequestFunction } from './sync-pull-request';
import {
  getImport,
  beginImport,
  saveImportBatch,
  recordImportItem,
  finishImport,
  failImport,
} from '../../db/queries/repository-imports';
import { isActiveImport } from '../../domain/import/progress';
export const syncRepositoryFunction = inngest.createFunction(
  {
    id: 'sync-repository',
    triggers: [{ event: 'github/repository.sync.requested' }],
    retries: 5,
    singleton: { key: 'event.data.runId', mode: 'skip' },
    onFailure: async ({ event, error }) => {
      const { repositoryId, runId } = repositorySyncData.parse(event.data.event.data);
      console.error('Repository import failed', { repositoryId, runId, error });
      const current = await getImport(runId);
      if (current?.snapshot.repositoryId !== repositoryId) return;
      await failImport(runId, 'We couldn’t finish the import. Please retry.');
    },
  },
  async ({ event, step }) => {
    const { repositoryId, runId } = repositorySyncData.parse(event.data);
    const run = await step.run('begin', async () => {
      const current = await getImport(runId);
      if (!current || current.snapshot.repositoryId !== repositoryId)
        throw new Error('Import unavailable');
      if (!isActiveImport(current.snapshot.state)) return current;
      await assertTrackedRepository(repositoryId);
      return beginImport(runId);
    });
    if (!isActiveImport(run.snapshot.state)) return run.snapshot;
    const batch =
      run.snapshot.total === null
        ? await step.run('discover', async () => {
            // A previous attempt may have committed discovery before step acknowledgement.
            const current = await getImport(runId);
            if (!current || current.snapshot.repositoryId !== repositoryId)
              throw new Error('Import unavailable');
            if (current.snapshot.total !== null || !isActiveImport(current.snapshot.state))
              return current;
            return saveImportBatch(runId, await latestPullRequests(repositoryId));
          })
        : run;
    if (!isActiveImport(batch.snapshot.state)) return batch.snapshot;
    for (const item of batch.items) {
      if (item.state !== 'pending') continue;
      let outcome: 'complete' | 'failed' = 'complete';
      try {
        await step.invoke(`pr-${item.number}`, {
          function: syncPullRequestFunction,
          data: { repositoryId, number: item.number },
        });
      } catch {
        outcome = 'failed';
      }
      await step.run(`record-${item.number}`, () => recordImportItem(runId, item.number, outcome));
    }
    return step.run('finish', () => finishImport(runId));
  },
);
