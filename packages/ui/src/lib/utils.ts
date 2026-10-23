export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function toPositiveInt(value?: string | null, allowZero = false): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const int = Math.floor(parsed);
  return int > 0 || (allowZero && int === 0) ? int : null;
}
