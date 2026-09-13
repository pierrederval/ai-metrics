import type { GradeCardProps } from '@fieldnote/design-system';
import { gradePresentation } from '../../domain/grading/presentation';
import { finishNames } from '../../domain/grading/finish-names';
import { flavourLine } from '../../domain/grading/flavour';
import { nextTier } from '../../domain/grading/next-tier';
import type { CheckResult } from '../../domain/grading/types';

/**
 * The only place the grading domain meets the design system.
 *
 * `GradeCard` moved into @fieldnote/design-system so the product and the
 * landing page render the same component. The rubric did not move: thresholds,
 * tier names, flavour lines and next-tier moves are domain knowledge, tested
 * where they live. This function resolves them once and hands the card a plain
 * prop bag.
 *
 * No component calls gradePresentation, finishNames, flavourLine or nextTier
 * directly any more. That is the point — one seam, not four.
 */
export function gradeCardProps(input: {
  score: number;
  repositoryName: string;
  sha: string;
  rubricVersion: string;
  checks: CheckResult[];
}): GradeCardProps {
  const grade = gradePresentation(input.score);
  return {
    score: input.score,
    finish: grade.finish,
    label: grade.label,
    color: grade.color,
    symbol: grade.symbol,
    count: grade.count,
    finishName: finishNames[grade.finish],
    flavour: flavourLine(input.score),
    next: nextTier(input.score, input.checks),
    repositoryName: input.repositoryName,
    rubricVersion: input.rubricVersion,
    sha: input.sha,
  };
}

/**
 * The banner takes the same tier, minus everything it has no room for. Derived
 * from the card's props rather than from the score a second time, so the two
 * cannot disagree about what a score means.
 */
export function gradeBannerProps(props: GradeCardProps) {
  const { score, label, color, symbol, count, finish } = props;
  return { score, label, color, symbol, count, finish };
}
