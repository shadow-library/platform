export const TAG_GROUPS = ['Protagonist', 'Romance', 'Cultivation', 'Fantasy', 'SciFi', 'Game', 'Modern', 'Historical', 'Plot', 'Action', 'Life', 'DarkThemes'] as const;

export type TagGroup = (typeof TAG_GROUPS)[number];

export const MAX_NOVEL_TAGS = 30;

const PROTAGONIST_TAGS = [
  'Male Protagonist',
  'Female Protagonist',
  'Overpowered Protagonist',
  'Weak to Strong',
  'Protagonist Strong from the Start',
  'Antihero Protagonist',
  'Evil Protagonist',
  'Ruthless Protagonist',
  'Genius Protagonist',
  'Calm Protagonist',
  'Lazy Protagonist',
  'Loner Protagonist',
  'Underestimated Protagonist',
  'Multiple Protagonists',
] as const;

const ROMANCE_TAGS = [
  'Slow Romance',
  'Love Triangles',
  'Childhood Friends',
  'Arranged Marriage',
  'Marriage of Convenience',
  'Enemies Become Lovers',
  'Fated Lovers',
  'Unrequited Love',
  'Obsessive Love',
  'Secret Relationship',
  'Office Romance',
  'Reverse Harem',
  'Polygamy',
  'Tsundere',
  'Yandere',
  'Cross-dressing',
] as const;

const CULTIVATION_TAGS = [
  'Cultivation',
  'Sect Development',
  'Master-Disciple Relationship',
  'Dao Companion',
  'Alchemy',
  'Martial Spirits',
  'Immortals',
  'Multiple Realms',
  'Strength-based Social Hierarchy',
  'Bloodlines',
  'Ancient China',
] as const;

const FANTASY_TAGS = [
  'Magic',
  'Magic Beasts',
  'Dragons',
  'Elves',
  'Demons',
  'Demon Lord',
  'Gods',
  'Vampires',
  'Werebeasts',
  'Zombies',
  'Ghosts',
  'Witches',
  'Necromancer',
  'Beastkin',
  'Monster Tamer',
  'Curses',
] as const;

const SCI_FI_TAGS = [
  'Artificial Intelligence',
  'Androids',
  'Aliens',
  'Cosmic Wars',
  'Apocalypse',
  'Post-apocalyptic',
  'Dystopia',
  'Genetic Modifications',
  'Virtual Reality',
  'Time Travel',
] as const;

const GAME_TAGS = [
  'Game Elements',
  'Level System',
  'MMORPG',
  'Dungeons',
  'Tower Climbing',
  'Cheats',
  'Hidden Abilities',
  'Transported into a Game World',
  'Survival Game',
  'e-Sports',
] as const;

const MODERN_TAGS = ['Modern Knowledge', 'Business Management', 'Showbiz', 'Celebrities', 'Medical Knowledge', 'Organized Crime', 'Academy', 'College/University'] as const;

const HISTORICAL_TAGS = [
  'Nobles',
  'Royalty',
  'Court Official',
  'Imperial Harem',
  'Kingdom Building',
  'Politics',
  'Schemes And Conspiracies',
  'Wars',
  'Military',
  'Medieval',
] as const;

const PLOT_TAGS = [
  'Reincarnation',
  'Transmigration',
  'Transported to Another World',
  'Returning from Another World',
  'Parallel Worlds',
  'Time Loop',
  'Time Skip',
  'Second Chance',
  'Amnesia',
  'Hiding True Identity',
  'Mistaken Identity',
  'Body Swap',
  'Possession',
  'Prophecies',
  'Revenge',
  'Villainess Noble Girls',
] as const;

const ACTION_TAGS = [
  'Assassins',
  'Mercenaries',
  'Knights',
  'Ninjas',
  'Samurai',
  'Pirates',
  'Hunters',
  'Strategic Battles',
  'Battle Competition',
  'Harsh Training',
  'Sword Wielder',
  'Firearms',
] as const;

const LIFE_TAGS = ['Farming', 'Cooking', 'Crafting', 'Blacksmith', 'Herbalist', 'Merchants', 'Healers', 'Easy Going Life', 'Found Family', 'Survival'] as const;

const DARK_THEMES_TAGS = [
  'Betrayal',
  'Past Trauma',
  'Death of Loved Ones',
  'Bullying',
  'Discrimination',
  'Slaves',
  'Human Experimentation',
  'Drugs',
  'Depression',
  'Terminal Illness',
] as const;

export const NOVEL_TAGS = [
  ...PROTAGONIST_TAGS,
  ...ROMANCE_TAGS,
  ...CULTIVATION_TAGS,
  ...FANTASY_TAGS,
  ...SCI_FI_TAGS,
  ...GAME_TAGS,
  ...MODERN_TAGS,
  ...HISTORICAL_TAGS,
  ...PLOT_TAGS,
  ...ACTION_TAGS,
  ...LIFE_TAGS,
  ...DARK_THEMES_TAGS,
] as const;

export type Tag = (typeof NOVEL_TAGS)[number];

export function isTag(value: unknown): value is Tag {
  return (NOVEL_TAGS as readonly string[]).includes(value as string);
}

export const TAG_GROUP_LABELS: Record<TagGroup, string> = {
  Protagonist: 'Protagonist',
  Romance: 'Romance',
  Cultivation: 'Cultivation',
  Fantasy: 'Fantasy',
  SciFi: 'Sci-Fi',
  Game: 'Game',
  Modern: 'Modern',
  Historical: 'Historical',
  Plot: 'Plot',
  Action: 'Action',
  Life: 'Life',
  DarkThemes: 'Dark Themes',
};

export interface TagGroupOptions {
  group: TagGroup;
  label: string;
  tags: readonly Tag[];
}

export const NOVEL_TAG_GROUPS: readonly TagGroupOptions[] = [
  { group: 'Protagonist', label: TAG_GROUP_LABELS.Protagonist, tags: PROTAGONIST_TAGS },
  { group: 'Romance', label: TAG_GROUP_LABELS.Romance, tags: ROMANCE_TAGS },
  { group: 'Cultivation', label: TAG_GROUP_LABELS.Cultivation, tags: CULTIVATION_TAGS },
  { group: 'Fantasy', label: TAG_GROUP_LABELS.Fantasy, tags: FANTASY_TAGS },
  { group: 'SciFi', label: TAG_GROUP_LABELS.SciFi, tags: SCI_FI_TAGS },
  { group: 'Game', label: TAG_GROUP_LABELS.Game, tags: GAME_TAGS },
  { group: 'Modern', label: TAG_GROUP_LABELS.Modern, tags: MODERN_TAGS },
  { group: 'Historical', label: TAG_GROUP_LABELS.Historical, tags: HISTORICAL_TAGS },
  { group: 'Plot', label: TAG_GROUP_LABELS.Plot, tags: PLOT_TAGS },
  { group: 'Action', label: TAG_GROUP_LABELS.Action, tags: ACTION_TAGS },
  { group: 'Life', label: TAG_GROUP_LABELS.Life, tags: LIFE_TAGS },
  { group: 'DarkThemes', label: TAG_GROUP_LABELS.DarkThemes, tags: DARK_THEMES_TAGS },
];

export const TAG_GROUP_BY_TAG = Object.fromEntries(NOVEL_TAG_GROUPS.flatMap(({ group, tags }) => tags.map(tag => [tag, group]))) as Record<Tag, TagGroup>;
