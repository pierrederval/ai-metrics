import type { ActAvailability } from './availability';

// Copy lives in the domain so it is unit-tested rather than eyeballed in a
// component, the way check titles and finish names already are.
export function availabilityMessage(availability: ActAvailability): string | null {
  if (availability.available) return null;
  switch (availability.reason) {
    case 'not_enabled':
      return 'Opening pull requests is off for this repository. Turn it on in Settings.';
    case 'write_not_granted':
      return 'fieldnote needs write access to contents and pull requests before it can open a pull request. Accept the updated permissions on the GitHub App installation.';
    case 'nothing_to_fix':
      return 'Every readiness check passes. There is nothing for fieldnote to fix.';
  }
}
