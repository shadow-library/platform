import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { EvalError } from './errors.ts';
import { FIXTURES_DIR, type Story, type StoryChapter, type StorySecret } from './fixtures.ts';
import { type EntityInput, type MilestoneInput, type WordTarget } from './forge.types.ts';
import { assertFixtureClean, milestoneChapter } from './story-project.ts';
import { matches } from './text.ts';

export type GenreArchetype = 'mystery-progression' | 'kingdom-building' | 'game-system';

export const GENRE_ARCHETYPES: readonly GenreArchetype[] = ['mystery-progression', 'kingdom-building', 'game-system'];

export interface WorldFact {
  factKey: string;
  text: string;
  subjects: string[];
}

export interface StatValue {
  attribute: string;
  value: number;
}

export interface GenreSystem {
  character: string;
  startingStats: StatValue[];
  startingSkills: StatValue[];
  trackedStats: string[];
}

export interface GenreFixture {
  id: string;
  archetype: GenreArchetype;
  title: string;
  premise: string;
  writingInstructions: string;
  wordTarget: WordTarget;
  protagonist: string;
  entities: EntityInput[];
  worldFacts: WorldFact[];
  milestones: (MilestoneInput & { chapter: number })[];
  secrets: StorySecret[];
  chapters: StoryChapter[];
  system: GenreSystem | null;
}

const GENRES_DIR = path.join(FIXTURES_DIR, 'genres');
const SYSTEM_FENCE = '```system';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(record: Record<string, unknown>, field: string, where: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') throw new EvalError(`${where}.${field} must be a non-empty string`);
  return value;
}

function list(record: Record<string, unknown>, field: string, where: string): Record<string, unknown>[] {
  const value = record[field];
  if (!Array.isArray(value) || value.length === 0) throw new EvalError(`${where}.${field} must be a non-empty array`);
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new EvalError(`${where}.${field}[${index}] must be an object`);
    return entry;
  });
}

function strings(record: Record<string, unknown>, field: string, where: string): string[] {
  const value = record[field] ?? [];
  if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string' || entry.trim() === ''))
    throw new EvalError(`${where}.${field} must be an array of non-empty strings`);
  return value as string[];
}

function stats(record: Record<string, unknown>, field: string, where: string): StatValue[] {
  return list(record, field, where).map((entry, index) => {
    const value = entry['value'];
    if (typeof value !== 'number' || !Number.isInteger(value)) throw new EvalError(`${where}.${field}[${index}].value must be an integer`);
    return { attribute: text(entry, 'attribute', `${where}.${field}[${index}]`), value };
  });
}

function readSystem(root: Record<string, unknown>, archetype: GenreArchetype, instructions: string, where: string): GenreSystem | null {
  const raw = root['system'];
  if (archetype !== 'game-system') {
    if (raw !== undefined) throw new EvalError(`${where}.system belongs only to a game-system fixture`);
    return null;
  }
  if (!isRecord(raw)) throw new EvalError(`${where}.system is required for a game-system fixture`);
  if (!instructions.includes(SYSTEM_FENCE)) throw new EvalError(`${where}.writingInstructions must tell the writer to put system messages in ${SYSTEM_FENCE} panels`);
  const at = `${where}.system`;
  const system: GenreSystem = {
    character: text(raw, 'character', at),
    startingStats: stats(raw, 'startingStats', at),
    startingSkills: stats(raw, 'startingSkills', at),
    trackedStats: strings(raw, 'trackedStats', at),
  };
  const known = new Set([...system.startingStats, ...system.startingSkills].map(stat => stat.attribute));
  const unknown = system.trackedStats.filter(stat => !known.has(stat));
  if (unknown.length > 0) throw new EvalError(`${at}.trackedStats names stats canon never establishes: ${unknown.join(', ')}`);
  return system;
}

function readSecret(entry: Record<string, unknown>, where: string): StorySecret {
  const secret: StorySecret = {
    factKey: text(entry, 'factKey', where),
    text: text(entry, 'text', where),
    subjects: strings(entry, 'subjects', where),
    terms: strings(entry, 'terms', where),
    writerNote: text(entry, 'writerNote', where),
    allowedClues: strings(entry, 'allowedClues', where),
    unlockMilestone: text(entry, 'unlockMilestone', where),
    revealPatterns: strings(entry, 'revealPatterns', where),
  };
  if (secret.terms.length === 0 || secret.revealPatterns.length === 0) throw new EvalError(`${where} needs give-away terms and reveal patterns`);
  for (const pattern of secret.revealPatterns) {
    try {
      new RegExp(pattern, 'iu');
    } catch (error) {
      throw new EvalError(`${where}.revealPatterns has an invalid pattern ${pattern}`, { cause: error });
    }
  }
  const namedClue = secret.allowedClues.find(clue => matches(clue, { any: secret.terms }));
  if (namedClue) throw new EvalError(`${where}: the allowed clue "${namedClue}" names a give-away term`);
  return secret;
}

export function genreStory(fixture: GenreFixture): Story {
  return {
    title: fixture.title,
    synopsis: fixture.premise,
    notes: fixture.premise,
    entities: fixture.entities,
    milestones: fixture.milestones,
    secrets: fixture.secrets,
    chapters: fixture.chapters,
  };
}

/** The game-system fixture's opening status window as open canon, in the same table form the writer is told to use. */
export function startingStatsFact(fixture: GenreFixture): WorldFact | null {
  if (!fixture.system) return null;
  const rows = (header: [string, string], values: readonly StatValue[]): string =>
    [`| ${header[0]} | ${header[1]} |`, '| --- | --- |', ...values.map(stat => `| ${stat.attribute} | ${stat.value} |`)].join('\n');
  return {
    factKey: 'starting_status_window',
    text: `${fixture.system.character}'s status window when the story opens, before chapter 1:\n\n${rows(['Attribute', 'Value'], fixture.system.startingStats)}\n\n${rows(['Skill', 'Level'], fixture.system.startingSkills)}`,
    subjects: [fixture.protagonist],
  };
}

export function openFacts(fixture: GenreFixture): WorldFact[] {
  const stats = startingStatsFact(fixture);
  return stats ? [...fixture.worldFacts, stats] : fixture.worldFacts;
}

export function lockedSecrets(fixture: GenreFixture, chapter: number): StorySecret[] {
  const story = genreStory(fixture);
  return fixture.secrets.filter(secret => milestoneChapter(story, secret) > chapter);
}

/** What the writer is given about canon when its own view is unreadable: the premise, cast, open facts and hidden facts' writer notes — never a secret's text. */
export function seededCanonDigest(fixture: GenreFixture, chapter: number): string {
  return [
    `Premise: ${fixture.premise}`,
    '',
    'Characters and factions:',
    ...fixture.entities.map(entity => `- ${entity.name} (${entity.type}): ${entity.notes ?? ''}`),
    '',
    'World facts:',
    ...openFacts(fixture).map(fact => `- ${fact.text}`),
    '',
    'Writer notes on matters not yet revealed:',
    ...lockedSecrets(fixture, chapter).map(secret => `- ${secret.writerNote}`),
  ].join('\n');
}

export function genreFixtureIds(): string[] {
  if (!existsSync(GENRES_DIR)) return [];
  return readdirSync(GENRES_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => file.slice(0, -'.json'.length))
    .sort();
}

/** A plan that matches a secret still locked at its chapter, or names one of its give-away terms, would make the secret-discipline judgement meaningless. */
function assertBriefsKeepSecrets(fixture: GenreFixture, where: string): void {
  assertFixtureClean(genreStory(fixture));
  const named = fixture.chapters.flatMap(chapter =>
    lockedSecrets(fixture, chapter.n)
      .filter(secret => matches(chapter.plan, { any: secret.terms }))
      .map(secret => `plan ${chapter.n} names ${secret.factKey}`),
  );
  if (named.length > 0) throw new EvalError(`${where} reveals secrets early: ${named.join('; ')}`);
}

export function loadGenreFixture(id: string): GenreFixture {
  const where = `genres/${id}.json`;
  const file = path.join(GENRES_DIR, `${id}.json`);
  if (!existsSync(file)) throw new EvalError(`Unknown genre fixture "${id}" — choose from ${genreFixtureIds().join(', ')}`);
  let root: unknown;
  try {
    root = JSON.parse(readFileSync(file, 'utf-8'));
  } catch (error) {
    throw new EvalError(`Fixture ${file} is not valid JSON`, { cause: error });
  }
  if (!isRecord(root)) throw new EvalError(`${where} must be an object`);
  if (root['id'] !== id) throw new EvalError(`${where}.id must be "${id}"`);
  const archetype = text(root, 'archetype', where) as GenreArchetype;
  if (!GENRE_ARCHETYPES.includes(archetype)) throw new EvalError(`${where}.archetype must be one of ${GENRE_ARCHETYPES.join(', ')}`);
  const writingInstructions = text(root, 'writingInstructions', where);
  const wordTarget = root['wordTarget'];
  if (!isRecord(wordTarget) || !Number.isInteger(wordTarget['min']) || !Number.isInteger(wordTarget['max']) || Number(wordTarget['min']) >= Number(wordTarget['max']))
    throw new EvalError(`${where}.wordTarget must be { min, max } integers with min < max`);

  const entities = list(root, 'entities', where).map((entry, index) => {
    const at = `${where}.entities[${index}]`;
    return { ...entry, entityKey: text(entry, 'entityKey', at), type: text(entry, 'type', at), name: text(entry, 'name', at) } as EntityInput;
  });
  const entityKeys = new Set(entities.map(entity => entity.entityKey));
  const protagonist = text(root, 'protagonist', where);
  if (!entityKeys.has(protagonist)) throw new EvalError(`${where}.protagonist names no entity`);

  const milestones = list(root, 'milestones', where).map((entry, index) => {
    const at = `${where}.milestones[${index}]`;
    if (!Number.isInteger(entry['chapter'])) throw new EvalError(`${at}.chapter must be an integer`);
    return { ...entry, milestoneKey: text(entry, 'milestoneKey', at), label: text(entry, 'label', at), chapter: Number(entry['chapter']) } as MilestoneInput & { chapter: number };
  });
  const milestoneKeys = new Set(milestones.map(milestone => milestone.milestoneKey));
  const secrets = list(root, 'secrets', where).map((entry, index) => readSecret(entry, `${where}.secrets[${index}]`));
  const strayUnlock = secrets.find(secret => !milestoneKeys.has(secret.unlockMilestone));
  if (strayUnlock) throw new EvalError(`${where}: secret ${strayUnlock.factKey} unlocks on an unknown milestone`);

  const chapters = list(root, 'chapters', where).map((entry, index): StoryChapter => {
    const at = `${where}.chapters[${index}]`;
    const chapter: StoryChapter = {
      n: Number(entry['n']),
      title: text(entry, 'title', at),
      pov: text(entry, 'pov', at),
      plan: text(entry, 'plan', at),
      ...(entry['claimedMilestones'] === undefined ? {} : { claimedMilestones: strings(entry, 'claimedMilestones', at) }),
    };
    if (chapter.n !== index + 1) throw new EvalError(`${where}.chapters must be numbered 1..N in order`);
    if (!entityKeys.has(chapter.pov)) throw new EvalError(`${at}.pov names no entity`);
    const stray = (chapter.claimedMilestones ?? []).find(key => !milestoneKeys.has(key));
    if (stray) throw new EvalError(`${at} claims unknown milestone ${stray}`);
    return chapter;
  });

  const fixture: GenreFixture = {
    id,
    archetype,
    title: text(root, 'title', where),
    premise: text(root, 'premise', where),
    writingInstructions,
    wordTarget: { min: Number(wordTarget['min']), max: Number(wordTarget['max']) },
    protagonist,
    entities,
    worldFacts: list(root, 'worldFacts', where).map((entry, index) => ({
      factKey: text(entry, 'factKey', `${where}.worldFacts[${index}]`),
      text: text(entry, 'text', `${where}.worldFacts[${index}]`),
      subjects: strings(entry, 'subjects', `${where}.worldFacts[${index}]`),
    })),
    milestones,
    secrets,
    chapters,
    system: readSystem(root, archetype, writingInstructions, where),
  };
  assertBriefsKeepSecrets(fixture, where);
  return fixture;
}
