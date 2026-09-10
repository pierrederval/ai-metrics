export type SourceDocument = {
  path: string;
  blobSha: string;
  text: string;
};

export type RepositorySnapshot = {
  sha: string;
  complete: boolean;
  documents: SourceDocument[];
};

export type EvidenceLineRange = {
  path: string;
  blobSha: string;
  start: number;
  end: number;
};

export type CheckResult = {
  id: string;
  points: number;
  maxPoints: number;
  status: 'pass' | 'fail';
  paths: string[];
  lineRanges: EvidenceLineRange[];
  explanation: string;
};

export type GradeResult = {
  score: number | null;
  checks: CheckResult[];
  rubricVersion: string;
  evaluatorVersion: string;
  incompleteReason?: string;
};
