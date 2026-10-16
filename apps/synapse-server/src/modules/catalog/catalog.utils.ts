export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Catalog keys come from admin input, so a key such as `constructor` must never resolve through the prototype. */
export function ownEntry<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export function childPath(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

export function itemPath(path: string, index: number): string {
  return `${path}[${index}]`;
}
