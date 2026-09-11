// Act may run only when an admin asked for it, GitHub actually granted the
// write scopes, and the grade found something to fix. Order matters: a
// repository nobody opted into must never be reported as needing write
// access, because that reads as fieldnote demanding permissions it was not
// invited to use.
export type GrantedPermissions = { contents: string | null; pullRequests: string | null };

// The single fail-closed value: nothing granted. Every caller that cannot
// prove otherwise (a payload that fails to parse, a suspended installation,
// a repository that cannot be resolved, a provider error) returns this
// exact value rather than each defining its own copy.
export const nothingGranted: GrantedPermissions = { contents: null, pullRequests: null };

export type ActAvailability =
  | { available: true }
  | { available: false; reason: 'not_enabled' | 'write_not_granted' | 'nothing_to_fix' };

const writes = (permission: string | null) => permission === 'write' || permission === 'admin';

export function actAvailability(input: {
  enabled: boolean;
  permissions: GrantedPermissions;
  failingCheckCount: number;
}): ActAvailability {
  if (!input.enabled) return { available: false, reason: 'not_enabled' };
  if (!writes(input.permissions.contents) || !writes(input.permissions.pullRequests))
    return { available: false, reason: 'write_not_granted' };
  if (input.failingCheckCount < 1) return { available: false, reason: 'nothing_to_fix' };
  return { available: true };
}
