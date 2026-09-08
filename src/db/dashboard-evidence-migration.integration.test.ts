import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { expect, test } from 'vitest';

test('migration preserves attempt identities and durable evidence checkpoints', async () => {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const schema = `evidence_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.begin(async (tx) => {
      await tx.unsafe(`CREATE SCHEMA "${schema}"`);
      await tx.unsafe(`SET LOCAL search_path TO "${schema}"`);
      for (const file of [
        'drizzle/0000_faulty_loners.sql',
        'drizzle/0001_high_hellcat.sql',
        'drizzle/0002_dashboard_evidence.sql',
      ]) {
        const migration = (await readFile(file, 'utf8')).replaceAll('"public".', `"${schema}".`);
        await tx.unsafe(migration);
      }

      await tx`INSERT INTO github_installations (id, github_installation_id, account_login, account_type) VALUES ('install', 'install', 'test', 'Organization')`;
      await tx`INSERT INTO repositories (id, installation_id, github_repository_id, owner, name, default_branch, is_private) VALUES ('repo', 'install', 'repo', 'test', 'repo', 'main', true)`;
      await tx`INSERT INTO users (id, login, credentials) VALUES ('user', 'test', 'encrypted')`;
      await tx`INSERT INTO pull_requests (id, repository_id, github_pr_id, github_pr_number, title, state, author_login, head_sha, base_sha, opened_at, facts, source_updated_at) VALUES ('pr', 'repo', 'pr', 1, 'test', 'closed', 'test', 'head', 'base', '2026-01-01T00:00:00Z', '{}', '2026-01-02T00:00:00Z')`;

      await tx`INSERT INTO dashboard_pr_evidence (pull_request_id, merge_head_sha, chronology_complete, reviews_complete, ci_complete, provenance, source_updated_at, collected_at) VALUES ('pr', 'merge-head', true, true, false, '{"reviews":["github-api"]}', '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z')`;
      const [evidence] =
        await tx`SELECT merge_head_sha, chronology_complete, reviews_complete, ci_complete, provenance, source_updated_at, collected_at FROM dashboard_pr_evidence WHERE pull_request_id = 'pr'`;
      expect({
        ...evidence,
        source_updated_at: evidence.source_updated_at.toISOString(),
        collected_at: evidence.collected_at.toISOString(),
      }).toEqual({
        merge_head_sha: 'merge-head',
        chronology_complete: true,
        reviews_complete: true,
        ci_complete: false,
        provenance: { reviews: ['github-api'] },
        source_updated_at: '2026-01-02T00:00:00.000Z',
        collected_at: '2026-01-03T00:00:00.000Z',
      });

      await tx`INSERT INTO workflow_attempts (repository_id, run_id, attempt, head_sha, status, conclusion, completed_at, source_updated_at) VALUES ('repo', 'run', 1, 'head', 'completed', 'failure', '2026-01-02T10:00:00Z', '2026-01-02T11:00:00Z'), ('repo', 'run', 2, 'head', 'completed', 'success', '2026-01-02T12:00:00Z', '2026-01-02T13:00:00Z')`;
      const duplicateAttempt =
        await tx`INSERT INTO workflow_attempts (repository_id, run_id, attempt, head_sha, status) VALUES ('repo', 'run', 1, 'other', 'queued') ON CONFLICT DO NOTHING RETURNING attempt`;
      expect(duplicateAttempt).toHaveLength(0);
      const attempts =
        await tx`SELECT attempt, conclusion, completed_at, source_updated_at FROM workflow_attempts ORDER BY attempt`;
      expect(
        attempts.map((attempt) => ({
          ...attempt,
          completed_at: attempt.completed_at.toISOString(),
          source_updated_at: attempt.source_updated_at.toISOString(),
        })),
      ).toEqual([
        {
          attempt: 1,
          conclusion: 'failure',
          completed_at: '2026-01-02T10:00:00.000Z',
          source_updated_at: '2026-01-02T11:00:00.000Z',
        },
        {
          attempt: 2,
          conclusion: 'success',
          completed_at: '2026-01-02T12:00:00.000Z',
          source_updated_at: '2026-01-02T13:00:00.000Z',
        },
      ]);

      await tx`INSERT INTO review_events (id, pull_request_id, source_id, reviewer_id, state, occurred_at, kind, source) VALUES ('review-1', 'pr', 'source-review', 'reviewer', 'approved', '2026-01-02T00:00:00Z', 'review', 'github-api')`;
      const duplicateReview =
        await tx`INSERT INTO review_events (id, pull_request_id, source_id, reviewer_id, state, occurred_at, kind, source) VALUES ('review-2', 'pr', 'source-review', 'reviewer', 'approved', '2026-01-02T00:00:00Z', 'review', 'github-api') ON CONFLICT DO NOTHING RETURNING id`;
      expect(duplicateReview).toHaveLength(0);

      await tx`INSERT INTO user_interests (user_id, feature) VALUES ('user', 'expanded-history')`;
      const duplicateInterest =
        await tx`INSERT INTO user_interests (user_id, feature) VALUES ('user', 'expanded-history') ON CONFLICT DO NOTHING RETURNING feature`;
      expect(duplicateInterest).toHaveLength(0);

      await tx`INSERT INTO history_backfills (id, repository_id, cutoff, cursor, status, retry_at, error_category) VALUES ('backfill', 'repo', '2025-01-01T00:00:00Z', 'page:7', 'retrying', '2026-01-04T00:00:00Z', 'rate-limit')`;
      await tx`INSERT INTO history_backfill_items (backfill_id, number, status, retry_at, error_category, source_updated_at) VALUES ('backfill', 42, 'retrying', '2026-01-04T00:00:00Z', 'rate-limit', '2026-01-02T00:00:00Z')`;
      const [checkpoint] = await tx`
        SELECT b.cutoff, b.cursor, b.status, b.retry_at, b.error_category,
          i.number, i.status AS item_status, i.retry_at AS item_retry_at,
          i.error_category AS item_error_category
        FROM history_backfills b
        JOIN history_backfill_items i ON i.backfill_id = b.id
        WHERE b.id = 'backfill'
      `;
      expect({
        ...checkpoint,
        cutoff: checkpoint.cutoff.toISOString(),
        retry_at: checkpoint.retry_at.toISOString(),
        item_retry_at: checkpoint.item_retry_at.toISOString(),
      }).toEqual({
        cutoff: '2025-01-01T00:00:00.000Z',
        cursor: 'page:7',
        status: 'retrying',
        retry_at: '2026-01-04T00:00:00.000Z',
        error_category: 'rate-limit',
        number: 42,
        item_status: 'retrying',
        item_retry_at: '2026-01-04T00:00:00.000Z',
        item_error_category: 'rate-limit',
      });

      await tx.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  } finally {
    await client.end();
  }
});
