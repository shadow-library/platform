/**
 * Assigning `undefined` to `process.env.TZ` coerces to the string `"undefined"`, an invalid zone that falls
 * back to UTC rather than restoring the unset state — so restoring deletes the key when it was unset.
 */
export async function withTimeZone<T>(zone: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}
