import { type Ideation } from '@server/database';

export interface ProvenanceFieldSummary {
  field: string;
  /** Absent when the sheet carries a value the studio never recorded a source for. */
  source?: Ideation.FieldSource;
  turnOrdinal?: number;
}

export interface ProvenanceSummary {
  filled: number;
  author: number;
  studio: number;
  crossed: number;
  /** Filled fields with no recorded source — counted apart so the honesty check never overstates authorship. */
  unattributed: number;
  fields: ProvenanceFieldSummary[];
}

const SHEET_ORDER: Ideation.FieldKey[] = [
  'workingTitle',
  'genre',
  'themes',
  'premise',
  'hook',
  'castShape',
  'progressionSystem',
  'protagonistDrive',
  'stakes',
  'voice',
  'serializationNotes',
];

function filledKeys(fields: Ideation.SeedFields): Ideation.FieldKey[] {
  return SHEET_ORDER.filter(key => {
    const value = fields[key];
    return Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim() !== '';
  });
}

function section(heading: string, body: string | undefined | null): string | null {
  const text = body?.trim();
  return text ? `## ${heading}\n\n${text}` : null;
}

function bulletList(items: string[]): string {
  return items.map(item => `- ${item}`).join('\n');
}

/**
 * The whole-novel synopsis, rendered from the sheet alone (ideation-studio design §5). Short by
 * construction: the sheet holds idea-altitude material only, so there is nothing here that could grow
 * into a plan. Refinement details it from here; this is half of the studio's entire handoff.
 */
export function renderPremiseDoc(fields: Ideation.SeedFields): string {
  const blocks = [
    section('Premise', fields.premise),
    section('Hook', fields.hook),
    section('Cast', fields.castShape),
    section('Progression', fields.progressionSystem),
    section('What the protagonist wants', fields.protagonistDrive),
    section('Stakes', fields.stakes),
    fields.genre || fields.themes?.length
      ? section('Shelf', [fields.genre, fields.themes?.length ? `Themes: ${fields.themes.join(', ')}` : null].filter(Boolean).join('\n'))
      : null,
  ];
  return blocks.filter(Boolean).join('\n\n');
}

/**
 * The reader contract as prose: the promises the story may never betray, the shapes and scope rules the
 * author locked, how it serializes, and the taste it was calibrated against. Refinement formalizes these
 * on its own schedule — only the named betrayals also travel as canon facts.
 */
export function renderReaderPromiseDoc(seed: Pick<Ideation.StorySeed, 'fields' | 'constraints' | 'tasteAnchors'>): string {
  const fields = seed.fields ?? {};
  const constraints = seed.constraints ?? [];
  const anchors = seed.tasteAnchors ?? { comps: [], preferences: [] };
  const ofKind = (kind: Ideation.ConstraintKind): string[] => constraints.filter(constraint => constraint.kind === kind).map(constraint => constraint.text);

  const promises = ofKind('promise');
  const taste = [anchors.comps.length > 0 ? `Comps: ${anchors.comps.join(', ')}` : null, ...anchors.preferences.map(preference => `- ${preference}`)].filter(Boolean).join('\n');
  const blocks = [
    section('What every chapter owes the reader', fields.hook ? `${fields.hook}\n\nThe ladder the reader follows: ${fields.progressionSystem ?? 'still to be decided.'}` : null),
    section(
      'Promises this story never betrays',
      promises.length > 0 ? bulletList(promises) : 'None named in the studio. Anything the reader comes to rely on is a promise from the chapter it is made.',
    ),
    section('Locked shape rules', ofKind('shape').length > 0 ? bulletList(ofKind('shape')) : null),
    section('Locked scope rules', ofKind('scope').length > 0 ? bulletList(ofKind('scope')) : null),
    section('Serialization', fields.serializationNotes),
    section('Voice', fields.voice),
    section('Taste anchors', taste),
  ];
  return blocks.filter(Boolean).join('\n\n');
}

/** The voice contract joins the chapter-instruction channel the generation prompts already read. */
export function renderInstructions(existing: string | null, voice: string | undefined): string | null {
  const current = existing?.trim() || null;
  const contract = voice?.trim() ? `Narration voice, decided in the Ideation Studio: ${voice.trim()}` : null;
  if (!contract) return current;
  return current ? `${current}\n\n${contract}` : contract;
}

/**
 * The honesty check (ideation-studio design §2.2). Graduation deletes the seed, so the response
 * carrying this summary is the only place the split between the author's decisions and the studio's
 * suggestions can still be read.
 */
export function provenanceSummary(seed: Pick<Ideation.StorySeed, 'fields' | 'provenance'>): ProvenanceSummary {
  const provenance = seed.provenance ?? {};
  const fields = filledKeys(seed.fields ?? {}).map(field => {
    const entry = provenance[field];
    return entry ? { field, source: entry.source, turnOrdinal: entry.turnOrdinal } : { field };
  });
  const count = (source: Ideation.FieldSource): number => fields.filter(entry => entry.source === source).length;

  return {
    filled: fields.length,
    author: count('author'),
    studio: count('studio'),
    crossed: count('crossed'),
    unattributed: fields.filter(entry => entry.source === undefined).length,
    fields,
  };
}

/** `promise:no-harem` from `no harem` — the fact key is the constraint's key, normalised. */
export function promiseFactKey(constraintKey: string): string {
  const slug = constraintKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `promise:${slug}`;
}

/** The planner-facing phrasing of a betrayal rule: what it forbids, stated as an instruction. */
export function promiseConstraintNote(text: string): string {
  return `Reader promise locked at ideation — plan and write nothing that breaks it: ${text}`;
}
