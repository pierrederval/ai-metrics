// Match Next's encoded dynamic-segment keys without double-encoding a pathname
// that already contains escapes. Split first so an encoded slash stays one ID.
export function canonicalPathname(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) => {
      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        return encodeURIComponent(segment);
      }
    })
    .join('/');
}
