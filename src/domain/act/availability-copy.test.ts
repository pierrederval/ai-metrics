import { describe, expect, it } from 'vitest';
import { availabilityMessage } from './availability-copy';

describe('availabilityMessage', () => {
  it('says nothing when Act is available, because the button says it instead', () => {
    expect(availabilityMessage({ available: true })).toBeNull();
  });

  it('names the missing write access without blaming the reader', () => {
    expect(availabilityMessage({ available: false, reason: 'write_not_granted' })).toBe(
      'fieldnote needs write access to contents and pull requests before it can open a pull request. Accept the updated permissions on the GitHub App installation.',
    );
  });

  it('explains the opt-in', () => {
    expect(availabilityMessage({ available: false, reason: 'not_enabled' })).toBe(
      'Opening pull requests is off for this repository. Turn it on in Settings.',
    );
  });

  it('says there is nothing to fix', () => {
    expect(availabilityMessage({ available: false, reason: 'nothing_to_fix' })).toBe(
      'Every readiness check passes. There is nothing for fieldnote to fix.',
    );
  });
});
