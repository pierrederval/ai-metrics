import { z } from 'zod';
import { githubApp } from './app';
import type { GrantedPermissions } from '../domain/act/availability';

const granted = z.object({
  permissions: z
    .object({ contents: z.string().optional(), pull_requests: z.string().optional() })
    .optional(),
});

// A payload we cannot read grants nothing. Failing closed is the only safe
// default for a permission check.
export function parseGrantedPermissions(payload: unknown): GrantedPermissions {
  const parsed = granted.safeParse(payload);
  if (!parsed.success) return { contents: null, pullRequests: null };
  return {
    contents: parsed.data.permissions?.contents ?? null,
    pullRequests: parsed.data.permissions?.pull_requests ?? null,
  };
}

export async function fetchGrantedPermissions(installationId: string): Promise<GrantedPermissions> {
  try {
    const response = await githubApp().octokit.request(
      'GET /app/installations/{installation_id}',
      { installation_id: Number(installationId) },
    );
    return parseGrantedPermissions(response.data);
  } catch {
    // Never let provider exceptions (request headers or source) escape.
    throw new Error('Installation permissions unavailable');
  }
}
