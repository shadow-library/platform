import { type BriefScene } from '@server/database';

const TEXT_FIELDS = ['goal', 'obstacle', 'turn'] as const;
const SCENE_FIELDS: ReadonlySet<string> = new Set(['summary', 'pov', ...TEXT_FIELDS, 'beats', 'estimatedWords']);

function detailErrors(record: Record<string, unknown>, at: string): string[] {
  const errors = TEXT_FIELDS.filter(field => record[field] !== undefined && typeof record[field] !== 'string').map(field => `${at}.${field} must be a string`);
  const beats = record['beats'];
  if (beats !== undefined && (!Array.isArray(beats) || beats.some(beat => typeof beat !== 'string'))) errors.push(`${at}.beats must be a list of strings`);
  const words = record['estimatedWords'];
  if (words !== undefined && (!Number.isInteger(words) || (words as number) < 1)) errors.push(`${at}.estimatedWords must be an integer >= 1`);
  return errors;
}

export function validateBriefScenes(value: unknown): string[] {
  if (!Array.isArray(value)) return ['scenes must be an array'];
  return value.flatMap((scene, index) => {
    const at = `scenes[${index}]`;
    if (typeof scene !== 'object' || scene === null || Array.isArray(scene)) return [`${at} must be an object`];
    const record = scene as Record<string, unknown>;
    const errors = Object.keys(record)
      .filter(key => !SCENE_FIELDS.has(key))
      .map(key => `${at} has unexpected field '${key}'`);
    if (typeof record['summary'] !== 'string' || record['summary'].trim() === '') errors.push(`${at}.summary must be a non-empty string`);
    const pov = record['pov'];
    if (pov !== undefined && pov !== null && (typeof pov !== 'string' || pov.trim() === '')) errors.push(`${at}.pov must be an entity key or null`);
    return [...errors, ...detailErrors(record, at)];
  });
}

/** Trims, drops blanks and de-duplicates, keeping first-seen order. */
export function normalizeStringList(values: readonly string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

type SceneInput = Omit<BriefScene, 'pov'> & { pov?: string | null };

/** An omitted or blank scene POV is stored as null, so every stored scene has the same shape; blank details are dropped. */
export function normalizeBriefScenes(scenes: readonly SceneInput[]): BriefScene[] {
  return scenes.map(scene => {
    const normalized: BriefScene = { summary: scene.summary.trim(), pov: scene.pov?.trim() || null };
    for (const field of TEXT_FIELDS) {
      const text = scene[field]?.trim();
      if (text) normalized[field] = text;
    }
    const beats = scene.beats?.map(beat => beat.trim()).filter(Boolean);
    if (beats?.length) normalized.beats = beats;
    if (scene.estimatedWords) normalized.estimatedWords = scene.estimatedWords;
    return normalized;
  });
}
