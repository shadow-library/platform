/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { EnumType, Field, Integer, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// A hand-authored bundle picks one of two outcomes (novel-import-format.md §1): `source` lands the
// chapters as raw source material feeding the existing extract/consolidate/rebrand/reforge pipeline;
// `final` lands them as the finished, immediately publishable novel.
export const NOVEL_IMPORT_MODES = ['final', 'source'] as const;
export const NovelImportMode = EnumType.create('NovelImportMode', [...NOVEL_IMPORT_MODES]);
export type NovelImportModeValue = (typeof NOVEL_IMPORT_MODES)[number];

const SLUG_PATTERN = '^[a-z0-9][a-z0-9-]*$';
// Same whitelist `UploadImageBody`/`UpsertEntityImage` already validate covers and portraits against.
const IMAGE_MIME_WHITELIST = ['image/png', 'image/jpeg', 'image/webp'] as const;

// Column-aligned caps: `novel.title` writes to BOTH `projects.name` (varchar 255) and `projects.title`
// (varchar 500) — capped at the tighter of the two so neither insert can overflow. `chapters[].title`
// writes to `chapters.title` (varchar 500). `synopsis`/`instructions`/chapter `content` map to `text`
// columns (unbounded) and are deliberately left uncapped here — `content` is the novel's actual prose.
const PROJECT_TITLE_MAX_LENGTH = 255;
const CHAPTER_TITLE_MAX_LENGTH = 500;

@Schema()
export class NovelImportAsset {
  // Referenced by `novel.cover` — unique within the bundle (checked by `validateNovelBundle`).
  @Field({ pattern: SLUG_PATTERN })
  name: string;

  @Field(() => String, { enum: [...IMAGE_MIME_WHITELIST] })
  mimeType: string;

  // Base64-encoded bytes, without a `data:` URL prefix — same convention as `UploadImageBody.image`.
  @Field({ minLength: 1 })
  dataBase64: string;
}

@Schema()
export class NovelImportChapter {
  // Aligned to `chapters.title` (varchar 500) — a title beyond this would fail the insert mid-job
  // instead of rejecting the bundle upfront.
  @Field({ minLength: 1, maxLength: CHAPTER_TITLE_MAX_LENGTH })
  title: string;

  @Field({ minLength: 1 })
  content: string;
}

@Schema()
export class NovelImportVolume {
  // Unique and contiguous from 1 across the bundle (checked by `validateNovelBundle`) — volumes are
  // purely an authoring/ordering construct; nothing in the database stores them.
  @Field(() => Integer, { minimum: 1 })
  ordinal: number;

  @Field({ optional: true })
  title?: string;

  @Field(() => [NovelImportChapter], { minItems: 1 })
  chapters: NovelImportChapter[];
}

@Schema()
export class NovelImportMeta {
  // Aligned to `projects.name` (varchar 255) — the tighter of the two columns this writes to.
  @Field({ minLength: 1, maxLength: PROJECT_TITLE_MAX_LENGTH })
  title: string;

  // Maps to `projects.brief` — the same "overview" field the app's own premise/refinement flow reads
  // (`refine.service.ts`: `project.brief ?? project.premise`) and the export package renders as the
  // novel's description.
  @Field({ minLength: 1 })
  synopsis: string;

  // Accepted for authoring completeness; the `projects` table has no evidenced genre column today
  // (the AI premise pipeline's own `genre` field is likewise never persisted), so it is validated but
  // not written anywhere yet — see novel-import-format.md.
  @Field({ optional: true })
  genre?: string;

  // Maps to `projects.themes` — the same jsonb array `NovelPackageService` reads back out as `tags`.
  @Field(() => [String], { optional: true })
  tags?: string[];

  // The `name` of an entry in `assets` — stored through the same `StorageService` path
  // `ProjectService.setCover` uses, so it resolves at `projects.coverImagePath`.
  @Field({ optional: true })
  cover?: string;

  // Author chapter-writing instructions; maps to `projects.instructions`. Omitted falls back to the
  // app's `DEFAULT_WRITING_INSTRUCTIONS`, identical to a project created without instructions.
  @Field({ optional: true })
  instructions?: string;
}

@Schema()
export class NovelBundle {
  @Field({ enum: ['novel-import'] })
  format: string;

  @Field(() => Integer, { enum: [1] })
  schemaVersion: number;

  @Field(() => NovelImportMode)
  mode: NovelImportModeValue;

  @Field(() => NovelImportMeta)
  novel: NovelImportMeta;

  // Ordered groups; global chapter numbers are DERIVED by flattening volumes in ordinal order — the
  // bundle never carries explicit chapter numbers (novel-import-format.md §3).
  @Field(() => [NovelImportVolume], { minItems: 1 })
  volumes: NovelImportVolume[];

  @Field(() => [NovelImportAsset], { optional: true })
  assets?: NovelImportAsset[];
}

@Schema()
export class ImportNovelBody {
  @Field(() => NovelBundle)
  bundle: NovelBundle;
}

@Schema()
export class ImportNovelResponse {
  @Field(() => String)
  projectId: bigint;

  @Field()
  jobId: string;
}
