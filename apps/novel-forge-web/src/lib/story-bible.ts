import { type EntityType } from '@/lib/apis';

export interface BibleEntity {
  id: string;
  entityKey: string;
  name: string;
  type: EntityType;
  significance?: 'major' | 'minor' | null;
  status?: string | null;
  imageUrl?: string | null;
}

export interface BibleFact {
  factKey: string;
  text: string;
  subjects?: string[] | null;
  revealChapter?: number | null;
  knowledge: { entityKey: string }[];
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

function factMentions(fact: BibleFact, entityKey: string): boolean {
  return (fact.subjects ?? []).includes(entityKey) || fact.knowledge.some(entry => entry.entityKey === entityKey);
}

export function entityFacts(facts: readonly BibleFact[], entityKey: string): BibleFact[] {
  return facts.filter(fact => factMentions(fact, entityKey));
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
