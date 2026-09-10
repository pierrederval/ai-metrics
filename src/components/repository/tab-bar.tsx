'use client';
import Link from 'next/link';
import { useSearchParams, useSelectedLayoutSegment } from 'next/navigation';
import { useRef, type KeyboardEvent } from 'react';
import { focusIndex, isActive, tabHref, tabs, TAB_PANEL_ID } from './tabs';
import './tab-bar.css';

// The client component in the repository header that reads which segment is
// selected. Selection is route state, not client state.
//
// The query string is read here rather than in the layout: layouts do not
// rerender on navigation and cannot see search params, but this is a client
// component below one, so useSearchParams() gives it the live query. Every tab
// therefore keeps the date range the reader arrived with — the range enters the
// repository from /repos and the body links between views already preserve it,
// so the tab bar must too.
export function TabBar({ repoId }: { repoId: string }) {
  const segment = useSelectedLayoutSegment();
  const search = useSearchParams().toString();
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
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
        return (
          <Link
            key={tab.label}
            className="tab"
            role="tab"
            aria-selected={isActive(tab, segment)}
            aria-controls={TAB_PANEL_ID}
            // Roving tabindex: one stop for the whole bar, arrows move within it.
            tabIndex={index === stop ? 0 : -1}
            href={tabHref(repoId, tab, search)}
            ref={(node) => {
              links.current[index] = node;
            }}
            onKeyDown={(event) => move(event, index)}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
