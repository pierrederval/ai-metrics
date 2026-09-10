import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { gradeRuns } from '../db/schema';
import { inngest } from './client';
export type SendGradeEvent = (event: {
  id: string;
  name: 'repository/grade.requested';
  data: { runId: string };
}) => Promise<unknown>;
export async function dispatchGrade(
  runId: string,
  send: SendGradeEvent = (event) => inngest.send(event),
): Promise<void> {
  const [run] = await db()
    .select({ id: gradeRuns.id })
    .from(gradeRuns)
    .where(
      and(eq(gradeRuns.id, runId), eq(gradeRuns.state, 'queued'), isNull(gradeRuns.dispatchedAt)),
    );
  if (!run) return;
  await send({ id: runId, name: 'repository/grade.requested', data: { runId } });
  await db()
    .update(gradeRuns)
    .set({ dispatchedAt: new Date() })
    .where(
      and(eq(gradeRuns.id, runId), eq(gradeRuns.state, 'queued'), isNull(gradeRuns.dispatchedAt)),
    );
}
