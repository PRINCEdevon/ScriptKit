/**
 * Reads a number from a cell or a form answer. Spaces, commas and currency symbols are ignored,
 * so "R 1,500" is 1500. Returns null for anything that is not a plain number.
 *
 * A decimal comma is treated as a thousands separator, so "1,5" is 15 (docs/known-issues.md).
 */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/[Rr\s,\u00a0\u20b9$\u00a3\u20ac]/g, '');
  if (text === '' || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  return parseFloat(text);
}

/** parseNumber, with 0 for anything that is not a number. */
export function toNumber(value: unknown): number {
  const number = parseNumber(value);
  return number === null ? 0 : number;
}
