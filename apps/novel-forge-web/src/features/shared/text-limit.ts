/** Counted by code point, as the server's schemas count, so a field and the server agree on what fits. */
export function textLength(value: string | undefined): number {
  return [...(value ?? '').trim()].length;
}
