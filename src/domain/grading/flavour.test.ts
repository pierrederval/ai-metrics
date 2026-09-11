import { describe, expect, it } from 'vitest';
import { flavourLine } from './flavour';
describe('flavourLine', () => {
  it('covers every band boundary', () => {
    expect(flavourLine(0)).toMatch(/An agent will guess/);
    expect(flavourLine(49)).toMatch(/An agent will guess/);
    expect(flavourLine(50)).toMatch(/can start, but will stop/);
    expect(flavourLine(70)).toMatch(/Enough context to work from/);
    expect(flavourLine(80)).toMatch(/Readable, testable, navigable/);
    expect(flavourLine(90)).toMatch(/land a change unaided/);
    expect(flavourLine(100)).toMatch(/Nothing the rubric asks for is missing/);
  });
});
