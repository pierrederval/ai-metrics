'use client';
import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import { useRef, type KeyboardEvent } from 'react';
import { isActive, tabHref, tabs } from './tabs';
import './tab-bar.css';

// The only client component in the repository header: it exists solely to read
// which segment is selected. Selection is route state, not client state.
export function TabBar({
  repoId,
  score,
  agentCount,
}: {
  repoId: string;
  score: number | null;
  agentCount: number | null;
}) {
  const segment = useSelectedLayoutSegment();
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const counts: Partial<Record<string, number | null>> = {
    grading: score,
    'ai-involvement': agentCount,
  };
  function move(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
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
        const active = isActive(tab, segment);
        const count = tab.segment ? counts[tab.segment] : null;
        return (
          <Link
            key={tab.label}
            className="tab"
            role="tab"
            aria-selected={active}
            // Roving tabindex: one stop for the whole bar, arrows move within it.
            tabIndex={active ? 0 : -1}
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
