import { beforeEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({
  repositoryInstallation: vi.fn(),
  request: vi.fn(),
}));
vi.mock('./repositories', () => ({ repositoryInstallation: deps.repositoryInstallation }));
vi.mock('./app', () => ({ githubApp: () => ({ octokit: { request: deps.request } }) }));

import { parseGrantedPermissions, fetchGrantedPermissions } from './installation-permissions';

describe('parseGrantedPermissions', () => {
  it('reads the two permissions Act needs', () => {
    expect(
      parseGrantedPermissions({
        permissions: { contents: 'write', pull_requests: 'write', checks: 'read' },
      }),
    ).toEqual({ contents: 'write', pullRequests: 'write' });
  });

  it('reports an absent permission as null rather than guessing', () => {
    expect(parseGrantedPermissions({ permissions: { checks: 'read' } })).toEqual({
      contents: null,
      pullRequests: null,
    });
  });

  it('treats a malformed payload as granting nothing', () => {
    expect(parseGrantedPermissions({})).toEqual({ contents: null, pullRequests: null });
    expect(parseGrantedPermissions(null)).toEqual({ contents: null, pullRequests: null });
    expect(parseGrantedPermissions({ permissions: 'write' })).toEqual({
      contents: null,
      pullRequests: null,
    });
  });

  it('grants nothing for a suspended installation, even though GitHub still reports its permissions', () => {
    expect(
      parseGrantedPermissions({
        permissions: { contents: 'write', pull_requests: 'write' },
        suspended_at: '2026-09-01T00:00:00Z',
      }),
    ).toEqual({ contents: null, pullRequests: null });
  });

  it('treats a null suspended_at as active', () => {
    expect(
      parseGrantedPermissions({
        permissions: { contents: 'write', pull_requests: 'write' },
        suspended_at: null,
      }),
    ).toEqual({ contents: 'write', pullRequests: 'write' });
  });
});

describe('fetchGrantedPermissions', () => {
  beforeEach(() => vi.resetAllMocks());

  it('resolves the repository id to the numeric GitHub installation id before calling GitHub', async () => {
    // Regression for the Critical defect: the identifier handed to the
    // GitHub layer must be the numeric id resolved from the repository ->
    // installation join, never the repository row id itself.
    deps.repositoryInstallation.mockResolvedValue({ githubInstallationId: '555' });
    deps.request.mockResolvedValue({
      data: { permissions: { contents: 'write', pull_requests: 'write' } },
    });
    const result = await fetchGrantedPermissions('repository:99');
    expect(deps.repositoryInstallation).toHaveBeenCalledWith('repository:99');
    expect(deps.request).toHaveBeenCalledWith('GET /app/installations/{installation_id}', {
      installation_id: 555,
    });
    expect(result).toEqual({ contents: 'write', pullRequests: 'write' });
  });

  it('fails closed with a generic error when the repository or its installation cannot be resolved', async () => {
    deps.repositoryInstallation.mockResolvedValue(null);
    await expect(fetchGrantedPermissions('repository:missing')).rejects.toThrow(
      'Installation permissions unavailable',
    );
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('fails closed with a generic error and never leaks the provider error', async () => {
    deps.repositoryInstallation.mockResolvedValue({ githubInstallationId: '555' });
    deps.request.mockRejectedValue(new Error('secret header: token abc123'));
    await expect(fetchGrantedPermissions('repository:99')).rejects.toThrow(
      new Error('Installation permissions unavailable'),
    );
  });
});
