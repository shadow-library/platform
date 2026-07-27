/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 *
 * The webnovel-server API contract, hand-typed until the server ships an OpenAPI doc (then regenerate via
 * `bun run generate:api-types` and re-point these aliases). All endpoints live under `/api`.
 */

export type NovelStatus = 'ongoing' | 'completed' | 'hiatus';

export type CatalogSort = 'trending' | 'popular' | 'rating' | 'updated' | 'chapters' | 'title';

/** Cover artwork is a deterministic gradient until real cover assets exist server-side. */
export interface NovelCover {
  from: string;
  to: string;
}

export interface NovelSummary {
  slug: string;
  title: string;
  author: string;
  genres: string[];
  status: NovelStatus;
  rating: number;
  ratingCount: number;
  chapterCount: number;
  synopsis: string;
  updatedAt: string;
  views: number;
  cover: NovelCover;
}

export interface NovelDetail extends NovelSummary {
  alternativeTitles: string[];
  tags: string[];
  language: string;
  translator?: string;
  mature: boolean;
}

export interface ChapterMeta {
  ordinal: number;
  title: string;
  releasedAt: string;
}

export interface ChapterContent {
  novelSlug: string;
  novelTitle: string;
  ordinal: number;
  title: string;
  paragraphs: string[];
  contentHash: string;
  previousOrdinal?: number;
  nextOrdinal?: number;
  totalChapters: number;
}

export interface CatalogQuery {
  q?: string;
  genre?: string;
  status?: NovelStatus;
  sort?: CatalogSort;
  page?: number;
  limit?: number;
}

export interface CatalogResponse {
  items: NovelSummary[];
  total: number;
  page: number;
  pageSize: number;
  genres: string[];
}

export interface ChapterListResponse {
  items: ChapterMeta[];
  total: number;
}

export interface ReadingProgress {
  novelSlug: string;
  ordinal: number;
  /** Scroll position within the chapter, 0–100. */
  position: number;
  updatedAt: string;
}

export interface LibraryEntry {
  novelSlug: string;
  addedAt: string;
  novel: NovelSummary;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface SessionResponse {
  authenticated: boolean;
  user?: SessionUser;
}

/**
 * Declaring the constants
 */
