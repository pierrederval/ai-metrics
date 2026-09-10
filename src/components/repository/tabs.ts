// Pure routing description for the repository tab bar. No JSX, no client
// runtime: selection is expressed by route, so the routing logic is testable
// without rendering a component or pulling next/link into the test graph.
export type RepositoryTabSegment = null | 'grading' | 'ai-involvement' | 'delivery' | 'settings';

export interface RepositoryTab {
  /** The route segment one level below the repository layout; null is the landing view. */
  segment: RepositoryTabSegment;
  label: string;
}

export const tabs: RepositoryTab[] = [
  { segment: null, label: 'Agents' },
  { segment: 'grading', label: 'Readiness' },
  { segment: 'ai-involvement', label: 'Involvement' },
  { segment: 'delivery', label: 'Delivery' },
  { segment: 'settings', label: 'Settings' },
];

/** `segment` is what useSelectedLayoutSegment() returns for the repository layout. */
export function isActive(tab: RepositoryTab, segment: string | null): boolean {
  return tab.segment === segment;
}

export function tabHref(repoId: string, tab: RepositoryTab): string {
  const base = `/repos/${encodeURIComponent(repoId)}`;
  return tab.segment ? `${base}/${tab.segment}` : base;
}
