import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../index';
import {
  authoringRemedies,
  authoringRuns as runs,
  installations,
  repositories,
  workspaceRepositories,
  workspaceMemberships,
} from '../schema';
import { requireRepository, requireWorkspace } from '../../workspaces/access';
import { currentUser } from '../../auth/session';
import { actAvailability, nothingGranted } from '../../domain/act/availability';
import { floorAuthorVersion } from '../../domain/act/remedies';
import { actEnabled } from './act-settings';
import { fetchGrantedPermissions } from '../../github/installation-permissions';
import { latestGrade } from './grade-runs';

export type AuthoringRun = typeof runs.$inferSelect;
export type Remedy = typeof authoringRemedies.$inferSelect;

export async function requestPlan(
  repositoryId: string,
): Promise<{ id: string; state: AuthoringRun['state'] }> {
  const repository = await requireRepository(repositoryId);
  const workspace = await requireWorkspace();
  if (workspace.id === 'demo' || repository.isDemo) throw new Error('Demo workspace is read-only');
  const user = await currentUser();

  // Availability is decided before the transaction: fetchGrantedPermissions is
  // a network round-trip and must not be held inside one. It throws rather
  // than returning a safe default, and we let it — a permission check that
  // cannot complete must not quietly read as "unavailable".
  const [enabled, grade] = await Promise.all([actEnabled(repositoryId), latestGrade(repositoryId)]);
  const permissions = enabled ? await fetchGrantedPermissions(repositoryId) : nothingGranted;
  const availability = actAvailability({
    enabled,
    permissions,
    failingCheckCount: grade?.checks.filter((check) => check.status === 'fail').length ?? 0,
  });
  if (!availability.available) throw new Error('Act unavailable');

  return db().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${repositoryId + ':authoring'},0))`,
    );
    // Match workspace mutations' lock and recheck membership/link after initial authorization.
    await tx.execute(sql`select id from workspaces where id = ${workspace.id} for update`);
    const [available] = await tx
      .select({ id: repositories.id })
      .from(repositories)
      .innerJoin(installations, eq(installations.id, repositories.installationId))
      .innerJoin(
        workspaceRepositories,
        and(
          eq(workspaceRepositories.repositoryId, repositories.id),
          eq(workspaceRepositories.workspaceId, workspace.id),
        ),
      )
      .innerJoin(
        workspaceMemberships,
        and(
          eq(workspaceMemberships.workspaceId, workspace.id),
          eq(workspaceMemberships.userId, user.id),
        ),
      )
      .where(
        and(
          eq(repositories.id, repositoryId),
          eq(repositories.active, true),
          eq(repositories.isDemo, false),
          eq(repositories.actEnabled, true),
          eq(installations.active, true),
        ),
      );
    if (!available) throw new Error('Repository unavailable');
    const [latest] = await tx
      .select()
      .from(runs)
      .where(and(eq(runs.repositoryId, repositoryId), eq(runs.kind, 'plan')))
      .orderBy(desc(runs.createdAt), desc(runs.id))
      .limit(1);
    const [inserted] = await tx
      .insert(runs)
      .values({
        id: randomUUID(),
        repositoryId,
        kind: 'plan',
        requestedBy: user.id,
        requestedWorkspaceId: workspace.id,
        retryOf: latest?.state === 'failed' ? latest.id : null,
        state: 'queued',
        authorVersion: floorAuthorVersion,
      })
      .onConflictDoNothing()
      .returning();
    const active =
      inserted ??
      (
        await tx
          .select()
          .from(runs)
          .where(
            and(
              eq(runs.repositoryId, repositoryId),
              inArray(runs.state, ['queued', 'running']),
            ),
          )
      )[0];
    if (!active) throw new Error('Plan request unavailable');
    return { id: active.id, state: active.state };
  });
}
