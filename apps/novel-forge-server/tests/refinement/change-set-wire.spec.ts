import { describe, expect, it } from 'bun:test';

import Ajv from 'ajv';

import { PROGRESS_ITEM_KEYS } from '@server/common';
import { HUB_ALLOWED_OPS } from '@modules/ai/prompts/scope-playbooks';
import { CHAT_QUESTION_WIRE_SCHEMA, sanitizeChatQuestion } from '@modules/refinement/chat-question';
import { ACTION_TYPES, changeSetItemSchema, CONTENT_OP_TYPES, type OpType, validateChangeSet } from '@modules/refinement';

type Json = Record<string, unknown>;

const ALL_OPS: readonly OpType[] = [...CONTENT_OP_TYPES, ...ACTION_TYPES];
const ajv = new Ajv({ allErrors: true, strict: false });
const allOpsSchema = changeSetItemSchema(ALL_OPS, { quotes: true });
const validateOp = ajv.compile({ type: 'array', items: allOpsSchema });
const validateQuestion = ajv.compile(CHAT_QUESTION_WIRE_SCHEMA);
const variants = (allOpsSchema['anyOf'] as Json[]).map(variant => [((variant['properties'] as Json)['op'] as Json)['enum'] as string[], variant] as const);

function sample(schema: Json, full: boolean): unknown {
  if (schema['enum']) return (schema['enum'] as unknown[])[0];
  if (schema['pattern']) return 'key_1';
  if (schema['type'] === 'string') return 'text';
  if (schema['type'] === 'integer') return (schema['minimum'] as number | undefined) ?? 2;
  if (schema['type'] === 'boolean') return true;
  if (schema['type'] === 'array') {
    const items = schema['items'] as Json;
    return Array.from({ length: Math.max((schema['minItems'] as number | undefined) ?? 0, full ? 1 : 0) }, () => sample(items, full));
  }
  const properties = (schema['properties'] ?? {}) as Record<string, Json>;
  const keys = full ? Object.keys(properties) : ((schema['required'] ?? []) as string[]);
  return Object.fromEntries(keys.map(key => [key, sample(properties[key] as Json, full)]));
}

describe('changeSetItemSchema', () => {
  it('should offer one variant per allowed op, in order', () => {
    expect(variants.map(([op]) => op)).toEqual(ALL_OPS.map(op => [op]));
  });

  const leftToRepair = ['draft.update must set at least one of title, body, summary', 'someday cannot be combined with payoffMilestoneKey, payoffVolumeKey or payoffWindow'];
  for (const [label, full] of [
    ['minimal', false],
    ['fullest', true],
  ] as const) {
    it(`should derive variants whose ${label} instances validateChangeSet accepts, bar the two rules left to repair`, () => {
      for (const [[op], variant] of variants) {
        const instance = [sample(variant, full)];
        expect(validateOp(instance)).toBe(true);
        const errors = validateChangeSet(instance, [op as OpType], { entityMaterialization: false });
        expect(errors.filter(error => !leftToRepair.some(rule => error.endsWith(rule)))).toEqual([]);
      }
    });
  }

  it('should refuse what validateChangeSet refuses on a single field', () => {
    expect(validateOp([{ op: 'character.upsert', entityKey: 'mira' }])).toBe(false);
    expect(validateOp([{ op: 'entity.upsert', entityKey: 'mira', type: 'hero' }])).toBe(false);
    expect(validateOp([{ op: 'bible_document.upsert', section: 'project/premise', slug: 'premise' }])).toBe(false);
    expect(validateOp([{ op: 'entity.upsert', entityKey: 'mira', type: 'character', mood: 'grim' }])).toBe(false);
    expect(validateOp([{ op: 'milestone.upsert', milestoneKey: 'two words' }])).toBe(false);
    expect(validateOp([{ op: 'brief.update', chapter: 1.5 }])).toBe(false);
  });

  it('should keep server-stamped fields, and quotes unless asked for, off the wire', () => {
    const [premise] = changeSetItemSchema(['premise.update'])['anyOf'] as Json[];
    const [quoted] = changeSetItemSchema(['premise.update'], { quotes: true })['anyOf'] as Json[];
    const [approve] = changeSetItemSchema(['action.approve_draft'], { quotes: true })['anyOf'] as Json[];
    const [brief] = changeSetItemSchema(['brief.update'])['anyOf'] as Json[];
    expect(Object.keys(premise?.['properties'] as Json)).not.toContain('quote');
    expect(Object.keys(quoted?.['properties'] as Json)).toContain('quote');
    expect(Object.keys(approve?.['properties'] as Json)).toEqual(['op', 'chapter', 'rationale']);
    expect(Object.keys(brief?.['properties'] as Json)).not.toContain('startedEmpty');
    expect(Object.keys(brief?.['properties'] as Json)).not.toContain('ideaId');
  });

  it('should type every op the chat hub may propose', () => {
    expect((changeSetItemSchema(HUB_ALLOWED_OPS)['anyOf'] as Json[]).length).toBe(HUB_ALLOWED_OPS.length);
  });
});

describe('CHAT_QUESTION_WIRE_SCHEMA', () => {
  const card = {
    question: 'Who opposes Mira?',
    why: 'The opposition sets the stakes.',
    answers: [{ title: 'Her mentor', tradeOff: 'Heavier', recommended: true }, { title: 'A rival sect' }],
    progressKey: PROGRESS_ITEM_KEYS[0],
  };

  it('should accept a card that sanitizeChatQuestion keeps whole', () => {
    expect(validateQuestion(card)).toBe(true);
    expect(sanitizeChatQuestion(card, PROGRESS_ITEM_KEYS)).toEqual(card);
  });

  it('should refuse the shapes sanitizeChatQuestion drops', () => {
    expect(validateQuestion({ ...card, answers: [{ title: 'Only one' }] })).toBe(false);
    expect(validateQuestion({ ...card, answers: [{ title: '' }, { title: 'Two' }] })).toBe(false);
    expect(validateQuestion({ ...card, progressKey: 'not-a-check' })).toBe(false);
    expect(validateQuestion({ question: 'Who?' })).toBe(false);
  });
});
