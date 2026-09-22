import { type Bible, type Generation, type Ideation } from '@server/database';

import { HOOK_TYPES, type HookTypeValue } from '../ai/schemas/enums';
import { requiredEntityTypesForSlug } from '../bible/bible-manifest';

interface EndingContract {
  hookType: HookTypeValue;
  emotionalBeat: string;
  openQuestion: string;
  handoffState: string;
  mustNotResolve?: string[];
}

export interface PremiseUpdateOp {
  op: 'premise.update';
  title?: string;
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

interface KnowledgeReveal {
  entityKey: string;
  factKey: string;
}

interface KnowledgeContract {
  pov: string[];
  learns?: KnowledgeReveal[];
}

export interface BriefUpdateOp {
  op: 'brief.update';
  chapter: number;
  title?: string;
  body?: string;
  writeMode?: Generation.BriefWriteMode;
  volumeKey?: string;
  arcKey?: string;
  contextRefs?: string[];
  endingContract?: EndingContract;
  /** Explicit `null` drops the chapter's contract — the only way to un-reveal without deleting the brief. */
  knowledgeContract?: KnowledgeContract | null;
}

export interface BriefRemoveOp {
  op: 'brief.remove';
  chapter: number;
}

export interface DraftUpdateOp {
  op: 'draft.update';
  chapter: number;
  title?: string;
  body?: string;
  summary?: string;
}

export interface DraftRemoveOp {
  op: 'draft.remove';
  chapter: number;
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

/**
 * Spoiler-grade canon. `body` is the truth itself and never reaches a drafter who has not ledgered
 * it; `constraintNote` is author-only, `writerNote` is the writer-safe instruction shown while the fact
 * is hidden (omitted keeps the current one, blank clears it), and `terms` are the tell-tale strings the leak scan hunts for. Reveals are deliberately absent —
 * a fact enters the ledger through a brief's knowledgeContract and draft approval, nowhere else.
 */
export interface FactUpsertOp {
  op: 'fact.upsert';
  factKey: string;
  body?: string;
  subjects?: string[];
  constraintNote?: string;
  writerNote?: string;
  terms?: string[];
  revealChapter?: number;
}

export interface FactRemoveOp {
  op: 'fact.remove';
  factKey: string;
}

/**
 * The Ideation Studio sheet edit. `fields` and `provenance` merge per
 * key — a `null` value clears that key, which is what makes the captured inverse exact; the three
 * collection columns replace wholesale.
 */
/** `turnOrdinal` is the apply engine's to fill in — the model names the source, the server knows the turn. */
interface SeedProvenanceInput {
  source: Ideation.FieldSource;
  turnOrdinal?: number | null;
}

/**
 * A card as it arrives on a re-sent collection. `id` is optional on the wire only: the model is asked to
 * echo the server's id verbatim, and the applier stamps a fresh one on any card that arrives without a
 * recognised one, so an id never vanishes from the stored column.
 */
export type ConceptCardInput = Omit<Ideation.ConceptCard, 'id'> & { id?: string };

export interface SeedUpdateOp {
  op: 'seed.update';
  fields?: { [K in keyof Ideation.SeedFields]?: Ideation.SeedFields[K] | null };
  provenance?: Record<string, SeedProvenanceInput | null>;
  constraints?: Ideation.SeedConstraint[];
  concepts?: ConceptCardInput[];
  tasteAnchors?: Ideation.TasteAnchors;
}

// Action ops drive the pipeline through existing service code. They carry no
// artifact refs, no baseline, and no inverse — they execute post-commit and their outcome lands in
// the proposal's opResults, never in domain tables directly.
interface GenerateChaptersAction {
  op: 'action.generate_chapters';
  count: number;
}

interface PlanVolumesAction {
  op: 'action.plan_volumes';
  volumeCount: number;
  chaptersPerVolume: number;
}

interface PlanArcsAction {
  op: 'action.plan_arcs';
  volumeKey: string;
  arcCount?: number;
}

interface OutlineArcAction {
  op: 'action.outline_arc';
  arcKey: string;
}

interface AuditBibleAction {
  op: 'action.audit_bible';
}

interface EnhancePremiseAction {
  op: 'action.enhance_premise';
  overview?: string;
}

interface JudgeDraftAction {
  op: 'action.judge_draft';
  chapter: number;
}

interface ReviseDraftAction {
  op: 'action.revise_draft';
  chapter: number;
  note: string;
}

interface ApproveDraftAction {
  op: 'action.approve_draft';
  chapter: number;
}

interface ApproveVolumePlanAction {
  op: 'action.approve_volume_plan';
}

interface ApproveArcsAction {
  op: 'action.approve_arcs';
  volumeKey: string;
}

interface ValidateAction {
  op: 'action.validate';
  scope: 'novel' | 'chapter';
  chapter?: number;
}

interface FinalizeAction {
  op: 'action.finalize';
  upTo?: number;
}

interface GraduateSeedAction {
  op: 'action.graduate_seed';
  title: string;
}

export type ContentOp =
  | PremiseUpdateOp
  | BibleDocumentUpsertOp
  | BibleDocumentRemoveOp
  | VolumeUpsertOp
  | VolumeRemoveOp
  | ArcUpsertOp
  | ArcRemoveOp
  | BriefUpdateOp
  | BriefRemoveOp
  | DraftUpdateOp
  | DraftRemoveOp
  | EntityUpsertOp
  | EntityRemoveOp
  | FactUpsertOp
  | FactRemoveOp
  | SeedUpdateOp;

export type ActionOp =
  | GenerateChaptersAction
  | PlanVolumesAction
  | PlanArcsAction
  | OutlineArcAction
  | AuditBibleAction
  | EnhancePremiseAction
  | JudgeDraftAction
  | ReviseDraftAction
  | ApproveDraftAction
  | ApproveVolumePlanAction
  | ApproveArcsAction
  | ValidateAction
  | FinalizeAction
  | GraduateSeedAction;

/** Rationale is metadata about the change, not part of it: it reaches the author beside the op and is stripped before any applier sees it, so `ContentOp` — the shape inverses are captured as — deliberately lacks it. */
export type ChangeOp = (ContentOp | ActionOp) & { rationale?: string };
export type OpType = ChangeOp['op'];
export type ActionType = ActionOp['op'];

type FieldKind = 'string' | 'number' | 'string[]' | 'object' | 'object[]' | 'object|null';
interface OpSpec {
  required: Record<string, FieldKind>;
  optional: Record<string, FieldKind>;
  /** Merge or lifecycle semantics the field list cannot show; rendered into the op vocabulary verbatim. */
  description?: string;
}

const BRIEF_WRITE_MODES = ['standard', 'external'];
const BIBLE_SECTIONS = ['project', 'world', 'power', 'plot', 'story_state', 'ai', 'lore'];
const ENTITY_TYPES = ['character', 'faction', 'location', 'power_rule', 'item', 'concept'];
const SEED_COLUMNS = ['fields', 'provenance', 'constraints', 'concepts', 'tasteAnchors'] as const;
const SEED_FIELD_KEYS = ['genre', 'themes', 'premise', 'hook', 'castShape', 'progressionSystem', 'protagonistDrive', 'stakes', 'serializationNotes', 'voice', 'workingTitle'];
const SEED_FIELD_SOURCES = ['author', 'studio', 'crossed'];
const SEED_CONSTRAINT_KINDS = ['shape', 'scope', 'promise'];
const SEED_CONSTRAINT_LOCKED_BY = ['author', 'inferred'];
// 'offered' is a legal emission, not just a persisted state: the column replaces wholesale, so every
// re-send of the collection carries the cards the author has not judged yet — and un-judging one back
// to 'offered' is a verdict the author is allowed to take back.
const SEED_CONCEPT_FATES = ['offered', 'kept', 'killed', 'crossed'];

const DECLARED_OP_SPECS: Record<OpType, OpSpec> = {
  'premise.update': { required: {}, optional: { title: 'string', premise: 'string', brief: 'string', themes: 'string[]', instructions: 'string' } },
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
    optional: {
      title: 'string',
      body: 'string',
      writeMode: 'string',
      volumeKey: 'string',
      arcKey: 'string',
      contextRefs: 'string[]',
      endingContract: 'object',
      knowledgeContract: 'object|null',
    },
    description: `writeMode (one of: ${BRIEF_WRITE_MODES.join(' | ')}) governs batch selection: "external" halts the primary writer's batch at that chapter until it is finalized.`,
  },
  'brief.remove': { required: { chapter: 'number' }, optional: {} },
  'draft.update': { required: { chapter: 'number' }, optional: { title: 'string', body: 'string', summary: 'string' } },
  'draft.remove': { required: { chapter: 'number' }, optional: {} },
  'entity.upsert': {
    required: { entityKey: 'string', type: 'string' },
    optional: { name: 'string', status: 'string', motivation: 'string', notes: 'string', body: 'string' },
  },
  'entity.remove': { required: { entityKey: 'string' }, optional: {} },
  'fact.upsert': {
    required: { factKey: 'string' },
    optional: { body: 'string', subjects: 'string[]', constraintNote: 'string', writerNote: 'string', terms: 'string[]', revealChapter: 'number' },
  },
  'fact.remove': { required: { factKey: 'string' }, optional: {} },
  'seed.update': {
    required: {},
    optional: { fields: 'object', provenance: 'object', constraints: 'object[]', concepts: 'object[]', tasteAnchors: 'object' },
    description:
      'edit the story seed sheet. Only the top-level keys you send are touched; the rest of the sheet is left alone. Inside "fields" and "provenance" the merge is per key — send only the entries you are changing, and send a key with the value null to clear it. "constraints", "concepts", and "tasteAnchors" replace their whole column, so send the complete list every time you change one. A provenance entry is {"source": "author" | "studio" | "crossed"} — the turn it was settled on is recorded for you.',
  },
  'action.generate_chapters': { required: { count: 'number' }, optional: {} },
  'action.plan_volumes': { required: { volumeCount: 'number', chaptersPerVolume: 'number' }, optional: {} },
  'action.plan_arcs': { required: { volumeKey: 'string' }, optional: { arcCount: 'number' } },
  'action.outline_arc': { required: { arcKey: 'string' }, optional: {} },
  'action.audit_bible': { required: {}, optional: {} },
  'action.enhance_premise': { required: {}, optional: { overview: 'string' } },
  'action.judge_draft': { required: { chapter: 'number' }, optional: {} },
  'action.revise_draft': { required: { chapter: 'number', note: 'string' }, optional: {} },
  'action.approve_draft': { required: { chapter: 'number' }, optional: {} },
  'action.approve_volume_plan': { required: {}, optional: {} },
  'action.approve_arcs': { required: { volumeKey: 'string' }, optional: {} },
  'action.validate': { required: { scope: 'string' }, optional: { chapter: 'number' } },
  'action.finalize': { required: {}, optional: { upTo: 'number' } },
  'action.graduate_seed': { required: { title: 'string' }, optional: {} },
};

// Rationale is metadata about an op rather than a field of the artifact, so it rides on every op and apply drops it — derived, so a newly declared op cannot be the one that refuses it.
const OP_SPECS = Object.fromEntries(
  (Object.entries(DECLARED_OP_SPECS) as [OpType, OpSpec][]).map(([op, spec]): [OpType, OpSpec] => [op, { ...spec, optional: { ...spec.optional, rationale: 'string' } }]),
) as Record<OpType, OpSpec>;

const OP_TYPES = Object.keys(OP_SPECS) as OpType[];
export const ACTION_TYPES = OP_TYPES.filter(op => op.startsWith('action.')) as ActionType[];
export const CONTENT_OP_TYPES: readonly OpType[] = OP_TYPES.filter(op => !op.startsWith('action.'));
// Graduation belongs to the studio alone: a hub project has already graduated, so offering it there is
// an action the model can only fail with (IDE_001).
export const HUB_ACTION_TYPES = ACTION_TYPES.filter(action => action !== 'action.graduate_seed');
const VALIDATION_SCOPES = ['novel', 'chapter'];

// What each action does, rendered into the hub playbook so the model picks actions by meaning, not by
// guessing from the name.
const ACTION_PURPOSES: Record<ActionType, string> = {
  'action.generate_chapters': 'enqueue prose generation for the next `count` chapters (drafted, judged, and queued for review)',
  'action.plan_volumes': 'generate or regenerate the multi-volume story plan from the premise and bible',
  'action.plan_arcs': 'run the arc planner for one volume — stages an arc-plan proposal covering its chapter range',
  'action.outline_arc': 'outline chapter briefs for every chapter of an approved arc',
  'action.audit_bible': 'audit the story bible for missing/pointless documents — stages a bible-audit proposal',
  'action.enhance_premise': 'evaluate and strengthen the premise as a web novel — stages a premise proposal',
  'action.judge_draft': 'run the continuity judge on one chapter draft',
  'action.revise_draft': 'revise one chapter draft using `note` as the revision feedback',
  'action.approve_draft': 'approve one reviewed chapter draft',
  'action.approve_volume_plan': 'approve the volume plan (locks volume chapter ranges)',
  'action.approve_arcs': 'approve all arcs of one volume (unlocks outlining)',
  'action.validate': 'run continuity validation over the novel or one chapter',
  'action.finalize': 'finalize drafted chapters into locked canon — irreversible, never auto-applied',
  'action.graduate_seed':
    'turn the story seed into a novel under `title` — writes the premise and reader-promise bible documents, keeps the named betrayals as canon facts, and ends the studio conversation. Propose it only when the author says they are ready to start the novel; it is never auto-applied',
};

export function isActionOp(op: ChangeOp): op is ActionOp;
export function isActionOp(op: OpType): boolean;
export function isActionOp(op: ChangeOp | OpType): boolean {
  return (typeof op === 'string' ? op : op.op).startsWith('action.');
}

function isKind(value: unknown, kind: FieldKind): boolean {
  if (kind === 'string') return typeof value === 'string';
  if (kind === 'number') return typeof value === 'number' && Number.isInteger(value);
  if (kind === 'string[]') return Array.isArray(value) && value.every(v => typeof v === 'string');
  if (kind === 'object[]') return Array.isArray(value) && value.every(v => typeof v === 'object' && v !== null && !Array.isArray(v));
  if (kind === 'object|null' && value === null) return true;
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateEndingContract(value: unknown, path: string, errors: string[]): void {
  if (!isKind(value, 'object')) return void errors.push(`${path}: endingContract must be an object`);
  const contract = value as Record<string, unknown>;
  if (typeof contract['hookType'] !== 'string' || !(HOOK_TYPES as readonly string[]).includes(contract['hookType']))
    errors.push(`${path}: endingContract.hookType must be one of ${HOOK_TYPES.join(', ')}`);
  for (const key of ['emotionalBeat', 'openQuestion', 'handoffState']) {
    if (typeof contract[key] !== 'string' || contract[key] === '') errors.push(`${path}: endingContract.${key} must be a non-empty string`);
  }
  if (contract['mustNotResolve'] !== undefined && !isKind(contract['mustNotResolve'], 'string[]')) errors.push(`${path}: endingContract.mustNotResolve must be a string array`);
}

function validateKnowledgeContract(value: unknown, path: string, errors: string[]): void {
  if (!isKind(value, 'object')) return void errors.push(`${path}: knowledgeContract must be an object`);
  const contract = value as Record<string, unknown>;
  for (const key of Object.keys(contract)) {
    if (key !== 'pov' && key !== 'learns') errors.push(`${path}: unexpected field 'knowledgeContract.${key}'`);
  }

  const pov = contract['pov'];
  if (!isKind(pov, 'string[]') || (pov as string[]).length === 0 || (pov as string[]).some(key => key === '')) {
    errors.push(`${path}: knowledgeContract.pov must be a non-empty array of entity keys`);
  }

  const learns = contract['learns'];
  if (learns === undefined) return;
  if (!Array.isArray(learns)) return void errors.push(`${path}: knowledgeContract.learns must be an array`);
  learns.forEach((reveal, index) => {
    const at = `${path}: knowledgeContract.learns[${index}]`;
    if (!isKind(reveal, 'object')) return void errors.push(`${at} must be an object`);
    const record = reveal as Record<string, unknown>;
    for (const key of ['entityKey', 'factKey']) {
      if (typeof record[key] !== 'string' || record[key] === '') errors.push(`${at}.${key} must be a non-empty string`);
    }
    for (const key of Object.keys(record)) {
      if (key !== 'entityKey' && key !== 'factKey') errors.push(`${at}: unexpected field '${key}'`);
    }
  });
}

function validateSeedFields(value: Record<string, unknown>, path: string, errors: string[]): void {
  for (const [key, entry] of Object.entries(value)) {
    if (!SEED_FIELD_KEYS.includes(key)) errors.push(`${path}: unknown sheet field 'fields.${key}'`);
    if (entry === null) continue;
    if (key === 'themes') {
      if (!isKind(entry, 'string[]') || (entry as string[]).some(theme => theme.trim() === '')) errors.push(`${path}: fields.themes must be an array of non-empty strings or null`);
      continue;
    }
    if (typeof entry !== 'string' || entry.trim() === '') errors.push(`${path}: fields.${key} must be a non-empty string or null`);
  }
}

function validateSeedProvenance(value: Record<string, unknown>, path: string, errors: string[]): void {
  for (const [key, entry] of Object.entries(value)) {
    if (!SEED_FIELD_KEYS.includes(key)) errors.push(`${path}: unknown sheet field 'provenance.${key}'`);
    if (entry === null) continue;
    if (!isKind(entry, 'object')) {
      errors.push(`${path}: provenance.${key} must be an object or null`);
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (!SEED_FIELD_SOURCES.includes(record['source'] as string)) errors.push(`${path}: provenance.${key}.source must be one of ${SEED_FIELD_SOURCES.join(', ')}`);
    if (record['turnOrdinal'] !== undefined && !isKind(record['turnOrdinal'], 'number')) errors.push(`${path}: provenance.${key}.turnOrdinal must be an integer`);
    for (const field of Object.keys(record)) {
      if (field !== 'source' && field !== 'turnOrdinal') errors.push(`${path}: unexpected field 'provenance.${key}.${field}'`);
    }
  }
}

function validateItems(items: unknown[], path: string, validate: (record: Record<string, unknown>, at: string) => void): void {
  items.forEach((item, index) => validate(item as Record<string, unknown>, `${path}[${index}]`));
}

function requireStrings(record: Record<string, unknown>, keys: string[], at: string, errors: string[]): void {
  for (const key of keys) {
    if (typeof record[key] !== 'string' || record[key] === '') errors.push(`${at}.${key} must be a non-empty string`);
  }
}

function validateSeedUpdate(record: Record<string, unknown>, path: string, errors: string[]): void {
  if (SEED_COLUMNS.every(column => record[column] === undefined)) return void errors.push(`${path}: seed.update must set at least one of ${SEED_COLUMNS.join(', ')}`);

  // `fields`/`provenance` merge per key, so an empty object is a genuine no-op (a revision bump with
  // nothing changed) rather than the "clear everything" a wholesale-replace column would mean.
  for (const column of ['fields', 'provenance'] as const) {
    const value = record[column];
    if (value !== undefined && isKind(value, 'object') && Object.keys(value as Record<string, unknown>).length === 0) {
      errors.push(`${path}: ${column} must not be empty when provided`);
    }
  }

  if (isKind(record['fields'], 'object')) validateSeedFields(record['fields'] as Record<string, unknown>, path, errors);
  if (isKind(record['provenance'], 'object')) validateSeedProvenance(record['provenance'] as Record<string, unknown>, path, errors);

  if (isKind(record['constraints'], 'object[]')) {
    validateItems(record['constraints'] as unknown[], `${path}: constraints`, (constraint, at) => {
      requireStrings(constraint, ['key', 'text'], at, errors);
      if (!SEED_CONSTRAINT_KINDS.includes(constraint['kind'] as string)) errors.push(`${at}.kind must be one of ${SEED_CONSTRAINT_KINDS.join(', ')}`);
      if (!SEED_CONSTRAINT_LOCKED_BY.includes(constraint['lockedBy'] as string)) errors.push(`${at}.lockedBy must be one of ${SEED_CONSTRAINT_LOCKED_BY.join(', ')}`);
    });
  }

  if (isKind(record['concepts'], 'object[]')) {
    validateItems(record['concepts'] as unknown[], `${path}: concepts`, (card, at) => {
      requireStrings(card, ['title', 'logline', 'engine', 'ladder', 'posture'], at, errors);
      for (const key of ['id', 'hookLine'] as const) {
        if (card[key] !== undefined && (typeof card[key] !== 'string' || card[key] === '')) errors.push(`${at}.${key} must be a non-empty string when provided`);
      }
      if (!isKind(card['round'], 'number')) errors.push(`${at}.round must be an integer`);
      if (!SEED_CONCEPT_FATES.includes(card['fate'] as string)) errors.push(`${at}.fate must be one of ${SEED_CONCEPT_FATES.join(', ')}`);
    });
  }

  const anchors = record['tasteAnchors'];
  if (!isKind(anchors, 'object')) return;
  const { comps, preferences } = anchors as Record<string, unknown>;
  if (!isKind(comps, 'string[]')) errors.push(`${path}: tasteAnchors.comps must be a string array`);
  if (!isKind(preferences, 'string[]')) errors.push(`${path}: tasteAnchors.preferences must be a string array`);
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
 * The Story Bible screen lists `entities`, never document bodies, so canon written only as prose into an
 * entity-bearing section is invisible to the author and to every downstream step that reads records.
 * `requiredEntityTypesForSlug` decides what a given address owes, which is what catches an author-named
 * document like `power/supers-and-rifts`. Frontmatter-only edits are exempt, and the rule stays silent for a
 * scope whose vocabulary cannot express `entity.upsert` at all — that scope could never satisfy it.
 */
function validateEntityMaterialization(ops: readonly unknown[], allowedOps?: readonly OpType[]): string[] {
  if (allowedOps && !allowedOps.includes('entity.upsert')) return [];

  const records = ops.filter((op): op is Record<string, unknown> => isKind(op, 'object'));
  const staged = new Set(records.filter(op => op['op'] === 'entity.upsert').map(op => String(op['type'])));
  const errors: string[] = [];

  ops.forEach((item, index) => {
    if (!isKind(item, 'object')) return;
    const op = item as Record<string, unknown>;
    if (op['op'] !== 'bible_document.upsert') return;
    if (typeof op['body'] !== 'string' || op['body'].trim() === '') return;

    const section = String(op['section']);
    const slug = String(op['slug']);
    const required = requiredEntityTypesForSlug(section, slug);
    if (required.length === 0 || required.some(type => staged.has(type))) return;

    errors.push(
      `changeSet[${index}]: bible_document.upsert into '${section}/${slug}' establishes canon the Story Bible reads as records, so it must be accompanied by entity.upsert op(s) of type ${required.join(' or ')} — a document body alone leaves this canon invisible`,
    );
  });

  return errors;
}

export interface ChangeSetValidationOptions {
  /** `false` only for a change-set that rearranges prose the bible already holds, and so cannot be the one that leaves canon unrecorded. */
  entityMaterialization?: boolean;
  /** True only for a Blueprint lock, the one caller allowed to write the fields in `BLUEPRINT_ONLY_FIELDS`. */
  blueprintLock?: boolean;
}

/**
 * Fields only a Blueprint lock may set. The working title is an effect of the `title` decision: any other scope writing it would move
 * `projects.title` away from the ledger entry that named the novel with nothing superseded, so the title and the Notebook would
 * disagree with no record of why. `renderOpVocabulary` hides these fields, so no scope is ever shown a field it would be refused.
 */
export const BLUEPRINT_ONLY_FIELDS: Partial<Record<OpType, readonly string[]>> = { 'premise.update': ['title'] };

/**
 * Validates an untrusted change-set structurally, optionally against a scope's allowed-op vocabulary.
 * Returns human-readable errors; an empty array means `value` is a well-formed `ChangeOp[]`.
 * Obviously-malformed-but-unambiguous bible_document refs are normalized in place first (see above),
 * so every staging and apply path repairs them consistently.
 */
export function validateChangeSet(value: unknown, allowedOps?: readonly OpType[], options?: ChangeSetValidationOptions): string[] {
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
    if (op === 'brief.update' && record['writeMode'] !== undefined && !BRIEF_WRITE_MODES.includes(record['writeMode'] as string))
      errors.push(`${path}: writeMode must be one of ${BRIEF_WRITE_MODES.join(', ')}`);
    if (op === 'brief.update' && record['endingContract'] !== undefined) validateEndingContract(record['endingContract'], path, errors);
    if (op === 'brief.update' && record['knowledgeContract'] != null) validateKnowledgeContract(record['knowledgeContract'], path, errors);
    if (op === 'fact.upsert' && typeof record['revealChapter'] === 'number' && record['revealChapter'] < 1) errors.push(`${path}: revealChapter must be >= 1`);
    if (op === 'arc.upsert' && typeof record['chapterStart'] === 'number' && typeof record['chapterEnd'] === 'number' && record['chapterStart'] > record['chapterEnd']) {
      errors.push(`${path}: chapterStart must be <= chapterEnd`);
    }
    if (op === 'draft.update' && record['title'] === undefined && record['body'] === undefined && record['summary'] === undefined) {
      errors.push(`${path}: draft.update must set at least one of title, body, summary`);
    }
    if (options?.blueprintLock !== true) {
      for (const field of BLUEPRINT_ONLY_FIELDS[op as OpType] ?? []) {
        if (record[field] !== undefined) errors.push(`${path}: field '${field}' is not allowed for this scope`);
      }
    }
    if (op === 'seed.update') validateSeedUpdate(record, path, errors);
    if (op === 'action.validate' && !VALIDATION_SCOPES.includes(record['scope'] as string)) errors.push(`${path}: scope must be one of ${VALIDATION_SCOPES.join(', ')}`);
    if (op === 'action.generate_chapters' && typeof record['count'] === 'number' && record['count'] < 1) errors.push(`${path}: count must be >= 1`);
    if (op === 'action.graduate_seed' && typeof record['title'] === 'string' && record['title'].trim() === '') errors.push(`${path}: title must be a non-empty string`);
  });

  if (errors.length === 0 && options?.entityMaterialization !== false) errors.push(...validateEntityMaterialization(value, allowedOps));

  return errors;
}

/**
 * What a plugin may propose: what the novel contains, never its structure. An arc's
 * narrative fields place a beat at a chapter; its chapter range, ordinal, and volume — and a brief's arc and
 * volume — are the book's skeleton, which only an explicit author action rearranges.
 */
export const PLUGIN_ALLOWED_OPS: readonly OpType[] = [
  'entity.upsert',
  'entity.remove',
  'fact.upsert',
  'fact.remove',
  'bible_document.upsert',
  'bible_document.remove',
  'brief.update',
  'arc.upsert',
];

const ARC_SKELETON_FIELDS = ['ordinal', 'chapterStart', 'chapterEnd'] as const;
const BRIEF_PARENT_FIELDS = ['volumeKey', 'arcKey'] as const;

/** The plugin allowlist enforced against the real `OP_SPECS`, because a plugin's emitted ops are untrusted input at runtime. */
export function validatePluginChangeSet(value: unknown): string[] {
  const errors = validateChangeSet(value, PLUGIN_ALLOWED_OPS);
  if (!Array.isArray(value)) return errors;

  value.forEach((item, index) => {
    if (!isKind(item, 'object')) return;
    const record = item as Record<string, unknown>;
    const refused = record['op'] === 'arc.upsert' ? ARC_SKELETON_FIELDS : record['op'] === 'brief.update' ? BRIEF_PARENT_FIELDS : [];
    for (const field of refused) {
      if (record[field] !== undefined) errors.push(`changeSet[${index}]: field '${field}' is not allowed for this scope`);
    }
  });

  return errors;
}

const RATIONALE_NOTE =
  'rationale, on any op, is one short sentence saying why that change is being made. It is shown to the author beside the op when they review the proposal and is never written into the story itself.';

/**
 * Renders the exact JSON shape of each allowed op for prompt use — weak local models return
 * malformed change-sets when the vocabulary is named but never shown.
 */
export function renderOpVocabulary(ops: readonly OpType[]): string {
  const lines = ops.map(op => {
    const spec = OP_SPECS[op];
    const hidden = BLUEPRINT_ONLY_FIELDS[op] ?? [];
    const required = Object.entries(spec.required).map(([key, kind]) => `"${key}": <${kind}, required>`);
    const optional = Object.entries(spec.optional)
      .filter(([key]) => !hidden.includes(key))
      .map(([key, kind]) => `"${key}": <${kind}, optional>`);
    return `- {"op": "${op}"${[...required, ...optional].map(f => `, ${f}`).join('')}}${spec.description ? ` — ${spec.description}` : ''}`;
  });
  const contractShape = ops.includes('brief.update')
    ? `\nendingContract, when present, must be exactly: {"hookType": <one of: ${HOOK_TYPES.join(' | ')}>, "emotionalBeat": <non-empty string>, "openQuestion": <non-empty string>, "handoffState": <non-empty string>, "mustNotResolve": <string[], optional>} — hookType is an enum, never free text.`
    : '';
  const knowledgeShape = ops.includes('brief.update')
    ? `\nknowledgeContract, when present, must be exactly: {"pov": <non-empty array of entity keys>, "learns": <optional array of {"entityKey": <string>, "factKey": <string>}>} — pov bounds what the chapter may state; learns names the facts discovered on-page. A chapter that reveals nothing previously hidden omits the contract entirely; pass null to drop one the brief already carries.`
    : '';
  const factRules = ops.includes('fact.upsert')
    ? '\nCanon facts are the spoiler ledger: a truth the reader must not learn yet goes in fact.upsert body and NEVER in bible prose, an entity sheet, or a brief — those are visible to the drafter. constraintNote is an author-only note the drafter never sees; writerNote is the writer-safe instruction the drafter gets while the fact is hidden — it must never state or hint at the truth, and without one the fact is withheld from the drafter entirely; terms are the give-away names and phrases the leak scan blocks. In a mystery the reveal schedule IS the plot, so place each reveal deliberately: set revealChapter as the intended beat and stage the matching brief.update knowledgeContract.learns that pays it off.'
    : '';
  return `changeSet, when present, must be an ARRAY of operation objects. Allowed operations and their fields:\n${lines.join('\n')}\n${RATIONALE_NOTE}${contractShape}${knowledgeShape}${factRules}`;
}

/** Action shapes + what each one does — the pipeline half of the hub playbook. */
export function renderActionVocabulary(actions: readonly ActionType[]): string {
  const lines = actions.map(action => {
    const spec = OP_SPECS[action];
    const required = Object.entries(spec.required).map(([key, kind]) => `"${key}": <${kind}, required>`);
    const optional = Object.entries(spec.optional).map(([key, kind]) => `"${key}": <${kind}, optional>`);
    return `- {"op": "${action}"${[...required, ...optional].map(f => `, ${f}`).join('')}} — ${ACTION_PURPOSES[action]}`;
  });
  return `Action operations may appear in the same changeSet array; they run the pipeline instead of editing content. Use one only when the author asks for that work to happen:\n${lines.join('\n')}`;
}

/** The artifact refs a change-set touches — the keys used for baselines, conflict checks, and supersession. Actions touch none. */
export function changeSetRefs(ops: ChangeOp[]): string[] {
  const refs = ops.flatMap(op => {
    if (isActionOp(op)) return [];
    if (op.op === 'premise.update') return ['premise'];
    if (op.op === 'bible_document.upsert' || op.op === 'bible_document.remove') return [`doc:${op.section}/${op.slug}`];
    if (op.op === 'volume.upsert' || op.op === 'volume.remove') return [`volume:${op.volumeKey}`];
    if (op.op === 'arc.upsert' || op.op === 'arc.remove') return [`arc:${op.arcKey}`];
    if (op.op === 'entity.upsert' || op.op === 'entity.remove') return [`entity:${op.entityKey}`];
    if (op.op === 'fact.upsert' || op.op === 'fact.remove') return [`fact:${op.factKey}`];
    if (op.op === 'draft.update' || op.op === 'draft.remove') return [`draft:${op.chapter}`];
    if (op.op === 'seed.update') return ['seed'];
    return [`chapter:${op.chapter}`];
  });
  return [...new Set(refs)];
}
