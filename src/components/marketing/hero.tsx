import { CLIMB_FROM, CLIMB_STOPS, climbCards } from './sample-grades';
import { HeroClimb } from './hero-climb';

/**
 * The hero's server half: it resolves the climb and hands it over.
 *
 * The split is the point. climbCards() reaches through grade-presentation.ts
 * into the grading domain, so it has to stay on this side of the client
 * boundary; HeroClimb only plays what it is given. Marking this file
 * 'use client' instead would pull the rubric — thresholds, tier names,
 * next-tier arithmetic — into the browser bundle to animate a card.
 */
export function Hero() {
  return <HeroClimb cards={climbCards()} from={CLIMB_FROM} stops={CLIMB_STOPS} />;
}
