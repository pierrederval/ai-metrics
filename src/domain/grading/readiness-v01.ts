import type {
  CheckResult,
  EvidenceLineRange,
  GradeResult,
  RepositorySnapshot,
  SourceDocument,
} from './types';
import { sectionsWithFencedBlock } from './markdown-sections';

const MAX_POINTS = 20;
const LIMITATION = 'This file and documentation evidence is not semantic quality certification.';

const checks = [
  {
    id: 'root-agent-instructions',
    maxPoints: MAX_POINTS,
    description: 'A nonempty root AGENTS.md or CLAUDE.md exists.',
  },
  {
    id: 'root-readme',
    maxPoints: MAX_POINTS,
    description: 'A nonempty root README.md exists.',
  },
  {
    id: 'docs-markdown',
    maxPoints: MAX_POINTS,
    description: 'A nonempty Markdown document exists beneath docs/.',
  },
  {
    id: 'documented-setup',
    maxPoints: MAX_POINTS,
    description: 'Setup instructions include a nonempty fenced code block.',
  },
  {
    id: 'documented-tests',
    maxPoints: MAX_POINTS,
    description: 'Test instructions include a nonempty fenced code block.',
  },
] as const;

for (const check of checks) Object.freeze(check);

export const readinessRubric = Object.freeze({
  family: 'agent-readiness',
  version: '0.1.0',
  evaluatorVersion: '1.0.0',
  checks: Object.freeze(checks),
});

function ordered(documents: SourceDocument[]): SourceDocument[] {
  return [...documents].sort(
    (left, right) =>
      left.path.localeCompare(right.path, 'en') || left.blobSha.localeCompare(right.blobSha, 'en'),
  );
}

function isRootFile(document: SourceDocument, names: string[], caseInsensitive = false) {
  if (document.path.includes('/')) return false;
  return names.some((name) =>
    caseInsensitive ? document.path.toLowerCase() === name.toLowerCase() : document.path === name,
  );
}

function isDocsMarkdown(document: SourceDocument) {
  const [directory, ...rest] = document.path.split('/');
  return (
    directory.toLowerCase() === 'docs' &&
    rest.length > 0 &&
    /\.(?:md|markdown)$/i.test(document.path)
  );
}

function firstNonblankLine(document: SourceDocument): EvidenceLineRange | undefined {
  const index = document.text.split(/\r?\n/).findIndex((line) => line.trim().length > 0);
  if (index < 0) return undefined;
  return { path: document.path, blobSha: document.blobSha, start: index + 1, end: index + 1 };
}

function presenceCheck(
  id: string,
  candidates: SourceDocument[],
  passExplanation: string,
  failExplanation: string,
): CheckResult {
  const evidence = candidates.flatMap((document) => {
    const range = firstNonblankLine(document);
    return range ? [range] : [];
  });
  const passed = evidence.length > 0;
  return {
    id,
    points: passed ? MAX_POINTS : 0,
    maxPoints: MAX_POINTS,
    status: passed ? 'pass' : 'fail',
    paths: evidence.map(({ path }) => path),
    lineRanges: evidence,
    explanation: `${passed ? passExplanation : failExplanation} ${LIMITATION}`,
  };
}

function commandCheck(
  id: string,
  documents: SourceDocument[],
  headings: string[],
  label: string,
): CheckResult {
  const accepted = new Set(headings);
  const lineRanges = documents.flatMap((document) => sectionsWithFencedBlock(document, accepted));
  const passed = lineRanges.length > 0;
  return {
    id,
    points: passed ? MAX_POINTS : 0,
    maxPoints: MAX_POINTS,
    status: passed ? 'pass' : 'fail',
    paths: lineRanges.map(({ path }) => path),
    lineRanges,
    explanation: `${passed ? `Found documented ${label} commands.` : `No documented ${label} commands were found.`} ${LIMITATION}`,
  };
}

export function evaluateReadiness(snapshot: RepositorySnapshot): GradeResult {
  const documents = ordered(snapshot.documents);
  const agentInstructions = documents.filter((document) =>
    isRootFile(document, ['AGENTS.md', 'CLAUDE.md']),
  );
  const readmes = documents.filter((document) => isRootFile(document, ['README.md'], true));
  const docs = documents.filter(isDocsMarkdown);
  const relevantDocuments = [...readmes, ...agentInstructions, ...docs];
  const results = [
    presenceCheck(
      'root-agent-instructions',
      agentInstructions,
      'Found root agent instructions.',
      'No nonempty root AGENTS.md or CLAUDE.md was found.',
    ),
    presenceCheck(
      'root-readme',
      readmes,
      'Found a root README.md.',
      'No nonempty root README.md was found.',
    ),
    presenceCheck(
      'docs-markdown',
      docs,
      'Found Markdown documentation beneath docs/.',
      'No nonempty Markdown documentation beneath docs/ was found.',
    ),
    commandCheck(
      'documented-setup',
      relevantDocuments,
      ['setup', 'install', 'installation', 'getting started'],
      'setup',
    ),
    commandCheck(
      'documented-tests',
      relevantDocuments,
      ['test', 'testing', 'validation', 'verification', 'checks'],
      'test',
    ),
  ];
  const score = snapshot.complete ? results.reduce((sum, check) => sum + check.points, 0) : null;

  return {
    score,
    checks: results,
    rubricVersion: readinessRubric.version,
    evaluatorVersion: readinessRubric.evaluatorVersion,
    ...(!snapshot.complete
      ? { incompleteReason: 'Repository evidence collection was incomplete.' }
      : {}),
  };
}
