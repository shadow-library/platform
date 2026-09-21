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

export const CARD_EXCERPT_CHARS = 140;

export function parseEntityType(value: unknown): EntityType | undefined {
  return ALL_TYPES.find(type => type === value);
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
