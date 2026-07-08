/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';
import { and, asc, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class CatalogService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async render(projectId: bigint): Promise<string> {
    const [chapters, volumes, entities, worldFacts, plotThreads, mysteries] = await Promise.all([
      this.db.query.chapters.findMany({ where: eq(schema.chapters.projectId, projectId), orderBy: asc(schema.chapters.number) }),
      this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: asc(schema.volumes.ordinal) }),
      // Entity deletion is a hard delete; a `ne(origin, 'deleted')` filter here previously crashed
      // every real render — 'deleted' is not an entity_origin enum value.
      this.db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId) }),
      this.db.query.worldFacts.findMany({ where: eq(schema.worldFacts.projectId, projectId) }),
      this.db.query.plotThreads.findMany({ where: and(eq(schema.plotThreads.projectId, projectId), eq(schema.plotThreads.status, 'open')) }),
      this.db.query.mysteries.findMany({ where: and(eq(schema.mysteries.projectId, projectId), eq(schema.mysteries.status, 'open')) }),
    ]);

    const parts: string[] = [];

    if (chapters.length > 0) {
      const lines = chapters.map(ch => {
        const tag = ch.generator === 'grok' ? ' [grok]' : ch.status === 'done' ? '' : ' [draft]';
        const suffix = ch.status === 'done' && ch.summary && ch.summary.length <= 60 ? ` (${ch.summary})` : '';
        return `${ch.number} — ${ch.title ?? `Chapter ${ch.number}`}${tag}${suffix}`;
      });
      parts.push('CHAPTERS:\n' + lines.join('\n'));
    }

    if (volumes.length > 0) {
      const lines = volumes.map(v => {
        const range = v.startChapter != null ? `ch ${v.startChapter}-${v.endChapter != null ? v.endChapter : '?'}` : 'ch ?-?';
        const label = `v${String(v.ordinal).padStart(2, '0')}`;
        return `${label} — ${v.title ?? v.volumeKey} (${range})`;
      });
      parts.push('VOLUMES:\n' + lines.join('\n'));
    }

    if (entities.length > 0) {
      const lines = entities.map(e => {
        const descriptor = (e.body ?? e.notes ?? '').replace(/\n/g, ' ').slice(0, 80);
        const status = e.status ?? 'active';
        return `${e.entityKey} — ${e.type}: ${descriptor} (${status})`;
      });
      parts.push('ENTITIES:\n' + lines.join('\n'));
    }

    if (worldFacts.length > 0) {
      const byCategory = new Map<string, string[]>();
      for (const f of worldFacts) {
        if (!byCategory.has(f.category)) byCategory.set(f.category, []);
        const catKeys = byCategory.get(f.category);
        if (catKeys) catKeys.push(f.key);
      }
      const lines: string[] = [];
      for (const [category, keys] of byCategory) {
        lines.push(`${category}: ${keys.join(' | ')}`);
      }
      parts.push('WORLD FACTS:\n' + lines.join('\n'));
    }

    if (plotThreads.length > 0) {
      const lines = plotThreads.map(t => `${t.threadKey} — ${t.summary ?? ''} (open since ch ${t.openedChapter ?? '?'})`);
      parts.push('OPEN PLOT THREADS:\n' + lines.join('\n'));
    }

    if (mysteries.length > 0) {
      const lines = mysteries.map(m => `${m.mysteryKey} — open: ${m.question} (ch ${m.openedChapter ?? '?'})`);
      parts.push('UNRESOLVED MYSTERIES:\n' + lines.join('\n'));
    }

    return parts.join('\n\n');
  }
}
