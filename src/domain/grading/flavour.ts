import { gradePresentation, type GradePresentation } from './presentation';
const flavourLines: Record<GradePresentation['finish'], string> = {
  common:
    'An agent will guess. There is no reliable way to build this, test it, or find the thing it needs to change.',
  shimmer: 'An agent can start, but will stop to ask questions a document should already answer.',
  bronze: 'Enough context to work from. Verifying the change still takes trial and error.',
  silver:
    'Readable, testable, navigable. An agent can find its way around and verify its own work without asking a human first.',
  gold: 'An agent can land a change unaided. Documentation and verification both hold under pressure.',
  prismatic: 'Nothing the rubric asks for is missing.',
};
export function flavourLine(score: number): string {
  return flavourLines[gradePresentation(score).finish];
}
