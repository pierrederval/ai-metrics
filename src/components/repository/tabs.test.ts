import { describe, expect, it } from 'vitest';
import { isActive, tabHref, tabs } from './tabs';

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
});
