import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The palette exists in exactly one place: the token tier in
// @fieldnote/design-system. A hex here means a colour the marketing page and
// the product can disagree about, which is the drift this whole extraction
// exists to prevent — and it is the kind of drift review misses, because a
// duplicated hex looks right until someone changes one of the two.
describe('src/app/style.css', () => {
  it('holds no colour literal, so the palette exists in exactly one place', () => {
    const css = readFileSync('src/app/style.css', 'utf8');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });

  it('names no colour function either, which is the same duplication spelled differently', () => {
    const css = readFileSync('src/app/style.css', 'utf8');
    expect(css.match(/\b(?:rgba?|hsla?|oklch|lab)\(/g) ?? []).toEqual([]);
  });

  // `color: white` is a colour literal wearing a friendlier name, and it is the
  // one the hex guard above would wave straight through. `transparent` and
  // `currentColor` are not colours in this sense — they name a relationship.
  it('names no bare colour keyword, which the hex guard would let through', () => {
    const css = readFileSync('src/app/style.css', 'utf8');
    const keywords =
      /(?:^|[:\s,(])(white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|brown|pink)(?=[;\s,)])/gi;
    expect([...css.matchAll(keywords)].map((match) => match[1])).toEqual([]);
  });
});
