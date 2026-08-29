import { and, asc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

// A long-running project's chapters/entities grow unboundedly; canon facts and world facts (already
// keys-only) are left uncapped since planning correctness — reveal scheduling, ref resolution —
// depends on the outliner seeing all of them. Recent chapters matter far more to planning continuity
// than old ones, and a project's core cast rarely exceeds a couple hundred named entities.
const CATALOG_CHAPTER_CAP = 50;
const CATALOG_ENTITY_CAP = 150;

@Injectable()
export class CatalogService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  // Renders every canon fact including still-hidden ones, in full. Safe only because this catalog
  // reaches planning contexts (outline, arc planning, chat hub) and never `forChapter`, the
  // prose-writing pack — the outliner cannot schedule a reveal it is not allowed to read.
  async render(projectId: bigint): Promise<string> {
    const [chapters, volumes, entities, worldFacts, plotThreads, mysteries, canonFacts, revealedRows] = await Promise.all([
      this.db.query.chapters.findMany({ where: eq(schema.chapters.projectId, projectId), orderBy: asc(schema.chapters.number) }),
      this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: asc(schema.volumes.ordinal) }),
      // Entity deletion is a hard delete; a `ne(origin, 'deleted')` filter here previously crashed
      // every real render — 'deleted' is not an entity_origin enum value.
      this.db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId) }),
      this.db.query.worldFacts.findMany({ where: eq(schema.worldFacts.projectId, projectId) }),
      this.db.query.plotThreads.findMany({ where: and(eq(schema.plotThreads.projectId, projectId), eq(schema.plotThreads.status, 'open')) }),
      this.db.query.mysteries.findMany({ where: and(eq(schema.mysteries.projectId, projectId), eq(schema.mysteries.status, 'open')) }),
      this.db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId), orderBy: asc(schema.canonFacts.factKey) }),
      this.db.query.characterKnowledge.findMany({ columns: { factId: true }, where: eq(schema.characterKnowledge.projectId, projectId) }),
    ]);
    const revealedFactIds = new Set(revealedRows.map(row => row.factId));

    const parts: string[] = [];

    if (chapters.length > 0) {
      const omitted = Math.max(0, chapters.length - CATALOG_CHAPTER_CAP);
      const shown = omitted > 0 ? chapters.slice(-CATALOG_CHAPTER_CAP) : chapters;
      const lines = shown.map(ch => {
        const tag = ch.isolated ? ' [unrestricted]' : ch.status === 'done' ? '' : ' [draft]';
        const suffix = ch.status === 'done' && ch.summary && ch.summary.length <= 60 ? ` (${ch.summary})` : '';
        return `${ch.number} — ${ch.title ?? `Chapter ${ch.number}`}${tag}${suffix}`;
      });
      if (omitted > 0) lines.unshift(`(+${omitted} earlier chapters omitted)`);
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
      const omitted = Math.max(0, entities.length - CATALOG_ENTITY_CAP);
      // Major entities first (a project's core cast), preserving DB order as the tiebreak within each tier.
      const ranked = omitted > 0 ? [...entities].sort((a, b) => (a.significance === 'major' ? 0 : 1) - (b.significance === 'major' ? 0 : 1)) : entities;
      const shown = ranked.slice(0, CATALOG_ENTITY_CAP);
      const lines = shown.map(e => {
        const descriptor = (e.body ?? e.notes ?? '').replace(/\n/g, ' ').slice(0, 80);
        const status = e.status ?? 'active';
        return `${e.entityKey} — ${e.type}: ${descriptor} (${status})`;
      });
      if (omitted > 0) lines.unshift(`(+${omitted} minor entities omitted)`);
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

    if (canonFacts.length > 0) {
      const lines = canonFacts.map(f => {
        const text = f.text.replace(/\n/g, ' ').slice(0, 160);
        const status = revealedFactIds.has(f.id) ? ' (revealed)' : f.revealChapter != null ? ` (unrevealed; scheduled ch ${f.revealChapter})` : ' (unrevealed)';
        return `${f.factKey}: ${text}${status}`;
      });
      parts.push('CANON FACTS:\n' + lines.join('\n'));
    }

    return parts.join('\n\n');
  }
}
