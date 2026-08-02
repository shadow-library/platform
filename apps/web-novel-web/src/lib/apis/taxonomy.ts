/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The curated browse taxonomy the discovery surfaces render as static chips — the genres panel and the search
 * overlay's suggestions. This is presentation content, not API data: the live catalog derives the genres it
 * actually holds from the `/api/novels` response, while these lists give the reader a stable set of entry
 * points to explore before any query runs.
 */
export const CATALOG_GENRES = [
  'Fantasy',
  'Cultivation',
  'LitRPG',
  'Romance',
  'Sci-Fi',
  'Action',
  'Martial Arts',
  'System',
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
  'Villainess',
  'Dungeon',
  'Regression',
];

export const CATALOG_TAGS = [
  'Overpowered MC',
  'Weak to Strong',
  'Kingdom Building',
  'Female Lead',
  'Time Travel',
  'Magic Academy',
  'Revenge',
  'Slow Burn',
  'Politics',
  'Dragons',
  'Level System',
  'Second Chance',
];
