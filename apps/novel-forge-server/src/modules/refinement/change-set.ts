/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type Bible } from '@server/database';

/**
 * Defining types
 */

export interface EndingContract {
  hookType: 'cliffhanger' | 'revelation' | 'quiet_dread' | 'promise' | 'turn';
  emotionalBeat: string;
  openQuestion: string;
  handoffState: string;
  mustNotResolve?: string[];
}

export interface PremiseUpdateOp {
  op: 'premise.update';
  premise?: string;
  brief?: string;
  themes?: string[];
  instructions?: string;
}

export interface BibleDocumentUpsertOp {
  op: 'bible_document.upsert';
  section: Bible.Section;
  slug: string;
  frontmatter?: Record<string, unknown>;
  body?: string;
}

export interface BibleDocumentRemoveOp {
  op: 'bible_document.remove';
  section: Bible.Section;
  slug: string;
}

export interface VolumeUpsertOp {
  op: 'volume.upsert';
  volumeKey: string;
  ordinal?: number;
  title?: string;
  objective?: string;
  conflict?: string;
  payoff?: string;
  targetChapterCount?: number;
  cast?: string[];
  body?: string;
}

export interface VolumeRemoveOp {
  op: 'volume.remove';
  volumeKey: string;
}

export interface ArcUpsertOp {
  op: 'arc.upsert';
  arcKey: string;
  volumeKey: string;
  ordinal?: number;
  title?: string;
  objective?: string;
  escalation?: string;
  payoff?: string;
  hook?: string;
  chapterStart?: number;
  chapterEnd?: number;
  cast?: string[];
  body?: string;
}

export interface ArcRemoveOp {
  op: 'arc.remove';
  arcKey: string;
}

export interface BriefUpdateOp {
  op: 'brief.update';
  chapter: number;
  title?: string;
  body?: string;
  volumeKey?: string;
  arcKey?: string;
  contextRefs?: string[];
  endingContract?: EndingContract;
}

export interface EntityUpsertOp {
  op: 'entity.upsert';
  entityKey: string;
  type: 'character' | 'faction' | 'location' | 'power_rule' | 'item' | 'concept';
  name?: string;
  status?: string;
  motivation?: string;
  notes?: string;
  body?: string;
}

export interface EntityRemoveOp {
  op: 'entity.remove';
  entityKey: string;
}

export type ChangeOp =
  | PremiseUpdateOp
  | BibleDocumentUpsertOp
  | BibleDocumentRemoveOp
  | VolumeUpsertOp
  | VolumeRemoveOp
  | ArcUpsertOp
  | ArcRemoveOp
  | BriefUpdateOp
  | EntityUpsertOp
  | EntityRemoveOp;
export type OpType = ChangeOp['op'];

type FieldKind = 'string' | 'number' | 'string[]' | 'object';
interface OpSpec {
  required: Record<string, FieldKind>;
  optional: Record<string, FieldKind>;
}

/**
 * Declaring the constants
 */

const HOOK_TYPES = ['cliffhanger', 'revelation', 'quiet_dread', 'promise', 'turn'];
const BIBLE_SECTIONS = ['project', 'world', 'power', 'plot', 'story_state', 'ai', 'lore'];
const ENTITY_TYPES = ['character', 'faction', 'location', 'power_rule', 'item', 'concept'];

const OP_SPECS: Record<OpType, OpSpec> = {
  'premise.update': { required: {}, optional: { premise: 'string', brief: 'string', themes: 'string[]', instructions: 'string' } },
  'bible_document.upsert': { required: { section: 'string', slug: 'string' }, optional: { frontmatter: 'object', body: 'string' } },
  'bible_document.remove': { required: { section: 'string', slug: 'string' }, optional: {} },
  'volume.upsert': {
    required: { volumeKey: 'string' },
    optional: { ordinal: 'number', title: 'string', objective: 'string', conflict: 'string', payoff: 'string', targetChapterCount: 'number', cast: 'string[]', body: 'string' },
  },
  'volume.remove': { required: { volumeKey: 'string' }, optional: {} },
  'arc.upsert': {
    required: { arcKey: 'string', volumeKey: 'string' },
    optional: {
      ordinal: 'number',
      title: 'string',
      objective: 'string',
      escalation: 'string',
      payoff: 'string',
      hook: 'string',
      chapterStart: 'number',
      chapterEnd: 'number',
      cast: 'string[]',
      body: 'string',
    },
  },
  'arc.remove': { required: { arcKey: 'string' }, optional: {} },
  'brief.update': {
    required: { chapter: 'number' },
    optional: { title: 'string', body: 'string', volumeKey: 'string', arcKey: 'string', contextRefs: 'string[]', endingContract: 'object' },
  },
  'entity.upsert': {
    required: { entityKey: 'string', type: 'string' },
    optional: { name: 'string', status: 'string', motivation: 'string', notes: 'string', body: 'string' },
  },
  'entity.remove': { required: { entityKey: 'string' }, optional: {} },
};

export const OP_TYPES = Object.keys(OP_SPECS) as OpType[];

function isKind(value: unknown, kind: FieldKind): boolean {
  if (kind === 'string') return typeof value === 'string';
  if (kind === 'number') return typeof value === 'number' && Number.isInteger(value);
  if (kind === 'string[]') return Array.isArray(value) && value.every(v => typeof v === 'string');
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateEndingContract(value: unknown, path: string, errors: string[]): void {
  if (!isKind(value, 'object')) return void errors.push(`${path}: endingContract must be an object`);
  const contract = value as Record<string, unknown>;
  if (typeof contract['hookType'] !== 'string' || !HOOK_TYPES.includes(contract['hookType']))
    errors.push(`${path}: endingContract.hookType must be one of ${HOOK_TYPES.join(', ')}`);
  for (const key of ['emotionalBeat', 'openQuestion', 'handoffState']) {
    if (typeof contract[key] !== 'string' || contract[key] === '') errors.push(`${path}: endingContract.${key} must be a non-empty string`);
  }
  if (contract['mustNotResolve'] !== undefined && !isKind(contract['mustNotResolve'], 'string[]')) errors.push(`${path}: endingContract.mustNotResolve must be a string array`);
}

/**
 * Local models routinely emit the whole doc ref in the section and/or slug field of bible_document
 * ops (`{"section": "project/premise", "slug": "project/premise"}`, sometimes `doc:`-prefixed).
 * The intent is unambiguous, so repair it deterministically instead of burning a model retry:
 * strip a `doc:` prefix, split an embedded `section/slug`, and de-duplicate a section-prefixed slug.
 * Anything that doesn't match a known section is left untouched for validation to reject.
 */
function normalizeBibleDocumentOp(record: Record<string, unknown>): void {
  let section = record['section'];
  let slug = record['slug'];
  if (typeof section === 'string' && section.startsWith('doc:')) section = section.slice(4);
  if (typeof slug === 'string' && slug.startsWith('doc:')) slug = slug.slice(4);
  if (typeof section === 'string' && section.includes('/')) {
    const [head, ...rest] = section.split('/');
    if (BIBLE_SECTIONS.includes(head as string)) {
      section = head;
      if (typeof slug !== 'string' || slug === record['section'] || slug === '') slug = rest.join('/');
    }
  }
  if (typeof section === 'string' && typeof slug === 'string' && slug.startsWith(`${section}/`)) slug = slug.slice(section.length + 1);
  record['section'] = section;
  record['slug'] = slug;
}

/**
 * Validates an untrusted change-set structurally, optionally against a scope's allowed-op vocabulary.
 * Returns human-readable errors; an empty array means `value` is a well-formed `ChangeOp[]`.
 * Obviously-malformed-but-unambiguous bible_document refs are normalized in place first (see above),
 * so every staging and apply path repairs them consistently.
 */
export function validateChangeSet(value: unknown, allowedOps?: readonly OpType[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(value)) return ['changeSet must be an array of operations'];
  if (value.length === 0) return ['changeSet must contain at least one operation'];

  for (const item of value) {
    if (isKind(item, 'object') && typeof (item as Record<string, unknown>)['op'] === 'string' && ((item as Record<string, unknown>)['op'] as string).startsWith('bible_document'))
      normalizeBibleDocumentOp(item as Record<string, unknown>);
  }

  value.forEach((item, index) => {
    const path = `changeSet[${index}]`;
    if (!isKind(item, 'object')) return void errors.push(`${path}: must be an object`);
    const record = item as Record<string, unknown>;
    const op = record['op'];
    if (typeof op !== 'string' || !(op in OP_SPECS)) return void errors.push(`${path}: unknown op '${String(op)}'`);
    if (allowedOps && !allowedOps.includes(op as OpType)) return void errors.push(`${path}: op '${op}' is not allowed for this scope`);

    const spec = OP_SPECS[op as OpType];
    for (const [key, kind] of Object.entries(spec.required)) {
      if (!isKind(record[key], kind)) errors.push(`${path}: missing or invalid required field '${key}' (${kind})`);
    }
    for (const [key, kind] of Object.entries(spec.optional)) {
      if (record[key] !== undefined && !isKind(record[key], kind)) errors.push(`${path}: invalid field '${key}' (expected ${kind})`);
    }
    for (const key of Object.keys(record)) {
      if (key !== 'op' && !(key in spec.required) && !(key in spec.optional)) errors.push(`${path}: unexpected field '${key}'`);
    }

    if (op.startsWith('bible_document') && !BIBLE_SECTIONS.includes(record['section'] as string)) errors.push(`${path}: section must be one of ${BIBLE_SECTIONS.join(', ')}`);
    if (op === 'entity.upsert' && !ENTITY_TYPES.includes(record['type'] as string)) errors.push(`${path}: type must be one of ${ENTITY_TYPES.join(', ')}`);
    if (op === 'brief.update' && record['endingContract'] !== undefined) validateEndingContract(record['endingContract'], path, errors);
    if (op === 'arc.upsert' && typeof record['chapterStart'] === 'number' && typeof record['chapterEnd'] === 'number' && record['chapterStart'] > record['chapterEnd']) {
      errors.push(`${path}: chapterStart must be <= chapterEnd`);
    }
  });

  return errors;
}

/**
 * Renders the exact JSON shape of each allowed op for prompt use — weak local models return
 * malformed change-sets when the vocabulary is named but never shown (design §14 risk).
 */
export function renderOpVocabulary(ops: readonly OpType[]): string {
  const lines = ops.map(op => {
    const spec = OP_SPECS[op];
    const required = Object.entries(spec.required).map(([key, kind]) => `"${key}": <${kind}, required>`);
    const optional = Object.entries(spec.optional).map(([key, kind]) => `"${key}": <${kind}, optional>`);
    return `- {"op": "${op}"${[...required, ...optional].map(f => `, ${f}`).join('')}}`;
  });
  const contractShape = ops.includes('brief.update')
    ? `\nendingContract, when present, must be exactly: {"hookType": <one of: ${HOOK_TYPES.join(' | ')}>, "emotionalBeat": <non-empty string>, "openQuestion": <non-empty string>, "handoffState": <non-empty string>, "mustNotResolve": <string[], optional>} — hookType is an enum, never free text.`
    : '';
  return `changeSet, when present, must be an ARRAY of operation objects. Allowed operations and their fields:\n${lines.join('\n')}${contractShape}`;
}

/** The artifact refs a change-set touches — the keys used for baselines, conflict checks, and supersession. */
export function changeSetRefs(ops: ChangeOp[]): string[] {
  const refs = ops.map(op => {
    if (op.op === 'premise.update') return 'premise';
    if (op.op === 'bible_document.upsert' || op.op === 'bible_document.remove') return `doc:${op.section}/${op.slug}`;
    if (op.op === 'volume.upsert' || op.op === 'volume.remove') return `volume:${op.volumeKey}`;
    if (op.op === 'arc.upsert' || op.op === 'arc.remove') return `arc:${op.arcKey}`;
    if (op.op === 'entity.upsert' || op.op === 'entity.remove') return `entity:${op.entityKey}`;
    return `chapter:${op.chapter}`;
  });
  return [...new Set(refs)];
}
