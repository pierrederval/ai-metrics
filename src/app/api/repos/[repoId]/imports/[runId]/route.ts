import { unstable_rethrow } from 'next/navigation';
import { hasCurrentSession } from '../../../../../../auth/session';
import { requireRepository } from '../../../../../../workspaces/access';
import { getImport } from '../../../../../../db/queries/repository-imports';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(
  _request: Request,
  context: { params: Promise<{ repoId: string; runId: string }> },
) {
  try {
    if (!(await hasCurrentSession()))
      return Response.json({ error: 'Sign in again.' }, { status: 401, headers });
    const { repoId, runId } = await context.params;
    await requireRepository(repoId);
    const run = await getImport(runId);
    if (!run || run.snapshot.repositoryId !== repoId)
      return Response.json({ error: 'Import unavailable.' }, { status: 404, headers });
    return Response.json(run.snapshot, { headers });
  } catch (error) {
    unstable_rethrow(error);
    return Response.json(
      { error: 'Import status is temporarily unavailable. Try again.' },
      { status: 503, headers },
    );
  }
}
