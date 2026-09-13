// TypeScript resolves a side-effect import through the package's `exports` map
// and then wants a type for whatever it landed on. Next ships `declare module
// '*.css'`, but that wildcard only matches a specifier that literally ends in
// `.css`, and this one deliberately does not: `@fieldnote/design-system/styles`
// is the stable entry point, with the filename behind it free to move.
declare module '@fieldnote/design-system/styles';
