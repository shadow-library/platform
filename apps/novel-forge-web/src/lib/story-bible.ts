import { type EntityType } from '@/lib/apis';

export interface BibleEntity {
  id: string;
  entityKey: string;
  name: string;
  type: EntityType;
  significance?: 'major' | 'minor' | null;
  status?: string | null;
  imageUrl?: string | null;
  body?: string | null;
  firstSeenChapter?: number | null;
}

export interface BibleFact {
  factKey: string;
  text: string;
  subjects?: string[] | null;
  writerNote?: string | null;
  revealChapter?: number | null;
  knowledge: { entityKey: string; learnedInChapter?: number }[];
}

export interface BibleRelation {
  entityKey: string;
  shared: number;
}

export interface BibleSection {
  type: EntityType;
  items: BibleEntity[];
}

export type BibleCategory = EntityType | 'all';

export type BibleView = 'entities' | 'facts';

export function parseBibleView(value: unknown): BibleView | undefined {
  return value === 'entities' || value === 'facts' ? value : undefined;
}

export const ALL_TYPES: EntityType[] = ['character', 'faction', 'location', 'power_rule', 'item', 'concept'];

export const TYPE_LABEL: Record<EntityType, string> = {
  character: 'Characters',
  faction: 'Factions',
  location: 'Locations',
  power_rule: 'Power rules',
  item: 'Items',
  concept: 'Concepts',
};

export const TYPE_SINGULAR: Record<EntityType, string> = {
  character: 'Character',
  faction: 'Faction',
  location: 'Location',
  power_rule: 'Power rule',
  item: 'Item',
  concept: 'Concept',
};

export const SECTION_PREVIEW = 8;
export const ASIDE_FACT_LIMIT = 5;
export const CARD_EXCERPT_CHARS = 140;

export function parseEntityType(value: unknown): EntityType | undefined {
  return ALL_TYPES.find(type => type === value);
}

export function countByType(entities: readonly BibleEntity[]): Map<EntityType, number> {
  const counts = new Map<EntityType, number>();
  for (const entity of entities) counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1);
  return counts;
}

/** Busiest type first — the author's cast leads, the one-off item does not sit above it. Ties keep the canonical order so the control does not reshuffle as counts change. */
export function orderTypesByCount(counts: ReadonlyMap<EntityType, number>, active?: EntityType): EntityType[] {
  return ALL_TYPES.filter(type => (counts.get(type) ?? 0) > 0 || type === active).sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || ALL_TYPES.indexOf(a) - ALL_TYPES.indexOf(b),
  );
}

function matchesQuery(entity: BibleEntity, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${entity.name} ${entity.entityKey} ${entity.status ?? ''}`.toLowerCase().includes(needle);
}

export function filterEntities(entities: readonly BibleEntity[], category: BibleCategory, query: string): BibleEntity[] {
  return entities.filter(entity => (category === 'all' || entity.type === category) && matchesQuery(entity, query));
}

export function groupByType(entities: readonly BibleEntity[], order: readonly EntityType[]): BibleSection[] {
  return order.map(type => ({ type, items: entities.filter(entity => entity.type === type) })).filter(section => section.items.length > 0);
}

export function sectionSlice(items: readonly BibleEntity[], expanded: boolean): BibleEntity[] {
  return expanded ? [...items] : items.slice(0, SECTION_PREVIEW);
}

export function entityCaption(entity: BibleEntity): string {
  return `${TYPE_SINGULAR[entity.type]} · ${entity.significance ?? 'minor'}`;
}

export function backLabel(total: number | undefined): string {
  return total === undefined ? 'All entities' : `All ${total} ${total === 1 ? 'entity' : 'entities'}`;
}

/**
 * Generated summaries lead with an `# <Name>` heading that repeats the title already shown above them.
 * Drop a leading heading when its text is just the entity's own name, so the name isn't stated twice.
 */
export function stripEntityHeading(body: string, name: string): string {
  const match = /^\s*#{1,3}[ \t]+(.+?)[ \t]*(?:\r?\n|$)/.exec(body);
  if (!match?.[1]) return body;
  const headingText = match[1].replace(/[*_`]/g, '').trim().toLowerCase();
  if (headingText !== name.trim().toLowerCase()) return body;
  return body.slice(match[0].length).replace(/^\s+/, '');
}

/** The entity's own Facts panel, unlike `relatedEntities`, cares only about subjects — a fact an entity has merely been told about names no relationship of its own. */
export function subjectFacts(facts: readonly BibleFact[], entityKey: string): BibleFact[] {
  return facts.filter(fact => (fact.subjects ?? []).includes(entityKey));
}

/** The API models no relationship of its own, so the bible's one recorded link between two entities is a canon fact that names them both. */
export function relatedEntities(facts: readonly BibleFact[], entityKey: string): BibleRelation[] {
  const shared = new Map<string, number>();
  for (const fact of facts) {
    const subjects = fact.subjects ?? [];
    if (!subjects.includes(entityKey)) continue;
    for (const subject of subjects) {
      if (subject === entityKey) continue;
      shared.set(subject, (shared.get(subject) ?? 0) + 1);
    }
  }
  return [...shared].map(([key, count]) => ({ entityKey: key, shared: count })).sort((a, b) => b.shared - a.shared || a.entityKey.localeCompare(b.entityKey));
}

export function factCountsBySubject(facts: readonly BibleFact[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const fact of facts) for (const subject of new Set(fact.subjects ?? [])) counts.set(subject, (counts.get(subject) ?? 0) + 1);
  return counts;
}

export function factCountLabel(count: number): string {
  if (count === 0) return 'No facts';
  return count === 1 ? '1 fact' : `${count} facts`;
}

export function markdownPlainText(markdown: string): string {
  return markdown
    .split('\n')
    .filter(line => !/^\s*#{1,6}\s/.test(line) && !/^\s*(?:[-*_]\s*){3,}$/.test(line))
    .map(line => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/^\s*>\s?/, ''))
    .join('\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|`|~~)/g, '')
    .trim();
}

/** Cut on a word boundary so a card never ends mid-word; the ellipsis says there is more to open. */
export function clipText(text: string, maxChars: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= maxChars) return flat;
  const cut = flat.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

export function entityExcerpt(entity: Pick<BibleEntity, 'name' | 'body'>, maxChars = CARD_EXCERPT_CHARS): string {
  const body = entity.body?.trim();
  if (!body) return '';
  const firstParagraph = markdownPlainText(stripEntityHeading(body, entity.name)).split(/\n\s*\n/, 1)[0] ?? '';
  return clipText(firstParagraph, maxChars);
}
