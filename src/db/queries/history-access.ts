import { sql } from 'drizzle-orm';
import { db } from '..';

const FREE_HISTORY_LIMIT = 100;

export async function visiblePrIds(repositoryIds: string[]): Promise<string[]> {
  if (repositoryIds.length === 0) return [];

  const rows = await db().execute<{ id: string }>(sql`
    WITH ranked AS (
      SELECT id, repository_id,
        row_number() OVER (
          PARTITION BY repository_id
          ORDER BY opened_at DESC, id DESC
        ) AS rank
      FROM pull_requests
      WHERE repository_id = ANY(
        ARRAY[${sql.join(
          repositoryIds.map((repositoryId) => sql`${repositoryId}`),
          sql`, `,
        )}]::text[]
      )
    )
    SELECT id
    FROM ranked
    WHERE rank <= ${FREE_HISTORY_LIMIT}
  `);

  return rows.map(({ id }) => id);
}
