import { EnumType, Field, Integer, Schema } from '@shadow-library/class-schema';

// A hand-authored bundle picks one of two outcomes (novel-import-format.md §1): `source` lands the
// chapters as raw source material feeding the existing extract/consolidate/rebrand/reforge pipeline;
// `final` lands them as the finished, immediately publishable novel.
export const NOVEL_IMPORT_MODES = ['final', 'source'] as const;
export const NovelImportMode = EnumType.create('NovelImportMode', [...NOVEL_IMPORT_MODES]);
export type NovelImportModeValue = (typeof NOVEL_IMPORT_MODES)[number];

const SLUG_PATTERN = '^[a-z0-9][a-z0-9-]*$';
const IMAGE_MIME_WHITELIST = ['image/png', 'image/jpeg', 'image/webp'] as const;

// Column-aligned caps: `novel.title` writes to BOTH `projects.name` (varchar 255) and `projects.title`
// (varchar 500) — capped at the tighter of the two so neither insert can overflow. `chapters[].title`
// writes to `chapters.title` (varchar 500). `synopsis`/`instructions`/chapter `content` map to `text`
// columns (unbounded) and are deliberately left uncapped here — `content` is the novel's actual prose.
const PROJECT_TITLE_MAX_LENGTH = 255;
const CHAPTER_TITLE_MAX_LENGTH = 500;

@Schema()
export class NovelImportAsset {
  @Field({ pattern: SLUG_PATTERN, description: 'Asset name referenced by novel.cover; it must be unique within the bundle.' })
  name: string;

  @Field(() => String, { enum: [...IMAGE_MIME_WHITELIST] })
  mimeType: string;

  @Field({ minLength: 1, description: 'Base64-encoded bytes without a data URL prefix.' })
  dataBase64: string;
}

@Schema()
export class NovelImportChapter {
  @Field({ minLength: 1, maxLength: CHAPTER_TITLE_MAX_LENGTH, description: 'Chapter title, limited to the database column capacity.' })
  title: string;

  @Field({ minLength: 1 })
  content: string;
}

@Schema()
export class NovelImportVolume {
  @Field(() => Integer, {
    minimum: 1,
    description: 'One-based volume position; ordinals must be unique and contiguous across the bundle.',
  })
  ordinal: number;

  @Field({ optional: true })
  title?: string;

  @Field(() => [NovelImportChapter], { minItems: 1 })
  chapters: NovelImportChapter[];
}

@Schema()
export class NovelImportMeta {
  @Field({ minLength: 1, maxLength: PROJECT_TITLE_MAX_LENGTH, description: 'Novel title, limited to the project name column capacity.' })
  title: string;

  @Field({ minLength: 1, description: "Novel overview used as the project's brief and exported description." })
  synopsis: string;

  @Field({ optional: true, description: 'Optional authoring metadata; accepted but not currently persisted.' })
  genre?: string;

  @Field(() => [String], { optional: true, description: 'Novel tags stored as project themes.' })
  tags?: string[];

  @Field({ optional: true, description: 'Name of the bundle asset to use as the novel cover.' })
  cover?: string;

  @Field({ optional: true, description: 'Chapter-writing instructions; omission uses the application default.' })
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

  @Field(() => [NovelImportVolume], {
    minItems: 1,
    description: 'Ordered volume groups; global chapter numbers are derived by flattening them in ordinal order.',
  })
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
