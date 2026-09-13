import { describe, expect, it } from 'vitest';
import { HERO_SCORE, heroCard } from './sample-grades';

// The hero card is Gold at 95 with Prismatic still unclaimed above it. That is
// a deliberate choice rather than an arbitrary sample: Gold is the look the
// design asked for, and leaving the top of the ladder unearned is what gives
// the page something to sell. If either half of that drifts, the pitch quietly
// stops making sense.

describe('the hero card', () => {
  const card = heroCard();

  it('is Gold at 95', () => {
    expect(card.score).toBe(HERO_SCORE);
    expect(card.score).toBe(95);
    expect(card.finish).toBe('gold');
    expect(card.label).toBe('Excellent');
  });

  it('still has a tier above it, pointing at Prismatic 100', () => {
    expect(card.next).not.toBeNull();
    expect(card.next?.targetScore).toBe(100);
    expect(card.next?.targetFinish).toBe('Prismatic');
  });

  it('names at least one move to get there, so the next-tier block is not empty', () => {
    expect(card.next?.moves.length).toBeGreaterThan(0);
    for (const move of card.next?.moves ?? []) {
      expect(move.title).toBeTruthy();
      expect(move.points).toBeGreaterThan(0);
    }
  });

  it('carries the flavour line for its band rather than marketing copy', () => {
    expect(card.flavour).toBe(
      'An agent can land a change unaided. Documentation and verification both hold under pressure.',
    );
  });
});
