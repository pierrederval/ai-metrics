import { z } from 'zod';
import type { CiCheck, ChangedFile } from '../domain/pull-request/types';
export const conclusionSchema = z.enum([
  'success',
  'failure',
  'neutral',
  'cancelled',
  'skipped',
  'timed_out',
  'action_required',
  'startup_failure',
  'stale',
]);
const checkSchema = z.object({
  id: z.number(),
  name: z.string(),
  head_sha: z.string(),
  status: z.enum(['queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending']),
  conclusion: conclusionSchema.nullable(),
  app: z.object({ id: z.number() }).nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string().optional(),
});
export function normalizeCheck(input: unknown, execution = 1): CiCheck {
  const c = checkSchema.parse(input);
  return {
    id: String(c.id),
    sha: c.head_sha,
    appId: c.app ? String(c.app.id) : 'unknown',
    name: c.name,
    execution,
    status:
      c.status === 'completed'
        ? 'completed'
        : c.status === 'in_progress'
          ? 'in_progress'
          : 'queued',
    conclusion: c.conclusion,
    queuedAt: c.created_at ?? c.started_at,
    startedAt: c.started_at,
    completedAt: c.completed_at,
  };
}
const fileSchema = z.object({
  filename: z.string(),
  previous_filename: z.string().optional(),
  status: z.enum(['added', 'modified', 'removed', 'renamed', 'changed', 'copied', 'unchanged']),
  additions: z.number(),
  deletions: z.number(),
});
export function normalizeFile(input: unknown): ChangedFile {
  const f = fileSchema.parse(input);
  return {
    path: f.filename,
    ...(f.previous_filename ? { previousPath: f.previous_filename } : {}),
    changeType:
      f.status === 'copied'
        ? 'added'
        : ['changed', 'unchanged'].includes(f.status)
          ? 'modified'
          : (f.status as ChangedFile['changeType']),
    additions: f.additions,
    deletions: f.deletions,
  };
}
export const prSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  user: z.object({ login: z.string() }).nullable(),
  head: z.object({ sha: z.string(), ref: z.string().nullish() }),
  base: z.object({ sha: z.string() }),
  created_at: z.string(),
  updated_at: z.string(),
  merged_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  changed_files: z.number().optional(),
  commits: z.number().optional(),
  body: z.string().nullish(),
});
export function errorStatus(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number(error.status)
    : null;
}
