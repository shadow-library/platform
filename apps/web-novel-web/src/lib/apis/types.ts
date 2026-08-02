/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 *
 * The reader's internal client view-model — the presentation shapes every screen is built on. It is
 * deliberately distinct from the generated wire contract (`api-types.gen.ts`): it carries derived, client-only
 * fields (gradient covers, humanized labels, the `ongoing`/`completed`/`hiatus` status the UI speaks) that the
 * lean server DTOs do not, and each `*.api.ts` maps the wire response into these shapes at its boundary. When a
 * shape here is a 1:1 mirror of a server DTO, consume the generated type instead of restating it.
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

/** A cast member on the overview panel; `color` is a gradient tuple for the glyph tile. */
export interface NovelCharacter {
  name: string;
  role: string;
  color?: [string, string];
}

/** A gradient placeholder illustration until the server hosts real art. */
export interface NovelIllustration {
  id: string;
  caption?: string;
  color: [string, string];
}

/** A reader review. `when` is a pre-humanized relative label from the server. */
export interface NovelReview {
  id: string;
  user: string;
  when: string;
  rating: number;
  body: string;
  spoiler?: boolean;
  helpful: number;
}

/** Counts of 5★→1★ ratings, index 0 = 5★. */
export type RatingDistribution = [number, number, number, number, number];

export type CommentState = 'normal' | 'deleted' | 'moderated';

/** A reply carries no further nesting — one level deep only. */
export interface NovelCommentReply {
  id: string;
  user: string;
  when: string;
  body: string;
  likes: number;
  spoiler?: boolean;
  state?: CommentState;
}

export interface NovelComment extends NovelCommentReply {
  replies?: NovelCommentReply[];
}

export interface NovelDetail extends NovelSummary {
  alternativeTitles: string[];
  tags: string[];
  language: string;
  translator?: string;
  mature: boolean;
  /**
   * Enrichment blocks — every field is optional so the detail screen renders unchanged when the live
   * server omits them (the fixture layer populates them deterministically per slug).
   */
  characters?: NovelCharacter[];
  illustrations?: NovelIllustration[];
  related?: NovelSummary[];
  reviews?: NovelReview[];
  ratingDistribution?: RatingDistribution;
  comments?: NovelComment[];
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

/**
 * The reader the UI keys everything off. `userId` is mapped from the auth SDK principal's `sub`
 * (`GET /api/auth/session`, 200; signed-out is a plain 401). `email`/`name` are not carried by the SDK
 * session — they come from the separate userinfo query — so treat them as optional presentation extras.
 */
export interface SessionUser {
  userId: string;
  email?: string;
  name?: string;
}

/**
 * Declaring the constants
 */
