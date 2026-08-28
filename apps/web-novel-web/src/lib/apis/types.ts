import { type DarkContentLevel, type SexualContentLevel, type ViolenceLevel } from '@shadow-library/sdk';

/**
 * The reader's internal client view-model — the presentation shapes every screen is built on. It is
 * deliberately distinct from the generated wire contract (`api-types.gen.ts`): it carries derived, client-only
 * fields (gradient covers, humanized labels, the `ongoing`/`completed`/`hiatus` status the UI speaks) that the
 * lean server DTOs do not, and each `*.api.ts` maps the wire response into these shapes at its boundary. When a
 * shape here is a 1:1 mirror of a server DTO, consume the generated type instead of restating it.
 */

export type NovelStatus = 'ongoing' | 'completed' | 'hiatus';

export type CatalogSort = 'trending' | 'popular' | 'rating' | 'updated' | 'chapters' | 'title';

/** Cover artwork: the real image when the server resolved one from `coverUrl`, else a deterministic gradient. */
export interface NovelCover {
  from: string;
  to: string;
  imageUrl?: string;
}

export interface NovelSummary {
  slug: string;
  title: string;
  author: string;
  genres: string[];
  tags: string[];
  /** Absent when unrated on this dimension — never render an absent rating as "none". */
  sexualContent?: SexualContentLevel;
  /** Absent when unrated on this dimension — never render an absent rating as "none". */
  violence?: ViolenceLevel;
  /** Absent when unrated on this dimension — never render an absent rating as "none". */
  darkContent?: DarkContentLevel;
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
  tag?: string;
  status?: NovelStatus;
  /** Highest acceptable level, inclusive; a novel with no rating on this dimension is excluded, not passed. */
  maxSexualContent?: SexualContentLevel;
  /** Highest acceptable level, inclusive; a novel with no rating on this dimension is excluded, not passed. */
  maxViolence?: ViolenceLevel;
  /** Highest acceptable level, inclusive; a novel with no rating on this dimension is excluded, not passed. */
  maxDarkContent?: DarkContentLevel;
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
 * The reader-facing lore wiki. Spoiler gating (which entries/facets are visible) is decided entirely
 * server-side from the reader's progress — the client only renders what it is given plus the two
 * "more unlock as you read" counters (`lockedCount`, `hiddenFacetCount`).
 */
export type WikiEntryType = 'character' | 'faction' | 'location' | 'item' | 'concept' | 'power_rule';

export interface WikiEntrySummary {
  entryKey: string;
  type: WikiEntryType;
  name: string;
  imageUrl?: string;
}

export interface WikiIndex {
  items: WikiEntrySummary[];
  /** Entries that exist but are still spoiler-locked for this reader. */
  lockedCount: number;
}

export interface WikiFacet {
  facetKey: string;
  content: string;
  sortOrder: number;
}

export interface WikiImage {
  imageUrl: string;
  caption?: string;
  sortOrder: number;
}

export interface WikiEntryDetail extends WikiEntrySummary {
  facets: WikiFacet[];
  images: WikiImage[];
  /** Facets that exist on this entry but are still spoiler-locked for this reader. */
  hiddenFacetCount: number;
}
