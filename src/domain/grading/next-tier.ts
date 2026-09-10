import { gradePresentation } from './presentation';
import { finishNames } from './finish-names';
import { checkTitles } from './check-titles';
import type { CheckResult } from './types';
export interface Move {
  id: string;
  title: string;
  points: number;
}
export interface NextTier {
  targetScore: number;
  targetFinish: string;
  moves: Move[];
}
export function nextTier(score: number, checks: CheckResult[]): NextTier | null {
  const failing = checks.filter((check) => check.status === 'fail');
  if (failing.length === 0) return null;
  const moves = [...failing]
    .sort((a, b) => b.maxPoints - a.maxPoints)
    .map((check) => ({
      id: check.id,
      title: checkTitles[check.id] ?? check.id,
      points: check.maxPoints,
    }));
  const currentFinish = gradePresentation(score).finish;
  let accumulated = 0;
  let targetScore = score;
  for (const move of moves) {
    accumulated += move.points;
    targetScore = Math.min(100, score + accumulated);
    if (gradePresentation(targetScore).finish !== currentFinish) break;
  }
  const targetFinish = finishNames[gradePresentation(targetScore).finish].split(' · ')[0];
  return { targetScore, targetFinish, moves };
}
