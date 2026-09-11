import type { GradeResult } from '../grading/types';

// The provenance recorded on every run this floor produces. It is not a
// model id: no model authored these. A run's `model` stays null.
export const floorAuthorVersion = 'readiness-floor-v01';

export type ProposedRemedy = {
  checkId: string;
  path: string;
  rationale: string;
  ordinal: number;
};

// The file each failing readiness check is answered by. Setup and test
// instructions both land in AGENTS.md: readiness-v01 accepts a documented
// command in the README, the root agent instructions, or anything under
// docs/, and AGENTS.md is the file the agent being graded actually reads.
// One path therefore answers several checks, which is why authoring_remedies
// is unique on (run, check, path) rather than on path.
//
// A check id absent from this map proposes nothing. A remedy must name a
// file, and inventing one for a check this version does not understand would
// claim more than the grader observed.
const remedyPaths: Record<string, string> = {
  'root-agent-instructions': 'AGENTS.md',
  'root-readme': 'README.md',
  'docs-markdown': 'docs/README.md',
  'documented-setup': 'AGENTS.md',
  'documented-tests': 'AGENTS.md',
};

export function proposeRemedies(grade: GradeResult): ProposedRemedy[] {
  return grade.checks
    .filter((check) => check.status === 'fail')
    .flatMap((check) => {
      const path = remedyPaths[check.id];
      return path ? [{ checkId: check.id, path, rationale: check.explanation }] : [];
    })
    .map((remedy, ordinal) => ({ ...remedy, ordinal }));
}
