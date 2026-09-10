import { describe, expect, it } from 'vitest';
import { focusIndex, isActive, tabHref, tabs } from './tabs';

describe('repository tabs', () => {
  it('lists the five views in order', () => {
    expect(tabs.map((t) => t.segment)).toEqual([
      null,
      'grading',
      'ai-involvement',
      'delivery',
      'settings',
    ]);
  });

  it('marks the landing view active when there is no segment', () => {
    expect(isActive(tabs[0], null)).toBe(true);
    expect(isActive(tabs[1], null)).toBe(false);
  });

  it('marks a nested view active by its segment', () => {
    expect(isActive(tabs[1], 'grading')).toBe(true);
    expect(isActive(tabs[0], 'grading')).toBe(false);
  });

  it('routes the landing view to the repository root and the rest beneath it', () => {
    expect(tabHref('repository:1', tabs[0])).toBe('/repos/repository%3A1');
    expect(tabHref('repository:1', tabs[1])).toBe('/repos/repository%3A1/grading');
    expect(tabHref('repository:1', tabs[4])).toBe('/repos/repository%3A1/settings');
  });

  it('puts the tab stop on the selected tab', () => {
    expect(focusIndex(null)).toBe(0);
    expect(focusIndex('grading')).toBe(1);
    expect(focusIndex('settings')).toBe(4);
  });

  it('keeps the bar keyboard-reachable when a route has no tab of its own', () => {
    // A route added under [repoId] without a tab entry must not leave every
    // anchor at tabIndex -1.
    expect(focusIndex('some-future-route')).toBe(0);
  });
});
