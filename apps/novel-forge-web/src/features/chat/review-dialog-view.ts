import { textDigest } from '@shadow-library/sdk';

import { type ProposalResponse } from '@/lib/apis/api-types.gen';
import { type OrganiseCardEntry, type OrganiseReceipt } from '@/lib/apis/chat.api';
import { type ChatTurnChangeGroup } from '@/lib/apis/refinement.api';
import { isRecord } from '@/lib/is-record';
import { type ChangeOp } from '@/lib/proposals';

import { isActionOp, mixedPagePairs, notesParagraphs, opSubject, opWrittenText, PREMISE_FIELDS, STORY_FIELD_LABELS } from './chat-view';
import { CHANGE_GROUP_LABEL, citation, ENTRY_TAG, entryNote, opChangeGroup } from './progress-panel-view';

export interface OpCurrent {
  index: number;
  exists: boolean;
  values: Record<string, unknown>;
}

export interface DiffSegment {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

export interface ReviewBlock {
  markdown: string;
  added: boolean;
}

export type ReviewContent =
  | { kind: 'markdown'; markdown: string }
  | { kind: 'blocks'; blocks: ReviewBlock[] }
  | { kind: 'fields'; fields: { label: string; value: string; emphasis?: boolean }[] }
  | { kind: 'diff'; fields: { label: string; segments: DiffSegment[] }[] };

export interface ReviewVersion {
  opIndex: number;
  key: 'notes' | 'forge';
  content: ReviewContent;
  addedBlocks: number;
}

export interface ReviewItem {
  key: string;
  opIndexes: number[];
  group: ChatTurnChangeGroup;
  groupLabel: string;
  kindLabel: string;
  title: string;
  cite?: string;
  tag?: string;
  note?: string;
  idea: boolean;
  content: ReviewContent;
  versions?: ReviewVersion[];
  yourWords?: string;
  awaitsCurrent: boolean;
  unchanged: boolean;
}

export interface ReviewItemsInput {
  proposal: Pick<ProposalResponse, 'id' | 'kind' | 'changeSet'>;
  receipt?: OrganiseReceipt;
  current?: readonly OpCurrent[];
  notes?: string;
}

interface FieldSpec {
  key: string;
  label: string;
  emphasis?: boolean;
  format?: (value: string) => string;
  diffOnly?: boolean;
}

const capitalised = (key: string): string => key.charAt(0).toUpperCase() + key.slice(1);

const ENTITY_NOUN: Record<string, string> = {
  character: 'character',
  faction: 'faction',
  location: 'place',
  power_rule: 'power rule',
  item: 'item',
  concept: 'concept',
};

const MILESTONE_KIND_LABEL: Record<string, string> = { rank: 'Rank', event: 'Event', learned_from: 'Learned from', custom: 'Custom' };

const FIELD_SPECS: Record<string, readonly FieldSpec[]> = {
  'entity.upsert': [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Kind', format: value => ENTITY_NOUN[value] ?? value, diffOnly: true },
    { key: 'body', label: 'Who they are' },
    { key: 'motivation', label: 'What they want' },
    { key: 'notes', label: 'Notes' },
    { key: 'status', label: 'Status' },
  ],
  'promise.create': [
    { key: 'label', label: 'The open question', emphasis: true },
    { key: 'status', label: 'Status' },
  ],
  'promise.update': [
    { key: 'label', label: 'The open question', emphasis: true },
    { key: 'status', label: 'Status' },
  ],
  'premise.update': [...PREMISE_FIELDS.map(key => ({ key, label: capitalised(key) })), ...Object.entries(STORY_FIELD_LABELS).map(([key, label]) => ({ key, label }))],
  'bible_document.upsert': [
    { key: 'frontmatter.title', label: 'Title' },
    { key: 'body', label: 'Text' },
  ],
  'volume.upsert': [
    { key: 'title', label: 'Title' },
    { key: 'objective', label: 'Objective' },
    { key: 'body', label: 'Text' },
  ],
  'milestone.upsert': [
    { key: 'label', label: 'Milestone' },
    { key: 'kind', label: 'Kind', format: value => MILESTONE_KIND_LABEL[value] ?? value, diffOnly: true },
  ],
  'fact.upsert': [
    { key: 'body', label: 'Text' },
    { key: 'writerNote', label: 'Writer note' },
    { key: 'constraintNote', label: 'Constraint note' },
  ],
};

const UPSERT_NOUN: Record<string, string | ((op: ChangeOp) => string)> = {
  'bible_document.upsert': 'page',
  'entity.upsert': op => ENTITY_NOUN[String(op.type)] ?? 'entry',
  'fact.upsert': 'fact',
  'volume.upsert': 'volume',
  'milestone.upsert': 'milestone',
  'promise.create': op => (op.kind === 'mystery' ? 'mystery' : 'thread'),
};

const OP_KIND_LABEL: Record<string, string> = {
  'premise.update': 'Updates the story',
  'brief.update': 'Updates a chapter plan',
  'brief.remove': 'Removes a chapter plan',
  'organise.rule': 'New rule',
  'draft.rewrite_passage': 'Rewrites a passage',
  'draft.update': 'Updates a draft',
  'draft.remove': 'Removes a draft',
  'promise.set_payoff': 'Sets a payoff',
  'promise.drop': 'Drops a thread',
  'milestone.remove': 'Removes a milestone',
  'bible_document.remove': 'Removes a page',
  'entity.remove': 'Removes an entry',
  'fact.remove': 'Removes a fact',
  'volume.remove': 'Removes a volume',
};

const CURRENT_OPS: ReadonlySet<string> = new Set(['premise.update', ...Object.keys(UPSERT_NOUN), 'promise.update']);

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function fieldText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').join(', ');
  return undefined;
}

function valueAt(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, part) => (isRecord(value) ? value[part] : undefined), source);
}

function kindLabel(op: ChangeOp, current: OpCurrent | undefined, loaded: boolean): string {
  const type = String(op.op);
  const noun = UPSERT_NOUN[type];
  if (noun !== undefined) {
    const name = typeof noun === 'string' ? noun : noun(op);
    if (!loaded) return capitalised(name);
    return current?.exists === true ? `Updates ${name}` : `New ${name}`;
  }
  if (type === 'promise.update') return `Updates ${op.kind === 'mystery' ? 'mystery' : 'thread'}`;
  return OP_KIND_LABEL[type] ?? type.replace(/[._]/g, ' ');
}

function plainContent(op: ChangeOp): ReviewContent {
  const type = String(op.op);
  if (type === 'bible_document.upsert') return { kind: 'markdown', markdown: text(op.body) ?? opSubject(op) };
  const fields = (FIELD_SPECS[type] ?? []).flatMap(({ key, label, emphasis, diffOnly }) => {
    if (diffOnly) return [];
    const value = fieldText(valueAt(op, key));
    return value ? [{ label, value, ...(emphasis ? { emphasis } : {}) }] : [];
  });
  return fields.length > 0 ? { kind: 'fields', fields } : { kind: 'markdown', markdown: opWrittenText(op) };
}

interface OpContent {
  content: ReviewContent;
  unchanged: boolean;
}

function normalised(value: unknown): unknown {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(normalised);
  if (isRecord(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, normalised(value[key])]),
    );
  return value;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalised(a)) === JSON.stringify(normalised(b));
}

function contentOf(op: ChangeOp, current: OpCurrent | undefined): OpContent {
  const plain = plainContent(op);
  if (!current?.exists || Object.keys(current.values).length === 0) return { content: plain, unchanged: false };
  const fields = (FIELD_SPECS[String(op.op)] ?? []).flatMap(({ key, label, format }) => {
    const show = (value: unknown): string | undefined => {
      const shown = fieldText(value);
      return shown === undefined || !format ? shown : format(shown);
    };
    const after = show(valueAt(op, key));
    if (after === undefined) return [];
    const before = show(valueAt(current.values, key)) ?? '';
    return before === after ? [] : [{ label, segments: wordDiff(before, after) }];
  });
  if (fields.length > 0) return { content: { kind: 'diff', fields }, unchanged: false };
  const unchanged = Object.entries(current.values).every(([key, value]) => op[key] === undefined || sameValue(op[key], value));
  return { content: plain, unchanged };
}

const TOKEN = /\s+|[.,;:!?]|[^\s.,;:!?]+/g;
const MAX_LCS_CELLS = 4_000_000;
const PARAGRAPH_BREAK = /(\n\s*\n)/;

function tokens(value: string): string[] {
  return value.match(TOKEN) ?? [];
}

function paragraphUnits(value: string): string[] {
  const parts = value.split(PARAGRAPH_BREAK);
  const units: string[] = [];
  for (let index = 0; index < parts.length; index += 2) units.push((parts[index] ?? '') + (parts[index + 1] ?? ''));
  return units.filter(Boolean);
}

function sequenceDiff(before: readonly string[], after: readonly string[]): DiffSegment[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  const head: DiffSegment[] = before.slice(0, start).map(text => ({ kind: 'same', text }));
  const tail: DiffSegment[] = before.slice(endBefore).map(text => ({ kind: 'same', text }));
  const a = before.slice(start, endBefore);
  const b = after.slice(start, endAfter);
  if ((a.length + 1) * (b.length + 1) > MAX_LCS_CELLS) {
    return [...head, ...a.map((text): DiffSegment => ({ kind: 'removed', text })), ...b.map((text): DiffSegment => ({ kind: 'added', text })), ...tail];
  }
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  const cell = (row: number, column: number): number => table[row * width + column] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) table[i * width + j] = a[i] === b[j] ? cell(i + 1, j + 1) + 1 : Math.max(cell(i + 1, j), cell(i, j + 1));
  }
  const middle: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      middle.push({ kind: 'same', text: a[i] ?? '' });
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && cell(i + 1, j) >= cell(i, j + 1))) middle.push({ kind: 'removed', text: a[i++] ?? '' });
    else middle.push({ kind: 'added', text: b[j++] ?? '' });
  }
  return [...head, ...middle, ...tail];
}

function mergeSegments(segments: readonly DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    const last = merged[merged.length - 1];
    if (last?.kind === segment.kind) last.text += segment.text;
    else merged.push({ ...segment });
  }
  return merged;
}

function foldRuns(segments: readonly DiffSegment[]): DiffSegment[] {
  const folded: DiffSegment[] = [];
  let removed = '';
  let added = '';
  let inRun = false;
  const flush = (): void => {
    folded.push({ kind: 'removed', text: removed }, { kind: 'added', text: added });
    removed = '';
    added = '';
    inRun = false;
  };
  segments.forEach((segment, index) => {
    if (segment.kind !== 'same') {
      if (segment.kind === 'removed') removed += segment.text;
      else added += segment.text;
      inRun = true;
      return;
    }
    const next = segments[index + 1];
    if (inRun && !segment.text.trim() && next && next.kind !== 'same') {
      removed += segment.text;
      added += segment.text;
      return;
    }
    if (inRun) flush();
    folded.push(segment);
  });
  if (inRun) flush();
  return mergeSegments(folded);
}

export function wordDiff(before: string, after: string): DiffSegment[] {
  const paragraphs = sequenceDiff(paragraphUnits(before), paragraphUnits(after));
  const result: DiffSegment[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = (): void => {
    if (removed.length > 0 && removed.length === added.length) removed.forEach((unit, index) => result.push(...sequenceDiff(tokens(unit), tokens(added[index] ?? ''))));
    else if (removed.length > 0 && added.length > 0) result.push(...sequenceDiff(tokens(removed.join('')), tokens(added.join(''))));
    else result.push({ kind: 'removed', text: removed.join('') }, { kind: 'added', text: added.join('') });
    removed = [];
    added = [];
  };
  for (const segment of paragraphs) {
    if (segment.kind === 'removed') removed.push(segment.text);
    else if (segment.kind === 'added') added.push(segment.text);
    else {
      flush();
      result.push(segment);
    }
  }
  flush();
  return foldRuns(mergeSegments(result));
}

export function addedParagraphs(notesBody: string, forgeBody: string): ReviewBlock[] {
  const split = (body: string): string[] =>
    body
      .split(/\n\s*\n/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean);
  const known = new Set(split(notesBody));
  return split(forgeBody).map(markdown => ({ markdown, added: !known.has(markdown) }));
}

function yourWords(proposalKind: string, op: ChangeOp, entry: OrganiseCardEntry | undefined, input: ReviewItemsInput): string | undefined {
  if (proposalKind !== 'organise') return text(op.quote);
  const { receipt, notes } = input;
  if (!entry?.paragraphs.length || !receipt || notes === undefined || textDigest(notes) !== receipt.notesDigest) return undefined;
  const paragraphs = notesParagraphs(notes);
  const picked = entry.paragraphs.flatMap(number => paragraphs[number - 1] ?? []);
  return picked.length > 0 ? picked.join('\n\n') : undefined;
}

export function reviewItems(input: ReviewItemsInput): ReviewItem[] {
  const { proposal } = input;
  const loaded = input.current !== undefined;
  const entries = new Map((input.receipt?.card ?? []).map(entry => [entry.opIndex, entry]));
  const current = new Map((input.current ?? []).map(entry => [entry.index, entry]));
  const pairs = mixedPagePairs(proposal);
  const wholePages = new Set(pairs.values());
  return proposal.changeSet.flatMap((op, index): ReviewItem[] => {
    if (isActionOp(op) || wholePages.has(index)) return [];
    const entry = entries.get(index);
    const group = opChangeGroup(op);
    const base = {
      key: `${proposal.id}:${index}`,
      group,
      groupLabel: CHANGE_GROUP_LABEL[group],
      kindLabel: kindLabel(op, current.get(index), loaded),
      title: opSubject(op),
      cite: citation(proposal.kind, op, entry),
      yourWords: yourWords(proposal.kind, op, entry, input),
      awaitsCurrent: !loaded && CURRENT_OPS.has(String(op.op)),
    };
    const notesVersion = contentOf(op, current.get(index));
    const wholeIndex = pairs.get(index);
    const wholeOp = wholeIndex === undefined ? undefined : proposal.changeSet[wholeIndex];
    if (wholeIndex === undefined || !wholeOp) {
      return [{ ...base, opIndexes: [index], tag: entry && ENTRY_TAG[entry.label], note: entryNote(entry), idea: entry?.label === 'suggested', ...notesVersion }];
    }
    const wholeEntry = entries.get(wholeIndex);
    const wholeVersion = contentOf(wholeOp, current.get(wholeIndex));
    const blocks = addedParagraphs(text(op.body) ?? '', text(wholeOp.body) ?? '');
    const forgeContent: ReviewContent = wholeVersion.content.kind === 'diff' ? wholeVersion.content : { kind: 'blocks', blocks };
    return [
      {
        ...base,
        opIndexes: [index, wholeIndex],
        tag: ENTRY_TAG.suggested,
        note: entryNote(wholeEntry) ?? entryNote(entry),
        idea: true,
        content: notesVersion.content,
        unchanged: notesVersion.unchanged && wholeVersion.unchanged,
        versions: [
          { opIndex: index, key: 'notes', content: notesVersion.content, addedBlocks: 0 },
          { opIndex: wholeIndex, key: 'forge', content: forgeContent, addedBlocks: blocks.filter(block => block.added).length },
        ],
      },
    ];
  });
}

export type ReviewFilter = 'all' | 'waiting' | 'ideas';

export function filterCounts(items: readonly ReviewItem[], decided: (item: ReviewItem) => boolean): Record<ReviewFilter, number> {
  return { all: items.length, waiting: items.filter(item => !decided(item)).length, ideas: items.filter(item => item.idea).length };
}

export function nextOpenItem(items: readonly ReviewItem[], fromKey: string, decided: (item: ReviewItem) => boolean): string | undefined {
  const start = items.findIndex(item => item.key === fromKey);
  for (let step = 1; step <= items.length; step++) {
    const item = items[(start + step + items.length) % items.length];
    if (item && !decided(item)) return item.key;
  }
  return undefined;
}

export function reviewProgress(items: readonly ReviewItem[], decided: (item: ReviewItem) => boolean): { answered: number; total: number } {
  return { answered: items.filter(decided).length, total: items.length };
}
