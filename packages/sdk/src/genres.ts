export const NOVEL_GENRES = [
  'Action',
  'Adult',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Gender Bender',
  'Harem',
  'Historical',
  'Horror',
  'Josei',
  'Martial Arts',
  'Mature',
  'Mecha',
  'Mystery',
  'Psychological',
  'Romance',
  'School Life',
  'Sci-fi',
  'Seinen',
  'Shoujo',
  'Shoujo Ai',
  'Shounen',
  'Shounen Ai',
  'Slice of Life',
  'Smut',
  'Sports',
  'Supernatural',
  'Tragedy',
  'Wuxia',
  'Xianxia',
  'Xuanhuan',
  'Yaoi',
  'Yuri',
] as const;

export type Genre = (typeof NOVEL_GENRES)[number];

export function isGenre(value: unknown): value is Genre {
  return (NOVEL_GENRES as readonly string[]).includes(value as string);
}
