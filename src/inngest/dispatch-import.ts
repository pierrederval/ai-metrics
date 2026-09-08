import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { repositoryImports } from '../db/schema';
import { markImportDispatched } from '../db/queries/repository-imports';
import { inngest } from './client';
export type SendImportEvent = (event: {
  id: string;
  name: 'github/repository.sync.requested';
  data: { repositoryId: string; runId: string };
}) => Promise<unknown>;
export async function dispatchImport(
  runId: string,
  send: SendImportEvent = (event) => inngest.send(event),
): Promise<void> {
  const [run] = await db()
    .select()
    .from(repositoryImports)
    .where(
      and(
        eq(repositoryImports.id, runId),
        eq(repositoryImports.state, 'queued'),
        isNull(repositoryImports.dispatchedAt),
      ),
    );
  if (!run) return;
  // The stable event identity deduplicates concurrent sends and acknowledgement gaps.
  await send({
    id: run.id,
    name: 'github/repository.sync.requested',
    data: { repositoryId: run.repositoryId, runId: run.id },
  });
  await markImportDispatched(run.id);
}
