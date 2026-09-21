import { type BibleDocListItem, type BibleReadinessRoleResponse, type BibleSection, type BibleStage, type EntityType } from './apis/api-types.gen';
import { docAddress } from './bible-documents';

export type BibleTopic = 'core' | 'people' | 'factions' | 'places' | 'power' | 'lore' | 'objects' | 'author';

export const BIBLE_TOPICS: readonly BibleTopic[] = ['core', 'people', 'factions', 'places', 'power', 'lore', 'objects', 'author'];

export const TOPIC_LABEL: Record<BibleTopic, string> = {
  core: 'Story core',
  people: 'People',
  factions: 'Factions & peoples',
  places: 'Places',
  power: 'Power & rules',
  lore: 'Lore & history',
  objects: 'Objects',
  author: 'Author-only',
};

export const TOPIC_SHORT_LABEL: Record<BibleTopic, string> = {
  core: 'Core',
  people: 'People',
  factions: 'Factions',
  places: 'Places',
  power: 'Power',
  lore: 'Lore',
  objects: 'Objects',
  author: 'Author-only',
};

export const TOPIC_DESCRIPTION: Record<BibleTopic, string> = {
  core: 'The premise, the plot and the plan the whole story runs on.',
  people: 'The cast, the groups they move in, and the guides about them.',
  factions: 'The groups, peoples and powers that pull the story’s strings.',
  places: 'Where the story happens.',
  power: 'How the power system works — and what it costs.',
  lore: 'History, myth and the ideas the world is built on.',
  objects: 'The things that matter to the plot.',
  author: 'Notes kept for you alone.',
};

const ENTITY_TYPE_TOPIC: Record<Exclude<EntityType, 'concept'>, BibleTopic> = {
  character: 'people',
  faction: 'factions',
  location: 'places',
  power_rule: 'power',
  item: 'objects',
};

const STAGE_TOPIC: Record<BibleStage, BibleTopic> = {
  foundation: 'core',
  world: 'lore',
  power: 'power',
  factionsAndLocations: 'factions',
  characters: 'people',
  plot: 'core',
  volumes: 'core',
};

const SECTION_TOPIC: Record<BibleSection, BibleTopic> = {
  project: 'core',
  plot: 'core',
  story_state: 'core',
  ai: 'core',
  world: 'lore',
  power: 'power',
  lore: 'lore',
};

/** Checked in this order, so a name that reads as both a group and a place is filed with the group. */
const KEYWORD_TOPICS: readonly { topic: BibleTopic; words: readonly string[] }[] = [
  {
    topic: 'people',
    words: [
      'character',
      'characters',
      'cast',
      'ensemble',
      'protagonist',
      'antagonist',
      'relationship',
      'relationships',
      'romance',
      'family',
      'crowd',
      'crew',
      'friends',
      'companions',
      'squad',
      'team',
    ],
  },
  {
    topic: 'factions',
    words: [
      'faction',
      'factions',
      'guild',
      'guilds',
      'clan',
      'clans',
      'order',
      'house',
      'houses',
      'dynasty',
      'empire',
      'kingdom',
      'nation',
      'nations',
      'tribe',
      'tribes',
      'race',
      'races',
      'species',
      'peoples',
      'cult',
      'sect',
      'alliance',
      'army',
      'council',
      'church',
      'organisation',
      'organization',
      'politics',
    ],
  },
  {
    topic: 'places',
    words: [
      'location',
      'locations',
      'place',
      'places',
      'geography',
      'map',
      'city',
      'cities',
      'town',
      'village',
      'region',
      'regions',
      'continent',
      'realm',
      'realms',
      'land',
      'lands',
      'island',
      'forest',
      'mountain',
      'mountains',
      'sea',
      'ocean',
      'river',
      'desert',
      'dungeon',
      'dungeons',
      'tower',
      'castle',
      'academy',
      'school',
      'district',
      'planet',
    ],
  },
  {
    topic: 'power',
    words: [
      'power',
      'powers',
      'magic',
      'mana',
      'system',
      'level',
      'levels',
      'levelling',
      'leveling',
      'class',
      'classes',
      'ability',
      'abilities',
      'skill',
      'skills',
      'rank',
      'ranks',
      'tier',
      'tiers',
      'cultivation',
      'progression',
      'spell',
      'spells',
      'technique',
      'techniques',
      'bloodline',
      'scaling',
    ],
  },
  {
    topic: 'objects',
    words: ['item', 'items', 'artifact', 'artifacts', 'artefact', 'artefacts', 'relic', 'relics', 'weapon', 'weapons', 'sword', 'blade', 'ring', 'amulet', 'treasure', 'equipment'],
  },
  {
    topic: 'lore',
    words: ['history', 'lore', 'legend', 'legends', 'myth', 'myths', 'mythology', 'prophecy', 'religion', 'gods', 'era', 'age', 'war', 'timeline', 'calendar', 'culture'],
  },
];

const AUTHOR_ONLY = /\bauthor[\s_-]*(only|notes?)\b|\bfor[\s_-]+the[\s_-]+author\b/i;

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
}

/** The first topic whose vocabulary the text uses, or undefined when it names none of them. */
export function topicByKeywords(text: string, allowed: readonly BibleTopic[] = BIBLE_TOPICS): BibleTopic | undefined {
  const found = words(text);
  return KEYWORD_TOPICS.find(entry => allowed.includes(entry.topic) && entry.words.some(word => found.has(word)))?.topic;
}

export interface TopicEntity {
  type: EntityType;
  name: string;
  excerpt?: string;
}

/** Every typed record has its obvious home; a concept is read by its name first, then its opening lines, and defaults to lore. */
export function entityTopic(entity: TopicEntity): BibleTopic {
  if (entity.type !== 'concept') return ENTITY_TYPE_TOPIC[entity.type];
  return topicByKeywords(entity.name) ?? topicByKeywords(entity.excerpt ?? '') ?? 'lore';
}

const NEW_ENTRY_TYPE: Record<BibleTopic, EntityType> = {
  core: 'concept',
  people: 'character',
  factions: 'faction',
  places: 'location',
  power: 'power_rule',
  lore: 'concept',
  objects: 'item',
  author: 'concept',
};

/** The kind a new entry starts as on a topic tab, so "New entry" on People makes a character. */
export function newEntryType(topic: BibleTopic): EntityType {
  return NEW_ENTRY_TYPE[topic];
}

/** Tabs stay until they are measured wider than the room they have; before any measurement they are assumed to fit. */
export function tabsFit(needed: number | undefined, available: number): boolean {
  return needed === undefined || available <= 0 || needed <= available;
}

export function topicForEntityType(type: EntityType): BibleTopic | undefined {
  return type === 'concept' ? undefined : ENTITY_TYPE_TOPIC[type];
}

const STAGE_ORDER: readonly BibleStage[] = ['foundation', 'world', 'power', 'factionsAndLocations', 'characters', 'plot', 'volumes'];

/** A document covering several readiness roles files under the earliest one in manifest order. */
export function stagesByDocument(roles: readonly Pick<BibleReadinessRoleResponse, 'stage' | 'coveredBy'>[] | undefined): Map<string, BibleStage> {
  const stages = new Map<string, BibleStage>();
  for (const role of roles ?? []) {
    for (const address of role.coveredBy) {
      const current = stages.get(address);
      if (!current || STAGE_ORDER.indexOf(role.stage) < STAGE_ORDER.indexOf(current)) stages.set(address, role.stage);
    }
  }
  return stages;
}

/** A plot or project page is story core unless its title says it is about the cast, a group or a place — "the war", "the awakening" stay plot. */
const CORE_OVERRIDES: readonly BibleTopic[] = ['people', 'factions', 'places'];

/**
 * Author-only markers win; a power document stays with power; otherwise the author's own title decides, then
 * the readiness role the document covers, then its storage section.
 */
export function documentTopic(doc: Pick<BibleDocListItem, 'section' | 'slug' | 'title'>, stages?: ReadonlyMap<string, BibleStage>): BibleTopic {
  const label = `${doc.title} ${doc.slug.replace(/[-_]+/g, ' ')}`;
  if (AUTHOR_ONLY.test(label)) return 'author';
  if (doc.section === 'power') return 'power';
  const fallback = SECTION_TOPIC[doc.section];
  const keyword = topicByKeywords(label, fallback === 'core' ? CORE_OVERRIDES : BIBLE_TOPICS);
  if (keyword) return keyword;
  const stage = stages?.get(docAddress(doc));
  return stage ? STAGE_TOPIC[stage] : fallback;
}

export function parseBibleTopic(value: unknown): BibleTopic | undefined {
  return BIBLE_TOPICS.find(topic => topic === value);
}
