import { HOOK_TYPES } from '../../ai/schemas/enums';
import { type OpType } from './change-set.types';
import {
  BIBLE_SECTIONS,
  BRIEF_WRITE_MODES,
  CONTENT_MODES,
  ENTITY_TYPES,
  type FieldKind,
  MILESTONE_KINDS,
  modelHiddenFields,
  OP_SPECS,
  type OpVocabularyOptions,
  PROMISE_KINDS,
  PROMISE_STATUSES,
  VALIDATION_SCOPES,
} from './op-specs';

type WireSchema = Record<string, unknown>;

const NON_BLANK: WireSchema = { type: 'string', minLength: 1 };
const NON_BLANK_LIST: WireSchema = { type: 'array', items: NON_BLANK };
// A subset of MILESTONE_KEY / PROMISE_KEY: Ollama's grammar compiler has no `\S`, and on a pattern it cannot compile it drops the whole schema silently.
const SPACELESS_KEY: WireSchema = { type: 'string', pattern: '^[A-Za-z0-9_.:-]+$' };
const BIBLE_SECTION: WireSchema = { type: 'string', enum: BIBLE_SECTIONS };
const PROMISE_REF: Record<string, WireSchema> = { kind: { type: 'string', enum: PROMISE_KINDS }, key: SPACELESS_KEY };

function wireObject(properties: Record<string, WireSchema>, required: readonly string[]): WireSchema {
  return { type: 'object', properties, required, additionalProperties: false };
}

const WIRE_KINDS: Record<FieldKind, WireSchema> = {
  string: { type: 'string' },
  'string|null': { type: 'string' },
  number: { type: 'integer' },
  'number|null': { type: 'integer' },
  boolean: { type: 'boolean' },
  'string[]': { type: 'array', items: { type: 'string' } },
  'string[]|null': { type: 'array', items: { type: 'string' } },
  object: { type: 'object' },
  'object|null': { type: 'object' },
  'object[]': { type: 'array', items: { type: 'object' } },
  'object[]|null': { type: 'array', items: { type: 'object' } },
};

// The rules `validateChangeSet` checks beyond a field's kind, as JSON Schema. `null` keeps a field off the wire: `volume.upsert.state` is
// only tolerated on read, and an unlock condition is too intricate to type for a model that must get it right under a grammar.
const WIRE_FIELDS: Partial<Record<OpType, Record<string, WireSchema | null>>> = {
  'bible_document.upsert': { section: BIBLE_SECTION },
  'bible_document.remove': { section: BIBLE_SECTION },
  'volume.upsert': { state: null },
  'brief.update': {
    writeMode: { type: 'string', enum: BRIEF_WRITE_MODES },
    contentMode: { type: 'string', enum: CONTENT_MODES },
    endingContract: wireObject(
      { hookType: { type: 'string', enum: [...HOOK_TYPES] }, emotionalBeat: NON_BLANK, openQuestion: NON_BLANK, handoffState: NON_BLANK, mustNotResolve: WIRE_KINDS['string[]'] },
      ['hookType', 'emotionalBeat', 'openQuestion', 'handoffState'],
    ),
    knowledgeContract: wireObject(
      { pov: { ...NON_BLANK_LIST, minItems: 1 }, learns: { type: 'array', items: wireObject({ entityKey: NON_BLANK, factKey: NON_BLANK }, ['entityKey', 'factKey']) } },
      ['pov'],
    ),
    scenes: { type: 'array', items: wireObject({ summary: NON_BLANK, pov: NON_BLANK }, ['summary']) },
    claimedMilestones: NON_BLANK_LIST,
  },
  'entity.upsert': { type: { type: 'string', enum: ENTITY_TYPES } },
  'fact.upsert': { revealChapter: { type: 'integer', minimum: 1 }, unlock: null, allowedClues: NON_BLANK_LIST },
  'milestone.upsert': { milestoneKey: SPACELESS_KEY, label: NON_BLANK, kind: { type: 'string', enum: MILESTONE_KINDS } },
  'milestone.remove': { milestoneKey: SPACELESS_KEY },
  'promise.create': { ...PROMISE_REF, label: NON_BLANK },
  'promise.update': { ...PROMISE_REF, status: { type: 'string', enum: PROMISE_STATUSES } },
  'promise.set_payoff': PROMISE_REF,
  'promise.drop': PROMISE_REF,
  'draft.rewrite_passage': { passage: NON_BLANK, contextIndex: { type: 'integer', minimum: 1 } },
  'action.generate_chapter': { chapter: { type: 'integer', minimum: 1 } },
  'action.validate': { scope: { type: 'string', enum: VALIDATION_SCOPES } },
};

function opWireSchema(op: OpType, options: OpVocabularyOptions): WireSchema {
  const spec = OP_SPECS[op];
  const hidden = modelHiddenFields(op, options);
  const fields = Object.entries({ ...spec.required, ...spec.optional }).filter(([key]) => !hidden.includes(key));
  const properties: Record<string, WireSchema> = { op: { type: 'string', enum: [op] } };
  for (const [key, kind] of fields) {
    const typed = WIRE_FIELDS[op]?.[key];
    if (typed !== null) properties[key] = typed ?? WIRE_KINDS[kind];
  }
  return wireObject(properties, ['op', ...Object.keys(spec.required)]);
}

/**
 * Every allowed op as a typed JSON Schema variant, for a grammar-constrained change-set. Derived from `OP_SPECS` and never looser than it; the
 * rules left to `validateChangeSet` — a draft.update with no field, `someday` beside a payoff, canon without its records — still reach repair.
 */
export function changeSetItemSchema(ops: readonly OpType[], options: OpVocabularyOptions = {}): WireSchema {
  return { anyOf: ops.map(op => opWireSchema(op, options)) };
}
