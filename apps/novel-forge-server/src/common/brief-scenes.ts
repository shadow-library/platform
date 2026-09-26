import { type BriefScene } from '@server/database';

export function validateBriefScenes(value: unknown): string[] {
  if (!Array.isArray(value)) return ['scenes must be an array'];
  return value.flatMap((scene, index) => {
    const at = `scenes[${index}]`;
    if (typeof scene !== 'object' || scene === null || Array.isArray(scene)) return [`${at} must be an object`];
    const record = scene as Record<string, unknown>;
    const errors = Object.keys(record)
      .filter(key => key !== 'summary' && key !== 'pov')
      .map(key => `${at} has unexpected field '${key}'`);
    if (typeof record['summary'] !== 'string' || record['summary'].trim() === '') errors.push(`${at}.summary must be a non-empty string`);
    const pov = record['pov'];
    if (pov !== undefined && pov !== null && (typeof pov !== 'string' || pov.trim() === '')) errors.push(`${at}.pov must be an entity key or null`);
    return errors;
  });
}

/** Trims, drops blanks and de-duplicates, keeping first-seen order. */
export function normalizeStringList(values: readonly string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

/** An omitted or blank scene POV is stored as null, so every stored scene has the same shape. */
export function normalizeBriefScenes(scenes: readonly { summary: string; pov?: string | null }[]): BriefScene[] {
  return scenes.map(scene => ({ summary: scene.summary.trim(), pov: scene.pov?.trim() || null }));
}
