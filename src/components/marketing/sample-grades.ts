import type { GradeCardProps } from '@fieldnote/design-system';
import type { CheckResult } from '../../domain/grading/types';
import { gradeCardProps } from '../grading/grade-presentation';

/**
 * The scores the landing page illustrates the six finishes with.
 *
 * Defined once, ascending, and mapped through the rubric rather than typed out
 * as a table of names and colours. A marketing page that hand-writes "Gold,
 * #a77a13, three stars" is a second copy of the rubric that nobody tests, and
 * it goes stale the first time a threshold moves.
 */
export const LADDER_SCORES = [32, 61, 74, 84, 95, 100] as const;

/** The hero card: Gold, one move short of Prismatic. */
export const HERO_SCORE = 95;

const failing = (id: string, maxPoints: number): CheckResult => ({
  id,
  points: 0,
  maxPoints,
  status: 'fail',
  paths: [],
  lineRanges: [],
  explanation: '',
});

/**
 * A sample card at a given score. `remaining` is how many points are still on
 * the table, which is what gives the card its "next tier" block — the hero
 * needs one so the page has something to sell.
 */
export function sampleCard(score: number, remaining = 0): GradeCardProps {
  return gradeCardProps({
    score,
    repositoryName: 'your-org / your-repo',
    sha: '6b1f0a4c9d2e73815a0c4f6d8b3e12907c5a4d6e',
    rubricVersion: '0.1.0',
    checks: remaining > 0 ? [failing('documented-tests', remaining)] : [],
  });
}

/** The hero's Gold card, with Prismatic at 100 still unclaimed above it. */
export const heroCard = (): GradeCardProps => sampleCard(HERO_SCORE, 100 - HERO_SCORE);

/** The ladder, ascending, one rung per finish. */
export const ladderCards = (): GradeCardProps[] =>
  LADDER_SCORES.map((score) => sampleCard(score));
