function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

/** Looks `value` up in `labels`; an unmapped value falls back to a de-slugged, title-cased version rather than reaching the owner as `raw_enum_value`. */
export function formatEnum(value: string, labels: Record<string, string> = {}): string {
  return labels[value] ?? humanize(value);
}
