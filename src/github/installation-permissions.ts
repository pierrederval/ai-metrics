import { z } from 'zod';
import { githubApp } from './app';
import { repositoryInstallation } from './repositories';
import { nothingGranted, type GrantedPermissions } from '../domain/act/availability';

const granted = z.object({
  permissions: z
    .object({ contents: z.string().optional(), pull_requests: z.string().optional() })
    .optional(),
  suspended_at: z.string().nullish(),
});

// A payload we cannot read grants nothing. Failing closed is the only safe
// default for a permission check. A suspended installation is reported by
// GitHub with its last-known permissions still attached, but a suspended
// installation can do nothing, so it grants nothing here too.
export function parseGrantedPermissions(payload: unknown): GrantedPermissions {
  const parsed = granted.safeParse(payload);
  if (!parsed.success) return nothingGranted;
  if (parsed.data.suspended_at) return nothingGranted;
  return {
    contents: parsed.data.permissions?.contents ?? null,
    pullRequests: parsed.data.permissions?.pull_requests ?? null,
  };
}

// Takes a repository row id and resolves the GitHub installation id itself,
// so the caller never has a chance to hand this the wrong identifier (the
// internal `installation:${githubId}` row id, or the demo's literal
// 'demo-installation'). Any failure — repository or installation not found,
// or the GitHub request itself failing — fails closed with a generic
// message; provider exceptions never escape.
export async function fetchGrantedPermissions(repositoryId: string): Promise<GrantedPermissions> {
  try {
    const installation = await repositoryInstallation(repositoryId);
    if (!installation) throw new Error('Installation not found');
    const response = await githubApp().octokit.request('GET /app/installations/{installation_id}', {
      installation_id: Number(installation.githubInstallationId),
    });
    return parseGrantedPermissions(response.data);
  } catch {
    // Never let provider exceptions (request headers or source) escape.
    throw new Error('Installation permissions unavailable');
  }
}
