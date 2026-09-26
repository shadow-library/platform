import { createHash } from 'node:crypto';

import { isWriterExcludedBibleDoc } from '../ai/context/bible-docs';
import { type ChangeOp, type ContentOp, declaredOpFields, isActionOp } from './change-set';
import { normaliseForQuote } from './write-policy';

export const IDEA_ID_PATTERN = /^[0-9a-f]{24}$/;

const LABEL_MAX_CHARS = 240;

function canonical(value: unknown): unknown {
  if (typeof value === 'string') return normaliseForQuote(value);
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort()
      .map(key => [key, canonical(record[key])]),
  );
}

/**
 * The same change proposed twice gets the same id: a hash of the op kind and its declared fields, with text normalised as quotes are
 * (case, whitespace, typography) and metadata — rationale, quote, stamps — left out. Rewording the idea makes it a different one.
 */
export function ideaIdOf(op: ChangeOp): string {
  const fields = op as unknown as Record<string, unknown>;
  const content = Object.fromEntries(declaredOpFields(op.op).map(field => [field, fields[field]]));
  const digest = createHash('sha256')
    .update(JSON.stringify(canonical({ op: op.op, ...content })))
    .digest('hex');
  return digest.slice(0, 24);
}

/** Every content op carries its idea id; an action runs the pipeline rather than offering an idea, so it carries none. */
export function stampIdeaIds(ops: readonly ChangeOp[]): ChangeOp[] {
  return ops.map(op => {
    const { ideaId: _ideaId, ...rest } = op;
    return isActionOp(op) ? (rest as ChangeOp) : ({ ...rest, ideaId: ideaIdOf(op) } as ChangeOp);
  });
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > LABEL_MAX_CHARS ? `${flat.slice(0, LABEL_MAX_CHARS - 1)}…` : flat;
}

function withText(head: string, ...texts: (string | null | undefined)[]): string {
  const text = texts.find(candidate => typeof candidate === 'string' && candidate.trim() !== '');
  return text ? `${head}: ${clip(text)}` : head;
}

/**
 * How a turned-down idea reads in the Notebook and to the chat model. A secret's truth, its tells and a planner-only page's body never
 * appear — only what names the record — so the label can ride in any prompt.
 */
export function ideaLabel(op: ContentOp): string {
  switch (op.op) {
    case 'premise.update':
      return withText('Story', op.premise, op.brief, op.themes?.join(', '), op.instructions);
    case 'bible_document.upsert':
      return isWriterExcludedBibleDoc({ section: op.section, slug: op.slug }) ? `Page ${op.section}/${op.slug}` : withText(`Page ${op.section}/${op.slug}`, op.body);
    case 'bible_document.remove':
      return `Remove page ${op.section}/${op.slug}`;
    case 'volume.upsert':
      return withText(`Volume ${op.volumeKey}`, op.title, op.objective);
    case 'volume.remove':
      return `Remove volume ${op.volumeKey}`;
    case 'brief.update':
      return withText(`Plan for chapter ${op.chapter}`, op.title, op.chapterPurpose, op.direction);
    case 'brief.remove':
      return `Remove the plan for chapter ${op.chapter}`;
    case 'draft.update':
      return withText(`Rewrite of chapter ${op.chapter}`, op.title);
    case 'draft.remove':
      return `Remove the draft of chapter ${op.chapter}`;
    case 'entity.upsert':
      return withText(`${op.name ?? op.entityKey} (${op.type})`, op.motivation, op.status, op.notes, op.body);
    case 'entity.remove':
      return `Remove ${op.entityKey}`;
    case 'fact.upsert':
      return `Secret ${op.factKey}`;
    case 'fact.remove':
      return `Remove secret ${op.factKey}`;
    case 'milestone.upsert':
      return withText(`Milestone ${op.milestoneKey}`, op.label);
    case 'milestone.remove':
      return `Remove milestone ${op.milestoneKey}`;
    case 'promise.create':
    case 'promise.update':
      return withText(`Promise ${op.key}`, op.label);
    case 'promise.set_payoff':
      return `Payoff for promise ${op.key}`;
    case 'promise.drop':
      return `Drop promise ${op.key}`;
    case 'organise.rule':
      return withText('Rule', op.rule);
  }
}
