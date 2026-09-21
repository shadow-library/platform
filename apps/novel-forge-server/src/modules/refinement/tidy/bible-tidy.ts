import { createHash } from 'node:crypto';

import { deriveBibleDocTitle } from '@server/common';
import { type Bible } from '@server/database';

import { type ChangeOp, type EntityUpsertOp } from '../change-set';

type TidyEntityType = EntityUpsertOp['type'];
export const TIDY_KINDS = ['remove_empty', 'retitle', 'split', 'move_ai_notes'] as const;
export type TidyKind = (typeof TIDY_KINDS)[number];

export interface TidyDoc {
  section: Bible.Section;
  slug: string;
  frontmatter: Record<string, unknown> | null;
  body: string | null;
}

interface TidyEntity {
  entityKey: string;
  name: string;
}

interface TidyItemBase {
  id: string;
  section: Bible.Section;
  slug: string;
  docTitle: string;
}

interface RemoveEmptyItem extends TidyItemBase {
  kind: 'remove_empty';
}

interface RetitleItem extends TidyItemBase {
  kind: 'retitle';
  currentTitle: string | null;
  proposedTitle: string;
}

interface SplitItem extends TidyItemBase {
  kind: 'split';
  entityKey: string;
  entityName: string;
  entityType: TidyEntityType;
  text: string;
}

interface MoveAiNoteItem extends TidyItemBase {
  kind: 'move_ai_notes';
  text: string;
  targetSlug: string;
  start: number;
  end: number;
}

export type TidyItem = RemoveEmptyItem | RetitleItem | SplitItem | MoveAiNoteItem;

export interface TidySelection {
  id: string;
  entityType?: TidyEntityType;
}

interface Line {
  text: string;
  start: number;
  end: number;
  heading: { level: number; text: string } | null;
  fenced: boolean;
}

interface Range {
  start: number;
  end: number;
}

const KEPT_EMPTY_SECTIONS: ReadonlySet<Bible.Section> = new Set(['story_state']);
const NOTE_SOURCE_SECTIONS: ReadonlySet<Bible.Section> = new Set(['project', 'world', 'power', 'plot', 'lore']);
const SPLIT_SECTIONS: ReadonlySet<Bible.Section> = new Set(['project', 'world', 'power', 'lore']);
const MIN_SPLIT_SECTIONS = 3;
const MAX_NAME_WORDS = 6;
const MAX_NAME_CHARS = 60;

const TIDY_SECTION_LABEL: Record<Bible.Section, string> = {
  project: 'Core',
  world: 'World',
  power: 'Power',
  plot: 'Plot',
  story_state: 'Where things stand',
  ai: 'Notes for the AI',
  lore: 'Lore',
};

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;

const NOTE_HEADING =
  /^(?:(?:notes?|reminders?|instructions?|guidance)\s+(?:for|to)\s+(?:the\s+)?(?:ai|model|llm|writer|assistant)|(?:ai|model|llm)[\s-]+(?:only\s+)?(?:notes?|instructions?|guidance)|(?:schema|brief[\s-]+field)\s+notes?)\b/i;
const NOTE_SIGNALS: readonly RegExp[] = [
  /\b(?:knowledgeContract|endingContract|contextRefs|mustNotResolve|writeMode|writerNote|constraintNote|factKey|entityKey|revealChapter)\b/,
  /\bbrief(?:'s)?[\s-]+(?:fields?|schema)\b/i,
  /^\s*(?:[-*+]\s+)?for\s+the\s+(?:ai|model|llm|writer\s+model)\b\s*[:,—–-]/i,
  /\b(?:note|reminder)\s+(?:to|for)\s+(?:the\s+)?(?:ai|model|llm)\b/i,
  /^\s*[([]\s*(?:ai\s+)?note\b/i,
];
const INLINE_NOTE = /[ \t]*[([](?:ai\s+)?note(?:\s+(?:to|for)\s+(?:the\s+)?(?:ai|model|llm|writer))?\s*[:\-–—][^)\]\n]*[)\]]/gi;

const PHASE_HEADING =
  /^(?:phase|stage|step|part|act|book|volume|vol\.?|arc|chapter|ch\.?|season|episode|era|age|year|day|week|month|tier|level|rank|grade)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|final)\b/i;
const YEAR = /\b(?:1\d{3}|20\d{2})\b|\b\d+\s*(?:bce|ce|ad|bc)\b/i;
const STOP_WORDS: ReadonlySet<string> = new Set(['a', 'an', 'and', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'or', '&']);
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  'overview',
  'summary',
  'introduction',
  'intro',
  'background',
  'history',
  'notes',
  'note',
  'timeline',
  'themes',
  'theme',
  'tone',
  'hook',
  'stakes',
  'conflict',
  'conflicts',
  'rules',
  'rule',
  'costs',
  'cost',
  'limits',
  'limitations',
  'geography',
  'economy',
  'politics',
  'culture',
  'religion',
  'technology',
  'society',
  'government',
  'climate',
  'language',
  'languages',
  'calendar',
  'currency',
  'structure',
  'progression',
  'system',
  'ranks',
  'relationships',
  'glossary',
  'misc',
  'miscellaneous',
  'other',
  'open',
  'questions',
  'ideas',
  'setting',
  'world',
  'magic',
  'power',
  'powers',
  'cast',
  'characters',
  'factions',
  'locations',
  'places',
  'items',
  'protagonist',
  'antagonist',
  'supporting',
  'reader',
  'promise',
  'pacing',
  'drive',
  'endgame',
]);

const TYPE_KEYWORDS: readonly { type: TidyEntityType; pattern: RegExp }[] = [
  { type: 'character', pattern: /\b(?:cast|characters?|people|persons?|npcs?|protagonists?|antagonists?|villains?|heroes?)\b/i },
  {
    type: 'faction',
    pattern:
      /\b(?:factions?|guilds?|clans?|orders?|houses?|sects?|churche?s?|empires?|kingdoms?|republics?|alliances?|compan(?:y|ies)|societ(?:y|ies)|councils?|courts?|cults?|syndicates?|legions?|armies|army|families|family|dynast(?:y|ies)|organi[sz]ations?|groups?|tribes?|nations?)\b/i,
  },
  {
    type: 'location',
    pattern:
      /\b(?:locations?|places?|geography|cit(?:y|ies)|towns?|villages?|forests?|mountains?|rivers?|seas?|lakes?|islands?|continents?|regions?|districts?|temples?|castles?|towers?|ruins|valleys?|deserts?|capitals?|provinces?|dungeons?|ports?|harbou?rs?|realms?)\b/i,
  },
  { type: 'item', pattern: /\b(?:items?|artifacts?|artefacts?|relics?|weapons?|swords?|blades?|rings?|treasures?|tomes?|staffs?|equipment|gear)\b/i },
  { type: 'power_rule', pattern: /\b(?:powers?|techniques?|skills?|arts?|abilities|ability|spells?|magic|cultivation|ranks?|tiers?|laws?)\b/i },
];

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 10);
}

function docAddress(doc: Pick<TidyDoc, 'section' | 'slug'>): string {
  return `${doc.section}/${doc.slug}`;
}

function storedTitle(doc: TidyDoc): string | null {
  const title = doc.frontmatter?.['title'];
  return typeof title === 'string' && title.trim() !== '' ? title.trim() : null;
}

function splitLines(body: string): Line[] {
  const lines: Line[] = [];
  let offset = 0;
  let fenced = false;
  for (const raw of body.split('\n')) {
    const start = offset;
    const end = Math.min(body.length, start + raw.length + 1);
    offset = start + raw.length + 1;
    const isFence = FENCE.test(raw);
    const inFence = fenced || isFence;
    if (isFence) fenced = !fenced;
    const match = inFence ? null : HEADING.exec(raw);
    lines.push({ text: raw, start, end, fenced: inFence, heading: match ? { level: (match[1] as string).length, text: (match[2] as string).trim() } : null });
  }
  return lines;
}

function isBlank(line: Line): boolean {
  return line.text.trim() === '';
}

/** A range that also swallows the blank lines after it, so removing a paragraph leaves a single paragraph break behind. */
function withTrailingBlanks(lines: readonly Line[], lastIndex: number, start: number): Range {
  let index = lastIndex;
  while (index + 1 < lines.length && isBlank(lines[index + 1] as Line)) index++;
  return { start, end: (lines[index] as Line).end };
}

function sectionEnd(lines: readonly Line[], headingIndex: number): number {
  const level = (lines[headingIndex] as Line).heading?.level ?? 1;
  for (let index = headingIndex + 1; index < lines.length; index++) {
    const heading = (lines[index] as Line).heading;
    if (heading && heading.level <= level) return index;
  }
  return lines.length;
}

function isNoteText(text: string): boolean {
  return NOTE_SIGNALS.some(pattern => pattern.test(text));
}

function stripBrackets(text: string): string {
  return text
    .trim()
    .replace(/^[([]\s*/, '')
    .replace(/\s*[)\]]$/, '');
}

/**
 * Author-only notes addressed to the model rather than the story, found by pattern alone: a whole section under a
 * "Notes for the AI"-style heading, a paragraph or list item that talks about brief fields or the schema, or an inline
 * `(note: …)` aside. Each comes back as the exact span of the body it occupies.
 */
export function findAiNotes(body: string): { text: string; start: number; end: number }[] {
  const lines = splitLines(body);
  const notes: { text: string; start: number; end: number }[] = [];
  const claimed = new Set<number>();

  lines.forEach((line, index) => {
    if (claimed.has(index) || !line.heading || !NOTE_HEADING.test(line.heading.text)) return;
    const end = sectionEnd(lines, index);
    for (let covered = index; covered < end; covered++) claimed.add(covered);
    const text = body.slice(line.end, (lines[end - 1] as Line).end).trim();
    if (text !== '') notes.push({ text, start: line.start, end: end < lines.length ? (lines[end] as Line).start : body.length });
  });

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] as Line;
    if (claimed.has(index) || line.heading || line.fenced || isBlank(line)) {
      index++;
      continue;
    }

    if (LIST_ITEM.test(line.text)) {
      let last = index;
      while (
        last + 1 < lines.length &&
        !claimed.has(last + 1) &&
        !isBlank(lines[last + 1] as Line) &&
        /^\s+\S/.test((lines[last + 1] as Line).text) &&
        !LIST_ITEM.test((lines[last + 1] as Line).text)
      )
        last++;
      const range = { start: line.start, end: (lines[last] as Line).end };
      notes.push(...blockOrInlineNotes(body, range, text => text.replace(LIST_ITEM, ''), range));
      index = last + 1;
      continue;
    }

    let last = index;
    while (last + 1 < lines.length) {
      const next = lines[last + 1] as Line;
      if (claimed.has(last + 1) || next.heading || next.fenced || isBlank(next) || LIST_ITEM.test(next.text)) break;
      last++;
    }
    notes.push(...blockOrInlineNotes(body, { start: line.start, end: (lines[last] as Line).end }, stripBrackets, withTrailingBlanks(lines, last, line.start)));
    index = last + 1;
  }

  return notes.sort((a, b) => a.start - b.start);
}

/** Judged with its inline asides taken out, so a `(note: … for the model)` aside does not drag the prose around it along. */
function blockOrInlineNotes(body: string, block: Range, clean: (text: string) => string, removal: Range): { text: string; start: number; end: number }[] {
  const text = body.slice(block.start, block.end);
  const asides = [...text.matchAll(INLINE_NOTE)].map(match => ({
    text: stripBrackets(match[0]),
    start: block.start + match.index,
    end: block.start + match.index + match[0].length,
  }));
  const remainder = text.replace(INLINE_NOTE, '').trim();
  if (remainder !== '' && isNoteText(remainder)) return [{ text: clean(text.trim()), ...removal }];
  if (remainder === '' && asides.length > 0) return [{ text: asides.map(aside => aside.text).join('\n'), ...removal }];
  return asides;
}

function mergeRanges(ranges: readonly Range[]): Range[] {
  const merged: Range[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

/** Removes the spans, then trims only what the removal left dangling at the very end. */
export function removeRanges(body: string, ranges: readonly Range[]): string {
  let result = body;
  for (const range of mergeRanges(ranges).reverse()) result = result.slice(0, range.start) + result.slice(range.end);
  const trailingNewline = body.endsWith('\n');
  const trimmed = result.replace(/\s+$/, '');
  return trailingNewline && trimmed !== '' ? `${trimmed}\n` : trimmed;
}

interface ParsedHeading {
  name: string;
  hint: string | null;
}

function parseEntityHeading(raw: string): ParsedHeading {
  const plain = raw
    .replace(/[*_`]/g, '')
    .replace(/^\d+[.)]\s+/, '')
    .trim();
  const hintMatch = /\s*\(([^)]+)\)\s*$/.exec(plain);
  const withoutHint = hintMatch ? plain.slice(0, hintMatch.index).trim() : plain;
  const name = (withoutHint.split(/\s+[—–]\s+|:\s+|\s+-\s+/)[0] ?? withoutHint).replace(/[:.]$/, '').trim();
  return { name, hint: hintMatch ? (hintMatch[1] as string) : null };
}

function isPhaseHeading(raw: string): boolean {
  const plain = raw.replace(/[*_`]/g, '').trim();
  return PHASE_HEADING.test(plain) || YEAR.test(plain);
}

/** A short, capitalised name that is not just a topic word — "The Salt Guild", not "Costs and limits". */
export function readsLikeName(name: string): boolean {
  if (name === '' || name.length > MAX_NAME_CHARS || /[?!]$/.test(name)) return false;
  const words = name.split(/\s+/);
  if (words.length > MAX_NAME_WORDS) return false;
  const significant = words.filter(word => !STOP_WORDS.has(word.toLowerCase()));
  if (significant.length === 0) return false;
  if (significant.every(word => GENERIC_WORDS.has(word.toLowerCase().replace(/[^\p{L}]/gu, '')))) return false;
  return significant.every(word => !/^\p{Ll}/u.test(word));
}

function keywordTypes(text: string): TidyEntityType[] {
  return TYPE_KEYWORDS.filter(entry => entry.pattern.test(text)).map(entry => entry.type);
}

/** An explicit "(faction)" hint, then what the name itself says ("… Guild"), then what the page is a list of; null when nothing names a type. */
export function chooseEntityType(docLabel: string, heading: ParsedHeading): TidyEntityType | null {
  const hinted = heading.hint ? keywordTypes(heading.hint)[0] : undefined;
  return hinted ?? keywordTypes(heading.name)[0] ?? keywordTypes(docLabel)[0] ?? null;
}

export function toEntityKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

function splitCandidates(doc: TidyDoc, title: string, notes: readonly Range[]): { name: string; type: TidyEntityType; text: string }[] {
  if (!SPLIT_SECTIONS.has(doc.section)) return [];
  const docLabel = `${title} ${doc.slug.replace(/[-_]+/g, ' ')}`;
  const listing = keywordTypes(docLabel);
  if (listing.length === 0 || (doc.section === 'project' && !listing.includes('character'))) return [];

  const body = doc.body ?? '';
  const lines = splitLines(body);
  const headings = lines.map((line, index) => ({ line, index })).filter(({ line }) => line.heading?.level === 2);
  if (headings.length < MIN_SPLIT_SECTIONS) return [];
  if (headings.filter(({ line }) => isPhaseHeading(line.heading?.text ?? '')).length * 2 >= headings.length) return [];

  const candidates: { name: string; type: TidyEntityType; text: string }[] = [];
  for (const { line, index } of headings) {
    const raw = line.heading?.text ?? '';
    if (isPhaseHeading(raw) || NOTE_HEADING.test(raw)) continue;
    const parsed = parseEntityHeading(raw);
    if (!readsLikeName(parsed.name)) continue;

    const end = sectionEnd(lines, index);
    const contentStart = (lines[index] as Line).end;
    const contentEnd = end < lines.length ? (lines[end] as Line).start : body.length;
    const inside = notes.filter(note => note.start >= contentStart && note.end <= contentEnd).map(note => ({ start: note.start - contentStart, end: note.end - contentStart }));
    const text = removeRanges(body.slice(contentStart, contentEnd), inside).trim();
    const type = chooseEntityType(docLabel, parsed);
    if (text === '' || !type) continue;
    candidates.push({ name: parsed.name, type, text });
  }
  return candidates.length >= MIN_SPLIT_SECTIONS ? candidates : [];
}

/** Only a title stored as the slug itself is replaced; a missing one already reads as the derived title, so storing it would change nothing the author sees. */
function proposedTitle(doc: TidyDoc): string | null {
  const current = storedTitle(doc);
  if (current === null || current.toLowerCase().replace(/_/g, '-') !== doc.slug.toLowerCase()) return null;
  const derived = deriveBibleDocTitle({ slug: doc.slug, frontmatter: null, body: doc.body });
  return derived.toLowerCase() === current.toLowerCase() ? null : derived;
}

function aiNotesSlug(section: Bible.Section): string {
  return `${section}-notes`;
}

/**
 * Everything the tidy-up would change, one reviewable item per change and each with an id that pins the content it
 * was computed from — a document edited after the preview no longer yields the same id, so a stale selection is caught.
 */
export function analyseBibleForTidy(docs: readonly TidyDoc[], entities: readonly TidyEntity[]): TidyItem[] {
  const items: TidyItem[] = [];
  const takenKeys = new Set(entities.map(entity => entity.entityKey));
  const takenNames = new Set(entities.map(entity => entity.name.trim().toLowerCase()));

  for (const doc of docs) {
    const body = doc.body ?? '';
    const docTitle = deriveBibleDocTitle(doc);
    const base = { section: doc.section, slug: doc.slug, docTitle };
    const address = docAddress(doc);

    if (body.trim() === '') {
      if (doc.slug === 'default' && !KEPT_EMPTY_SECTIONS.has(doc.section)) items.push({ ...base, id: `remove_empty:${address}`, kind: 'remove_empty' });
      continue;
    }

    const title = proposedTitle(doc);
    if (title) items.push({ ...base, id: `retitle:${address}:${shortHash(title)}`, kind: 'retitle', currentTitle: storedTitle(doc), proposedTitle: title });

    const notes = NOTE_SOURCE_SECTIONS.has(doc.section) ? findAiNotes(body) : [];
    const seen = new Map<string, number>();
    for (const note of notes) {
      const hash = shortHash(note.text);
      const occurrence = seen.get(hash) ?? 0;
      seen.set(hash, occurrence + 1);
      items.push({
        ...base,
        id: `move_ai_notes:${address}:${hash}:${occurrence}`,
        kind: 'move_ai_notes',
        text: note.text,
        targetSlug: aiNotesSlug(doc.section),
        start: note.start,
        end: note.end,
      });
    }

    for (const candidate of splitCandidates(doc, docTitle, notes)) {
      const entityKey = toEntityKey(candidate.name);
      if (entityKey === '' || takenKeys.has(entityKey) || takenNames.has(candidate.name.toLowerCase())) continue;
      takenKeys.add(entityKey);
      takenNames.add(candidate.name.toLowerCase());
      items.push({
        ...base,
        id: `split:${address}:${entityKey}:${shortHash(candidate.text)}`,
        kind: 'split',
        entityKey,
        entityName: candidate.name,
        entityType: candidate.type,
        text: candidate.text,
      });
    }
  }

  return items;
}

function appendNotes(existing: string, blocks: readonly string[]): string {
  const head = existing.replace(/\s+$/, '');
  return `${head === '' ? '' : `${head}\n\n`}${blocks.join('\n\n')}\n`;
}

interface DocEdit {
  section: Bible.Section;
  slug: string;
  doc: TidyDoc | undefined;
  title?: string;
  ranges: Range[];
  appended: { title: string; notes: string[] }[];
  reasons: string[];
}

/**
 * The selected items as a change-set. Everything aimed at one document — including the notes page that moved notes land
 * on — folds into a single upsert, so no two ops rewrite the same page and each page's revert restores it exactly.
 */
export function composeTidyChangeSet(docs: readonly TidyDoc[], selected: readonly (TidyItem & { entityTypeOverride?: TidyEntityType })[]): ChangeOp[] {
  const byAddress = new Map(docs.map(doc => [docAddress(doc), doc]));
  const removals: ChangeOp[] = [];
  const entities: ChangeOp[] = [];
  const edits = new Map<string, DocEdit>();

  const editFor = (section: Bible.Section, slug: string): DocEdit => {
    const address = docAddress({ section, slug });
    const edit = edits.get(address) ?? { section, slug, doc: byAddress.get(address), ranges: [], appended: [], reasons: [] };
    edits.set(address, edit);
    return edit;
  };

  for (const item of selected) {
    if (item.kind === 'remove_empty')
      removals.push({ op: 'bible_document.remove', section: item.section, slug: item.slug, rationale: `remove the empty placeholder "${item.docTitle}"` });

    if (item.kind === 'retitle') {
      const edit = editFor(item.section, item.slug);
      edit.title = item.proposedTitle;
      edit.reasons.push(`retitle to "${item.proposedTitle}"`);
    }

    if (item.kind === 'move_ai_notes') {
      const source = editFor(item.section, item.slug);
      source.ranges.push({ start: item.start, end: item.end });
      if (source.ranges.length === 1) source.reasons.push('move notes for the AI out');

      const target = editFor('ai', item.targetSlug);
      if (target.appended.length === 0) target.reasons.push('collect the notes for the AI moved out of story pages');
      const group = target.appended.find(entry => entry.title === item.docTitle);
      if (group) group.notes.push(item.text);
      else target.appended.push({ title: item.docTitle, notes: [item.text] });
      target.title ??= target.doc ? undefined : `${TIDY_SECTION_LABEL[item.section]} notes`;
    }

    if (item.kind === 'split') {
      entities.push({
        op: 'entity.upsert',
        entityKey: item.entityKey,
        type: item.entityTypeOverride ?? item.entityType,
        name: item.entityName,
        body: item.text,
        rationale: `split out of "${item.docTitle}"`,
      });
    }
  }

  const upserts: ChangeOp[] = [...edits.values()].map(({ section, slug, doc, title, ranges, appended, reasons }) => {
    const kept = ranges.length > 0 ? removeRanges(doc?.body ?? '', ranges) : (doc?.body ?? '');
    const blocks = appended.map(group => `## From ${group.title}\n\n${group.notes.join('\n\n')}`);
    return {
      op: 'bible_document.upsert',
      section,
      slug,
      frontmatter: title ? { ...(doc?.frontmatter ?? {}), title } : (doc?.frontmatter ?? undefined),
      body: blocks.length > 0 ? appendNotes(kept, blocks) : kept,
      rationale: reasons.join('; '),
    };
  });

  return [...removals, ...upserts, ...entities];
}
