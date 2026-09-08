'use server';
import { requestGrade } from '../../../../db/queries/grade-runs';
import { dispatchGrade } from '../../../../inngest/dispatch-grade';
export async function runGrade(repositoryId: string): Promise<{ runId: string }> {
  // requestGrade checks current workspace membership, repository connection and demo mode.
  const run = await requestGrade(repositoryId);
  try {
    await dispatchGrade(run.id);
  } catch {
    // Durable queued run is recovered by reconciliation; retain its polling identity.
  }
  return { runId: run.id };
}
