'use client';
import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import { useRef, type KeyboardEvent } from 'react';
import {
  focusIndex,
  isActive,
  tabHref,
  tabs,
  TAB_PANEL_ID,
  type RepositoryTabSegment,
} from './tabs';
import './tab-bar.css';

// The client component in the repository header that reads which segment is
// selected. Selection is route state, not client state.
export function TabBar({
  repoId,
  score,
  agentCount,
}: {
  repoId: string;
  score?: number | null;
  agentCount?: number | null;
}) {
  const segment = useSelectedLayoutSegment();
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  // Keyed on the segment union, so a mistyped key is a type error.
  const counts: Partial<Record<Exclude<RepositoryTabSegment, null>, number | null>> = {
    grading: score,
    'ai-involvement': agentCount,
  };
  const stop = focusIndex(segment);
  function move(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
    // role="tab" promises Space activates, and an anchor would only scroll.
    if (event.key === ' ') {
      event.preventDefault();
      event.currentTarget.click();
      return;
    }
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    links.current[target]?.focus();
  }
  return (
    <div className="tabs" role="tablist" aria-label="Repository views">
      {tabs.map((tab, index) => {
        const count = tab.segment ? counts[tab.segment] : null;
        return (
          <Link
            key={tab.label}
            className="tab"
            role="tab"
            aria-selected={isActive(tab, segment)}
            aria-controls={TAB_PANEL_ID}
            // Roving tabindex: one stop for the whole bar, arrows move within it.
            tabIndex={index === stop ? 0 : -1}
            href={tabHref(repoId, tab)}
            ref={(node) => {
              links.current[index] = node;
            }}
            onKeyDown={(event) => move(event, index)}
          >
            {tab.label}
            {count === null || count === undefined ? null : <span className="count">{count}</span>}
          </Link>
        );
      })}
    </div>
  );
}
