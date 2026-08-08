import { and, asc, eq } from 'drizzle-orm';
import { zipSync } from 'fflate';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService, StorageService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

interface ManifestChapter {
  title: string;
  file: string;
}

interface ManifestCharacterVariant {
  image: string;
  label?: string;
}

interface ManifestCharacter {
  name: string;
  image?: string;
  description?: string;
  variants?: ManifestCharacterVariant[];
}

interface ManifestScene {
  image: string;
  chapter?: string;
  caption?: string;
}

// The `.novel` manifest shape Pocket Library's importer enforces (schemaVersion 1); paths are relative
// to the zip root. Mirrors `pocket-library/src/core/types/manifest.types.ts` — keep the two in sync.
interface NovelManifest {
  schemaVersion: 1;
  id: string;
  title: string;
  author?: string;
  description?: string;
  cover?: string;
  tags?: string[];
  characters?: ManifestCharacter[];
  scenes?: ManifestScene[];
  chapters: ManifestChapter[];
}

interface SourceChapter {
  number: number;
  title: string | null;
  content: string | null;
}

interface LoadedImage {
  bytes: Uint8Array;
  ext: string;
}

export interface NovelPackage {
  id: string;
  filename: string;
  bytes: Uint8Array;
  chapterCount: number;
  imageCount: number;
}

const SCHEMA_VERSION = 1 as const;
const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Builds a `.novel` package (a zip of `manifest.json` + chapter Markdown + images) from a project, in
 * the exact shape Pocket Library imports. Chapters come from the canonical `chapters` table, falling
 * back to `drafts` for a new novel that has not finalised any chapters yet. Cover, character portraits,
 * and scene images are best-effort — a missing/unreadable image is skipped, never fatal.
 */
@Injectable()
export class NovelPackageService {
  private readonly logger = Logger.getLogger(APP_NAME, NovelPackageService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storage: StorageService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async build(projectId: bigint): Promise<NovelPackage> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();

    const chapters = await this.loadChapters(projectId);
    if (chapters.length === 0) throw AppErrorCode.EXP_001.create();
    this.logger.info('export: building novel package', { projectId, chapters: chapters.length });

    const files: Record<string, Uint8Array> = {};
    const encoder = new TextEncoder();

    // Chapter files + manifest entries, plus a number→file map so scene tags can reference a real file.
    const fileByChapter = new Map<number, string>();
    const manifestChapters: ManifestChapter[] = chapters.map(chapter => {
      const file = `chapters/${String(chapter.number).padStart(4, '0')}.md`;
      fileByChapter.set(chapter.number, file);
      files[file] = encoder.encode(chapter.content ?? '');
      return { title: chapter.title?.trim() || `Chapter ${chapter.number}`, file };
    });

    const cover = await this.packImage(files, project.coverImagePath, 'images/cover');
    const characters = await this.packCharacters(projectId, files);
    const scenes = await this.packScenes(projectId, files, fileByChapter);

    const tags = Array.isArray(project.themes) ? (project.themes as unknown[]).filter((t): t is string => typeof t === 'string' && t.length > 0) : [];
    const id = `${slugify(project.title?.trim() || project.name) || 'novel'}-${projectId}`;
    const manifest: NovelManifest = {
      schemaVersion: SCHEMA_VERSION,
      id,
      title: project.title?.trim() || project.name,
      description: project.brief?.trim() || project.premise?.trim() || undefined,
      cover,
      tags: tags.length > 0 ? tags : undefined,
      characters: characters.length > 0 ? characters : undefined,
      scenes: scenes.length > 0 ? scenes : undefined,
      chapters: manifestChapters,
    };
    files['manifest.json'] = encoder.encode(JSON.stringify(manifest, null, 2));

    const bytes = zipSync(files, { level: 6 });
    const imageCount = Object.keys(files).filter(name => name.startsWith('images/')).length;
    this.logger.info('export: novel package built', { projectId, id, chapters: manifestChapters.length, images: imageCount, bytes: bytes.length });
    return { id, filename: `${id}.novel`, bytes, chapterCount: manifestChapters.length, imageCount };
  }

  /** Canonical chapters first; fall back to drafts so an in-progress new novel can still be exported. */
  private async loadChapters(projectId: bigint): Promise<SourceChapter[]> {
    const finalized = await this.db
      .select({ number: schema.chapters.number, title: schema.chapters.title, content: schema.chapters.content })
      .from(schema.chapters)
      .where(eq(schema.chapters.projectId, projectId))
      .orderBy(asc(schema.chapters.number));
    const usable = finalized.filter(c => (c.content ?? '').trim().length > 0);
    if (usable.length > 0) return usable;

    const drafts = await this.db
      .select({ number: schema.drafts.chapter, title: schema.drafts.title, content: schema.drafts.body })
      .from(schema.drafts)
      .where(eq(schema.drafts.projectId, projectId))
      .orderBy(asc(schema.drafts.chapter));
    return drafts.filter(c => (c.content ?? '').trim().length > 0);
  }

  private async packCharacters(projectId: bigint, files: Record<string, Uint8Array>): Promise<ManifestCharacter[]> {
    const entities = await this.db.query.entities.findMany({
      where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.type, 'character')),
      orderBy: [asc(schema.entities.id)],
    });

    const characters: ManifestCharacter[] = [];
    for (const entity of entities) {
      const slug = slugify(entity.entityKey) || `character-${entity.id}`;
      const image = await this.packImage(files, entity.imagePath, `images/characters/${slug}`);

      const gallery = await this.db
        .select({ imagePath: schema.entityImages.imagePath, caption: schema.entityImages.caption })
        .from(schema.entityImages)
        .where(eq(schema.entityImages.entityId, entity.id))
        .orderBy(asc(schema.entityImages.sortOrder), asc(schema.entityImages.id));
      const variants: ManifestCharacterVariant[] = [];
      for (const [index, row] of gallery.entries()) {
        const variantImage = await this.packImage(files, row.imagePath, `images/characters/${slug}-v${index + 1}`);
        if (variantImage) variants.push({ image: variantImage, label: row.caption ?? undefined });
      }

      // Skip characters with no art — Pocket Library falls back to a letter placeholder anyway, and a
      // roster of imageless extracted entities would bloat the manifest with nothing to show.
      if (!image && variants.length === 0) continue;
      characters.push({
        name: entity.name,
        image,
        description: entity.notes?.trim() || entity.motivation?.trim() || undefined,
        variants: variants.length > 0 ? variants : undefined,
      });
    }
    return characters;
  }

  private async packScenes(projectId: bigint, files: Record<string, Uint8Array>, fileByChapter: Map<number, string>): Promise<ManifestScene[]> {
    const rows = await this.db
      .select({ chapter: schema.chapterImages.chapter, imagePath: schema.chapterImages.imagePath, caption: schema.chapterImages.caption })
      .from(schema.chapterImages)
      .where(eq(schema.chapterImages.projectId, projectId))
      .orderBy(asc(schema.chapterImages.chapter), asc(schema.chapterImages.sortOrder), asc(schema.chapterImages.id));

    const scenes: ManifestScene[] = [];
    for (const [index, row] of rows.entries()) {
      const image = await this.packImage(files, row.imagePath, `images/scenes/${String(row.chapter).padStart(4, '0')}-${index + 1}`);
      if (!image) continue;
      // Tag the scene to its chapter's file (unmatched → untagged, which the importer shows on every chapter).
      scenes.push({ image, chapter: fileByChapter.get(row.chapter), caption: row.caption ?? undefined });
    }
    return scenes;
  }

  /** Reads an image ref, writes it under `basePath.<ext>`, and returns that path — or undefined on any miss. */
  private async packImage(files: Record<string, Uint8Array>, ref: string | null | undefined, basePath: string): Promise<string | undefined> {
    if (!ref) return undefined;
    const image = await this.readImage(ref);
    if (!image) return undefined;
    const path = `${basePath}.${image.ext}`;
    files[path] = image.bytes;
    return path;
  }

  private async readImage(ref: string): Promise<LoadedImage | null> {
    try {
      const { bytes, contentType } = await this.storage.read(ref);
      return { bytes, ext: MIME_EXT[contentType] ?? 'png' };
    } catch (err) {
      this.logger.warn('export: skipping unreadable image', { ref, err });
      return null;
    }
  }
}
