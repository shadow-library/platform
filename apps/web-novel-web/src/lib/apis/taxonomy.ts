import { type Genre, type Tag } from '@shadow-library/sdk';

/**
 * The curated browse taxonomy the discovery surfaces render as static chips — the genres panel and the search
 * overlay's suggestions. This is presentation content, not API data: the live catalog derives the genres it
 * actually holds from the `/api/novels` response, while these lists give the reader a stable set of entry
 * points to explore before any query runs. Typed against the sdk's `Genre`/`Tag` unions so a curated entry
 * can never drift from the real vocabulary the server actually filters on.
 */
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
