import { expect, test } from 'vitest';
import { needsOnboarding, filterRepositoryChoices } from './onboarding';
test('empty live accounts onboard, demo accounts do not', () => {
  expect(needsOnboarding([], false)).toBe(true);
  expect(needsOnboarding([], true)).toBe(false);
});
test('installation availability is not tracking', () => {
  expect(needsOnboarding([{ trackingStartedAt: null }], false)).toBe(true);
  expect(needsOnboarding([{ trackingStartedAt: new Date() }], false)).toBe(false);
});
test('owner and name filtering ignores case and whitespace', () => {
  const choices = [
    { owner: 'Fieldnote', name: 'Core' },
    { owner: 'Else', name: 'Other' },
  ];
  expect(filterRepositoryChoices(choices, ' FIELD ')).toEqual([choices[0]]);
  expect(filterRepositoryChoices(choices, 'core')).toEqual([choices[0]]);
  expect(filterRepositoryChoices(choices, 'missing')).toEqual([]);
});
