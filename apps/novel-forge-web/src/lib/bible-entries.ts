import { type BibleDocListItem, type BibleSection, type BibleStage, type EntityType } from './apis/api-types.gen';
import { docAddress } from './bible-documents';
import { BIBLE_TOPICS, type BibleTopic, documentTopic, entityTopic, TOPIC_LABEL } from './bible-topics';
import { formatWordCount } from './field-card';
import { type BibleEntity, entityExcerpt, TYPE_LABEL, TYPE_SINGULAR } from './story-bible';

export interface EntryEntity extends BibleEntity {
  updatedAt: string;
}

export type BibleEntry =
  | { kind: 'record'; id: string; topic: BibleTopic; name: string; summary: string; updatedAt: string; entity: EntryEntity }
  | { kind: 'guide'; id: string; topic: BibleTopic; name: string; summary: string; updatedAt: string; doc: BibleDocListItem };

export type EntryKindFilter = 'all' | 'records' | 'guides' | 'secrets';

export const ENTRY_KIND_FILTERS: readonly { value: EntryKindFilter; label: string }[] = [
  { value: 'all', label: 'All kinds' },
  { value: 'records', label: 'Records' },
  { value: 'guides', label: 'Guides' },
  { value: 'secrets', label: 'Has secrets' },
];

export interface EntryGroup {
  key: string;
  label: string;
  entries: BibleEntry[];
}

export interface BibleCatalogue {
  entries: BibleEntry[];
  /** Placeholder pages never written in; they are offered for removal, not listed as entries. */
  emptyDocs: { topic: BibleTopic; doc: BibleDocListItem }[];
}

export function recordId(entityKey: string): string {
  return `record:${entityKey}`;
}

export function guideId(doc: Pick<BibleDocListItem, 'section' | 'slug'>): string {
  return `guide:${docAddress(doc)}`;
}

export function entryTarget(entry: BibleEntry): { entity: string } | { guide: string } {
  return entry.kind === 'record' ? { entity: entry.entity.entityKey } : { guide: docAddress(entry.doc) };
}

const SECTIONS: readonly BibleSection[] = ['project', 'world', 'power', 'plot', 'story_state', 'ai', 'lore'];

export function parseGuideAddress(value: unknown): { section: BibleSection; slug: string } | undefined {
  if (typeof value !== 'string') return undefined;
  const slash = value.indexOf('/');
  const section = SECTIONS.find(candidate => candidate === value.slice(0, slash));
  const slug = value.slice(slash + 1);
  return section && slug ? { section, slug } : undefined;
}

export function buildCatalogue(entities: readonly EntryEntity[], docs: readonly BibleDocListItem[], stages?: ReadonlyMap<string, BibleStage>): BibleCatalogue {
  const records: BibleEntry[] = entities.map(entity => {
    const summary = entityExcerpt(entity);
    return {
      kind: 'record',
      id: recordId(entity.entityKey),
      topic: entityTopic({ type: entity.type, name: entity.name, excerpt: summary }),
      name: entity.name,
      summary,
      updatedAt: entity.updatedAt,
      entity,
    };
  });
  const guides: BibleEntry[] = docs
    .filter(doc => !doc.isEmpty)
    .map(doc => ({ kind: 'guide', id: guideId(doc), topic: documentTopic(doc, stages), name: doc.title, summary: doc.excerpt ?? '', updatedAt: doc.updatedAt, doc }));
  const emptyDocs = docs.filter(doc => doc.isEmpty).map(doc => ({ topic: documentTopic(doc, stages), doc }));
  return { entries: [...records, ...guides], emptyDocs };
}

/** Inside a topic the group header already names the kind, so the row says only what the header does not; lists mixing kinds name it. */
export function entryMeta(entry: BibleEntry, withKind: boolean): string {
  if (entry.kind === 'guide') return withKind ? `Guide · ${formatWordCount(entry.doc.wordCount)}` : formatWordCount(entry.doc.wordCount);
  const significance = entry.entity.significance === 'major' ? 'Major' : 'Minor';
  return withKind ? `${TYPE_SINGULAR[entry.entity.type]} · ${significance.toLowerCase()}` : significance;
}

export function countByTopic(entries: readonly Pick<BibleEntry, 'topic'>[]): Record<BibleTopic, number> {
  const counts = Object.fromEntries(BIBLE_TOPICS.map(topic => [topic, 0])) as Record<BibleTopic, number>;
  for (const entry of entries) counts[entry.topic] += 1;
  return counts;
}

/** Empty topics are left off the tab row, except the one the URL asked for, so a deep link never loses its tab. */
export function visibleTopics(counts: Readonly<Record<BibleTopic, number>>, active?: BibleTopic): BibleTopic[] {
  return BIBLE_TOPICS.filter(topic => counts[topic] > 0 || topic === active);
}

export function defaultTopic(counts: Readonly<Record<BibleTopic, number>>): BibleTopic {
  return BIBLE_TOPICS.find(topic => counts[topic] > 0) ?? 'core';
}

const MAJOR_FIRST = { major: 0, minor: 1 } as const;

function compareEntries(a: BibleEntry, b: BibleEntry): number {
  const rank = (entry: BibleEntry): number => (entry.kind === 'record' ? MAJOR_FIRST[entry.entity.significance ?? 'minor'] : 0);
  return rank(a) - rank(b) || a.name.localeCompare(b.name);
}

const RECORD_GROUP_ORDER: readonly EntityType[] = ['character', 'faction', 'location', 'power_rule', 'item', 'concept'];

/** A concept filed with the cast or with a faction is a group of people, so it is headed as one. */
function recordGroupLabel(type: EntityType, topic: BibleTopic): string {
  if (type === 'concept' && (topic === 'people' || topic === 'factions')) return 'Groups';
  return TYPE_LABEL[type];
}

/** Records by type in canonical order, major before minor, then the topic's guides. */
export function groupWithinTopic(entries: readonly BibleEntry[], topic: BibleTopic): EntryGroup[] {
  const groups: EntryGroup[] = RECORD_GROUP_ORDER.map(type => ({
    key: type,
    label: recordGroupLabel(type, topic),
    entries: entries.filter(entry => entry.kind === 'record' && entry.entity.type === type).sort(compareEntries),
  }));
  groups.push({ key: 'guides', label: 'Guides', entries: entries.filter(entry => entry.kind === 'guide').sort(compareEntries) });
  return groups.filter(group => group.entries.length > 0);
}

export function groupByTopic(entries: readonly BibleEntry[]): EntryGroup[] {
  return BIBLE_TOPICS.map(topic => ({ key: topic, label: TOPIC_LABEL[topic], entries: entries.filter(entry => entry.topic === topic).sort(compareEntries) })).filter(
    group => group.entries.length > 0,
  );
}

function entrySearchText(entry: BibleEntry): string {
  if (entry.kind === 'record') return `${entry.name} ${entry.entity.entityKey} ${entry.entity.status ?? ''} ${entry.summary}`;
  return `${entry.name} ${entry.doc.slug} ${entry.summary}`;
}

export function matchesEntry(entry: BibleEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return entrySearchText(entry).toLowerCase().includes(needle);
}

export function filterEntries(entries: readonly BibleEntry[], kind: EntryKindFilter, secretCounts: ReadonlyMap<string, number>, query = ''): BibleEntry[] {
  return entries.filter(entry => {
    if (!matchesEntry(entry, query)) return false;
    if (kind === 'records') return entry.kind === 'record';
    if (kind === 'guides') return entry.kind === 'guide';
    if (kind === 'secrets') return entry.kind === 'record' && (secretCounts.get(entry.entity.entityKey) ?? 0) > 0;
    return true;
  });
}

export const RECENT_WINDOW_DAYS = 7;
export const RECENT_EARLIER_LIMIT = 30;

export interface RecentEntries {
  thisWeek: BibleEntry[];
  earlier: BibleEntry[];
}

/** Newest first; the week's changes in full, and a capped tail of older ones so a quiet novel still shows something. */
export function recentEntries(entries: readonly BibleEntry[], now: Date): RecentEntries {
  const cutoff = now.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const sorted = [...entries].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.name.localeCompare(b.name));
  return {
    thisWeek: sorted.filter(entry => Date.parse(entry.updatedAt) >= cutoff),
    earlier: sorted.filter(entry => Date.parse(entry.updatedAt) < cutoff).slice(0, RECENT_EARLIER_LIMIT),
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const MIN_MENTION_LENGTH = 3;

/** A whole-name, case-insensitive match; a name shorter than three characters matches too much prose to mean anything. */
export function mentionsName(text: string, name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < MIN_MENTION_LENGTH) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(trimmed).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

export function mentionedEntities<T extends Pick<BibleEntity, 'entityKey' | 'name'>>(text: string, entities: readonly T[]): T[] {
  return entities.filter(entity => mentionsName(text, entity.name)).sort((a, b) => a.name.localeCompare(b.name));
}

/** Guide bodies are not in the list response, so a record is matched against each guide's title and opening excerpt. */
export function guidesMentioning(name: string, docs: readonly BibleDocListItem[]): BibleDocListItem[] {
  return docs.filter(doc => !doc.isEmpty && mentionsName(`${doc.title}\n${doc.excerpt ?? ''}`, name));
}

export const LEAD_CHARS = 700;

export interface LeadSection {
  lead: string;
  truncated: boolean;
}

const HEADING = /^\s*#{1,6}\s/;

/** The opening of a markdown body, cut at a block boundary: stops before a second heading or once the lead is long enough. */
export function leadSection(markdown: string, maxChars = LEAD_CHARS): LeadSection {
  const blocks = markdown.trim().split(/\n\s*\n/);
  const taken: string[] = [];
  let length = 0;
  let headings = 0;
  for (const block of blocks) {
    const isHeading = HEADING.test(block);
    const hasProse = taken.some(part => !HEADING.test(part) || part.includes('\n'));
    if (taken.length > 0 && hasProse && (length >= maxChars || (isHeading && headings >= 1))) break;
    if (isHeading) headings += 1;
    taken.push(block);
    length += block.length;
  }
  return { lead: taken.join('\n\n'), truncated: taken.length < blocks.length };
}

/** A guide the dialog never saw a timestamp for counts as changed, so an unknown baseline can never overwrite. */
export function guideChangedSince(openedAt: string | undefined, currentUpdatedAt: string): boolean {
  return openedAt === undefined || Date.parse(openedAt) !== Date.parse(currentUpdatedAt);
}
