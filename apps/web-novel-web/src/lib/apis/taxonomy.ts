import { type Genre, type Tag } from '@shadow-library/sdk';

/** Static discovery chips, typed against the sdk's `Genre`/`Tag` unions so an entry cannot drift from the vocabulary the server filters on. */
export const CATALOG_GENRES: readonly Genre[] = [
  'Fantasy',
  'Romance',
  'Action',
  'Martial Arts',
  'Horror',
  'Mystery',
  'Slice of Life',
  'Drama',
  'Adventure',
  'Xianxia',
  'Wuxia',
  'Mecha',
  'Comedy',
  'Tragedy',
  'Sci-fi',
];

export const CATALOG_TAGS: readonly Tag[] = [
  'Overpowered Protagonist',
  'Weak to Strong',
  'Kingdom Building',
  'Female Protagonist',
  'Time Travel',
  'Magic',
  'Revenge',
  'Slow Romance',
  'Politics',
  'Dragons',
  'Level System',
  'Second Chance',
];
