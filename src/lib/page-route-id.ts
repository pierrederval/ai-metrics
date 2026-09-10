import { notFound } from 'next/navigation';

// Next 16.3 Page params retain escaped segment values (including %3A).
// Route Handlers already decode their params; do not apply this helper there.
export function pageRouteId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    notFound();
  }
}
