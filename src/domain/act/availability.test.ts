import { describe, expect, it } from 'vitest';
import { actAvailability, nothingGranted, type GrantedPermissions } from './availability';

const write: GrantedPermissions = { contents: 'write', pullRequests: 'write' };
const read: GrantedPermissions = { contents: 'read', pullRequests: 'read' };

describe('actAvailability', () => {
  it('is available when opted in, granted write, and something fails', () => {
    expect(actAvailability({ enabled: true, permissions: write, failingCheckCount: 2 })).toEqual({
      available: true,
    });
  });

  it('reports opt-in before anything else, so a repository nobody asked for never demands write access', () => {
    expect(actAvailability({ enabled: false, permissions: read, failingCheckCount: 2 })).toEqual({
      available: false,
      reason: 'not_enabled',
    });
  });

  it('requires write on both contents and pull requests', () => {
    expect(
      actAvailability({
        enabled: true,
        permissions: { contents: 'write', pullRequests: 'read' },
        failingCheckCount: 1,
      }),
    ).toEqual({ available: false, reason: 'write_not_granted' });
    expect(
      actAvailability({
        enabled: true,
        permissions: { contents: 'read', pullRequests: 'write' },
        failingCheckCount: 1,
      }),
    ).toEqual({ available: false, reason: 'write_not_granted' });
  });

  it('accepts admin as write, which is what GitHub grants on some permissions', () => {
    expect(
      actAvailability({
        enabled: true,
        permissions: { contents: 'admin', pullRequests: 'admin' },
        failingCheckCount: 1,
      }),
    ).toEqual({ available: true });
  });

  it('treats an ungranted permission as not granted', () => {
    expect(
      actAvailability({
        enabled: true,
        permissions: { contents: null, pullRequests: null },
        failingCheckCount: 1,
      }),
    ).toEqual({ available: false, reason: 'write_not_granted' });
  });

  it('has nothing to do when no check fails', () => {
    expect(actAvailability({ enabled: true, permissions: write, failingCheckCount: 0 })).toEqual({
      available: false,
      reason: 'nothing_to_fix',
    });
  });

  it('treats the shared fail-closed value as write_not_granted', () => {
    expect(
      actAvailability({ enabled: true, permissions: nothingGranted, failingCheckCount: 1 }),
    ).toEqual({ available: false, reason: 'write_not_granted' });
  });
});
