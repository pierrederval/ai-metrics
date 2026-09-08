import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { expect, test } from 'vitest';

test('migration tracks existing real PR repositories only', async () => {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const schema = `migration_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.begin(async (tx) => {
      await tx.unsafe(`CREATE SCHEMA "${schema}"`);
      await tx.unsafe(`SET LOCAL search_path TO "${schema}"`);
      const initial = (await readFile('drizzle/0000_faulty_loners.sql', 'utf8')).replaceAll(
        '"public".',
        `"${schema}".`,
      );
      await tx.unsafe(initial);
      await tx`INSERT INTO github_installations (id, github_installation_id, account_login, account_type) VALUES ('install', 'install', 'test', 'User')`;
      for (const [id, demo] of [
        ['with-pr', false],
        ['without-pr', false],
        ['demo', true],
      ] as const) {
        await tx`INSERT INTO repositories (id, installation_id, github_repository_id, owner, name, default_branch, is_private, is_demo) VALUES (${id}, 'install', ${id}, 'test', 'repo', 'main', true, ${demo})`;
      }
      for (const id of ['with-pr', 'demo']) {
        await tx`INSERT INTO pull_requests (id, repository_id, github_pr_id, github_pr_number, title, state, author_login, head_sha, base_sha, opened_at, facts, source_updated_at) VALUES (${id}, ${id}, ${id}, 1, 'test', 'open', 'test', 'head', 'base', now(), '{}', now())`;
      }
      const migration = (await readFile('drizzle/0001_high_hellcat.sql', 'utf8')).replaceAll(
        '"public".',
        `"${schema}".`,
      );
      await tx.unsafe(migration);
      const rows =
        await tx`SELECT id, tracking_started_at, created_at FROM repositories ORDER BY id`;
      expect(rows.map((row) => [row.id, row.tracking_started_at])).toEqual([
        ['demo', null],
        ['with-pr', rows[1].created_at],
        ['without-pr', null],
      ]);
      await tx.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  } finally {
    await client.end();
  }
});
