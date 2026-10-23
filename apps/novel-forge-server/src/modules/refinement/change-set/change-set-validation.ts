import { AppErrorCode } from '@server/classes';
import { validateBriefScenes, validateUnlockCondition } from '@server/common';

import { HOOK_TYPES } from '../../ai/schemas/enums';
import { requiredEntityTypesForSlug } from '../../bible/bible-manifest';
import { type ChangeOp, type OpType } from './change-set.types';
import {
  BIBLE_SECTIONS,
  BRIEF_WRITE_MODES,
  CONTENT_MODES,
  ENTITY_TYPES,
  type FieldKind,
  MILESTONE_KEY,
  MILESTONE_KINDS,
  OP_SPECS,
  PROMISE_KEY,
  PROMISE_KINDS,
  PROMISE_STATUSES,
  VALIDATION_SCOPES,
} from './op-specs';

function isKind(value: unknown, kind: FieldKind): boolean {
  if (value === null && kind.endsWith('|null')) return true;
  if (kind === 'string' || kind === 'string|null') return typeof value === 'string';
  if (kind === 'boolean') return typeof value === 'boolean';
  if (kind === 'number') return typeof value === 'number' && Number.isInteger(value);
  if (kind === 'number|null') return typeof value === 'number' && Number.isInteger(value);
  if (kind === 'string[]' || kind === 'string[]|null') return Array.isArray(value) && value.every(v => typeof v === 'string');
  if (kind === 'object[]' || kind === 'object[]|null') return Array.isArray(value) && value.every(v => typeof v === 'object' && v !== null && !Array.isArray(v));
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

const ANCHOR_COUNTS = ['revision', 'saveSeq', 'start', 'end', 'paragraph'] as const;

function validatePassageRewrite(record: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (typeof record['passage'] === 'string' && record['passage'].trim() === '') errors.push('passage must not be blank');
  if (typeof record['contextIndex'] === 'number' && record['contextIndex'] < 1) errors.push('contextIndex must be >= 1');
  if (record['anchor'] === undefined) return errors;
  const anchor = isKind(record['anchor'], 'object') ? (record['anchor'] as Record<string, unknown>) : {};
  const wellFormed =
    ['draftId', 'passageHash', 'contextBefore', 'contextAfter'].every(field => typeof anchor[field] === 'string') &&
    ANCHOR_COUNTS.every(field => isKind(anchor[field], 'number') && (anchor[field] as number) >= 0) &&
    (anchor['end'] as number) > (anchor['start'] as number);
  if (!wellFormed) errors.push('anchor must be {draftId, revision, saveSeq, start, end, passageHash, paragraph, contextBefore, contextAfter} with end after start');
  return errors;
}

/** Repairs a whole doc ref emitted into `section`/`slug` of bible_document ops (optional `doc:` prefix, embedded `section/slug`) instead of burning a model retry. */
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

/** Prose-only canon in an entity-bearing section is invisible to the Bible, so the edit must carry `entity.upsert`; frontmatter-only edits and scopes lacking it are exempt. */
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
}

/** Structural validation of an untrusted change-set, optionally against a scope's allowed ops, after normalising bible_document refs in place; empty means well-formed. */
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
    if (op === 'brief.update' && typeof record['contentMode'] === 'string' && !CONTENT_MODES.includes(record['contentMode']))
      errors.push(`${path}: contentMode must be one of ${CONTENT_MODES.join(', ')}`);
    if (op === 'brief.update' && Array.isArray(record['scenes'])) errors.push(...validateBriefScenes(record['scenes']).map(error => `${path}: ${error}`));
    if (op === 'brief.update' && Array.isArray(record['claimedMilestones']) && (record['claimedMilestones'] as unknown[]).some(key => typeof key !== 'string' || key.trim() === ''))
      errors.push(`${path}: claimedMilestones must hold non-empty milestone keys`);
    if (op === 'milestone.upsert' && record['kind'] !== undefined && !MILESTONE_KINDS.includes(record['kind'] as string))
      errors.push(`${path}: kind must be one of ${MILESTONE_KINDS.join(', ')}`);
    if (op === 'milestone.upsert' && typeof record['label'] === 'string' && record['label'].trim() === '') errors.push(`${path}: label must not be blank`);
    if (op.startsWith('milestone.') && typeof record['milestoneKey'] === 'string' && !MILESTONE_KEY.test(record['milestoneKey']))
      errors.push(`${path}: milestoneKey must be a non-empty key without spaces`);
    if (op === 'fact.upsert' && typeof record['revealChapter'] === 'number' && record['revealChapter'] < 1) errors.push(`${path}: revealChapter must be >= 1`);
    if (op === 'fact.upsert' && Array.isArray(record['allowedClues']) && (record['allowedClues'] as unknown[]).some(clue => typeof clue !== 'string' || clue.trim() === ''))
      errors.push(`${path}: allowedClues must hold non-empty strings`);
    if (op === 'fact.upsert' && isKind(record['unlock'], 'object')) errors.push(...validateUnlockCondition(record['unlock']).map(error => `${path}: ${error}`));
    if (op === 'draft.update' && record['title'] === undefined && record['body'] === undefined && record['summary'] === undefined) {
      errors.push(`${path}: draft.update must set at least one of title, body, summary`);
    }
    if (op === 'draft.rewrite_passage') errors.push(...validatePassageRewrite(record).map(error => `${path}: ${error}`));
    if (op === 'action.validate' && !VALIDATION_SCOPES.includes(record['scope'] as string)) errors.push(`${path}: scope must be one of ${VALIDATION_SCOPES.join(', ')}`);
    if (op === 'action.generate_chapter' && typeof record['chapter'] === 'number' && record['chapter'] < 1) errors.push(`${path}: chapter must be >= 1`);
    if (op.startsWith('promise.') && !PROMISE_KINDS.includes(record['kind'] as string)) errors.push(`${path}: kind must be one of ${PROMISE_KINDS.join(', ')}`);
    if (op.startsWith('promise.') && typeof record['key'] === 'string' && !PROMISE_KEY.test(record['key'])) errors.push(`${path}: key must be a non-empty key without spaces`);
    if (op === 'promise.create' && typeof record['label'] === 'string' && record['label'].trim() === '') errors.push(`${path}: label must not be blank`);
    if (op === 'promise.update' && record['status'] !== undefined && !PROMISE_STATUSES.includes(record['status'] as string))
      errors.push(`${path}: status must be one of ${PROMISE_STATUSES.join(', ')}`);
    if (op === 'promise.set_payoff' && record['someday'] === true && ['payoffMilestoneKey', 'payoffVolumeKey', 'payoffWindow'].some(field => record[field] !== undefined))
      errors.push(`${path}: someday cannot be combined with payoffMilestoneKey, payoffVolumeKey or payoffWindow`);
  });

  if (errors.length === 0 && options?.entityMaterialization !== false) errors.push(...validateEntityMaterialization(value, allowedOps));

  return errors;
}

export function parseChangeSet(raw: unknown, allowedOps?: readonly OpType[], options?: ChangeSetValidationOptions): ChangeOp[] {
  if (validateChangeSet(raw, allowedOps, options).length > 0) throw AppErrorCode.RFN_004.create();
  return raw as ChangeOp[];
}

/** An empty change-set is how a model says it has nothing to change; anything else must pass `parseChangeSet`. */
export function parseOptionalChangeSet(raw: unknown, allowedOps?: readonly OpType[], options?: ChangeSetValidationOptions): ChangeOp[] {
  if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) return [];
  return parseChangeSet(raw, allowedOps, options);
}

/** What a plugin may propose: what the novel contains, never its structure — a brief's volume, mode, milestones and ending are the book's shape, which only the author rearranges. */
export const PLUGIN_ALLOWED_OPS: readonly OpType[] = [
  'entity.upsert',
  'entity.remove',
  'fact.upsert',
  'fact.remove',
  'bible_document.upsert',
  'bible_document.remove',
  'brief.update',
];

const BRIEF_STRUCTURE_FIELDS = ['volumeKey', 'contentMode', 'claimedMilestones', 'isEnding'] as const;

/** The plugin allowlist enforced against the real `OP_SPECS`, because a plugin's emitted ops are untrusted input at runtime. */
export function validatePluginChangeSet(value: unknown): string[] {
  const errors = validateChangeSet(value, PLUGIN_ALLOWED_OPS);
  if (!Array.isArray(value)) return errors;

  value.forEach((item, index) => {
    if (!isKind(item, 'object')) return;
    const record = item as Record<string, unknown>;
    const refused = record['op'] === 'brief.update' ? BRIEF_STRUCTURE_FIELDS : [];
    for (const field of refused) {
      if (record[field] !== undefined) errors.push(`changeSet[${index}]: field '${field}' is not allowed for this scope`);
    }
  });

  return errors;
}
