// Higher version first. Version strings are usually numeric, but fall back
// to a plain string compare so a non-numeric scheme still sorts consistently
// instead of throwing everything to the front.
export function compareVersionsDesc(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) {
    return nb - na;
  }
  return b.localeCompare(a);
}
