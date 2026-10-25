export function nullWhenEmpty<T>(data: T | undefined): T | null {
  return data ?? null;
}
