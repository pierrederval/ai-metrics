import { describe, expect, it } from 'vitest';
import { parseGrantedPermissions } from './installation-permissions';

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
});
