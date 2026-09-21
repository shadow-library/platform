import { and, asc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { bibleDocExcerpt, bibleDocLabel, bibleDocRef, type BibleDocRow, clipAtBoundary, hasBibleContent, rankBibleDocs } from './bible-docs';
import { countTokens } from './token-budget';

// A long-running project's chapters/entities grow unboundedly; canon facts and world facts (already
// keys-only) are capped only by a caller's `maxTokens`, since reveal scheduling and ref resolution
// depend on the outliner seeing as many of them as fit. Recent chapters matter far more to planning
// continuity than old ones, and a project's core cast rarely exceeds a couple hundred named entities.
const CATALOG_CHAPTER_CAP = 50;
const CATALOG_ENTITY_CAP = 150;
// A planner reads an entity through its descriptor, so the focus cast and the major entities get a real description while the
// entity section stays within its budget; every other entity keeps a short one. 600 characters is two or three sentences.
export const RICH_DESCRIPTOR_CHARS = 600;
export const SHORT_DESCRIPTOR_CHARS = 100;
export const CATALOG_ENTITY_BUDGET = 9_000;
export const CATALOG_DOCUMENT_BUDGET = 3_000;
const DOCUMENT_EXCERPT_CHARS = 160;

export interface CatalogOptions {
  /** Entity keys the caller is planning around — the volume's or arc's cast — ranked first and described first. */
  focusEntityKeys?: readonly string[];
  /** Lists the citable bible documents; only a surface that turns catalog entries into context refs needs them. */
  documents?: boolean;
  /** `compact` gives every entity the short descriptor, for a surface that can look an entity up instead. */
  descriptors?: 'rich' | 'compact';
  /** A hard ceiling on the rendered catalog; lines are left out in `TRIM_ORDER`, each section losing its lowest-priority lines first. */
  maxTokens?: number;
}

type CatalogPartKey = 'chapters' | 'volumes' | 'entities' | 'world_facts' | 'threads' | 'mysteries' | 'canon_facts' | 'documents';

interface CatalogPart {
  key: CatalogPartKey;
  header: string;
  /** Highest priority first, except where `trimFrom` is `start`: chapters read oldest first and lose their oldest first. */
  lines: string[];
  trimFrom: 'start' | 'end';
  omittedLabel: string;
  omitted: number;
}

// World facts resolve by category even when unlisted and old chapters survive as summaries, so they go first; the entity roster,
// which every other ref and the POV hang off, goes last.
const TRIM_ORDER: readonly CatalogPartKey[] = ['world_facts', 'chapters', 'mysteries', 'threads', 'documents', 'canon_facts', 'entities'];

type EntityRow = typeof schema.entities.$inferSelect;

function entityDescriptorSource(entity: EntityRow): string {
  return entity.body?.trim() || entity.notes?.trim() || '';
}

function entityLine(entity: EntityRow, maxChars: number): string {
  return `${entity.entityKey} — ${entity.type}: ${clipAtBoundary(entityDescriptorSource(entity), maxChars)} (${entity.status ?? 'active'})`;
}

function byKey(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

// The first mention wins, so a caller listing the arc cast before the volume cast ranks the arc cast first.
function rankEntities(entities: EntityRow[], focusKeys: readonly string[]): EntityRow[] {
  const focus = new Map<string, number>();
  focusKeys.forEach((key, index) => {
    if (!focus.has(key)) focus.set(key, index);
  });
  const rank = (entity: EntityRow): number => focus.get(entity.entityKey) ?? focusKeys.length + (entity.significance === 'major' ? 0 : 1);
  return [...entities].sort((left, right) => rank(left) - rank(right) || byKey(left.entityKey, right.entityKey));
}

// Every shown entity starts on the short descriptor; they are then upgraded in rank order while the section stays in budget.
function renderEntityLines(ranked: EntityRow[], descriptors: CatalogOptions['descriptors']): string[] {
  const short = ranked.map(entity => entityLine(entity, SHORT_DESCRIPTOR_CHARS));
  if (descriptors === 'compact') return short;

  const lines = [...short];
  let used = short.reduce((sum, line) => sum + countTokens(line) + 1, 0);
  ranked.forEach((entity, index) => {
    const rich = entityLine(entity, RICH_DESCRIPTOR_CHARS);
    const current = lines[index] ?? '';
    if (rich === current) return;
    const delta = countTokens(rich) - countTokens(current);
    if (used + delta > CATALOG_ENTITY_BUDGET) return;
    lines[index] = rich;
    used += delta;
  });
  return lines;
}

function renderDocumentLines(documents: BibleDocRow[]): { lines: string[]; omitted: number } {
  const lines: string[] = [];
  const ranked = rankBibleDocs(documents.filter(hasBibleContent));
  let used = 0;
  for (const doc of ranked) {
    const label = bibleDocLabel(doc);
    const excerpt = bibleDocExcerpt(doc, DOCUMENT_EXCERPT_CHARS);
    const line = `${bibleDocRef(doc)} — ${label}${excerpt && excerpt !== label ? `: ${excerpt}` : ''}`;
    const tokens = countTokens(line) + 1;
    if (used + tokens > CATALOG_DOCUMENT_BUDGET) break;
    lines.push(line);
    used += tokens;
  }
  return { lines, omitted: ranked.length - lines.length };
}

function renderPart(part: CatalogPart): string {
  const note = part.omitted > 0 ? [`(+${part.omitted} ${part.omittedLabel} omitted)`] : [];
  return [part.header, ...note, ...part.lines].join('\n');
}

function renderParts(parts: CatalogPart[]): string {
  return parts.map(renderPart).join('\n\n');
}

/** Leaves out lines until the catalog fits, returning how many each section lost to the ceiling. */
function trimToCeiling(parts: CatalogPart[], maxTokens: number): Partial<Record<CatalogPartKey, number>> {
  const trimmed: Partial<Record<CatalogPartKey, number>> = {};
  // A removed line's own count ignores the omission note it adds, so a pass can end slightly over; the next pass settles it.
  for (let pass = 0; pass < 3; pass++) {
    for (const key of TRIM_ORDER) {
      let over = countTokens(renderParts(parts)) - maxTokens;
      if (over <= 0) return trimmed;
      const part = parts.find(candidate => candidate.key === key);
      while (part && over > 0 && part.lines.length > 0) {
        const line = part.trimFrom === 'start' ? part.lines.shift() : part.lines.pop();
        part.omitted++;
        trimmed[key] = (trimmed[key] ?? 0) + 1;
        over -= countTokens(line ?? '') + 1;
      }
    }
  }
  return trimmed;
}

type CanonFactRow = typeof schema.canonFacts.$inferSelect;

// Scheduled reveals are what the outliner plans around, then the still-hidden facts, then what the reader already knows.
function factPriority(fact: CanonFactRow, revealed: boolean): number {
  if (revealed) return 2;
  return fact.revealChapter != null ? 0 : 1;
}

@Injectable()
export class CatalogService {
  private readonly logger = Logger.getLogger(APP_NAME, CatalogService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  // Renders every canon fact including still-hidden ones, in full. Safe only because this catalog
  // reaches planning contexts (outline, arc planning, chat hub) and never `forChapter`, the
  // prose-writing pack — the outliner cannot schedule a reveal it is not allowed to read.
  // Every section is sorted in memory with a key as the last tiebreak: the catalog sits in cached prefixes, so row order must never move it.
  async render(projectId: bigint, options: CatalogOptions = {}): Promise<string> {
    const [chapters, volumes, entities, worldFacts, plotThreads, mysteries, canonFacts, revealedRows, documents] = await Promise.all([
      this.db.query.chapters.findMany({ where: eq(schema.chapters.projectId, projectId), orderBy: asc(schema.chapters.number) }),
      this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: asc(schema.volumes.ordinal) }),
      // Entity deletion is a hard delete; a `ne(origin, 'deleted')` filter here previously crashed
      // every real render — 'deleted' is not an entity_origin enum value.
      this.db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId), orderBy: asc(schema.entities.entityKey) }),
      this.db.query.worldFacts.findMany({ where: eq(schema.worldFacts.projectId, projectId), orderBy: [asc(schema.worldFacts.category), asc(schema.worldFacts.key)] }),
      this.db.query.plotThreads.findMany({
        where: and(eq(schema.plotThreads.projectId, projectId), eq(schema.plotThreads.status, 'open')),
        orderBy: asc(schema.plotThreads.threadKey),
      }),
      this.db.query.mysteries.findMany({
        where: and(eq(schema.mysteries.projectId, projectId), eq(schema.mysteries.status, 'open')),
        orderBy: asc(schema.mysteries.mysteryKey),
      }),
      this.db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId), orderBy: asc(schema.canonFacts.factKey) }),
      this.db.query.characterKnowledge.findMany({ columns: { factId: true }, where: eq(schema.characterKnowledge.projectId, projectId) }),
      options.documents
        ? this.db.query.bibleDocuments.findMany({
            columns: { section: true, slug: true, frontmatter: true, body: true },
            where: eq(schema.bibleDocuments.projectId, projectId),
          })
        : [],
    ]);
    const revealedFactIds = new Set(revealedRows.map(row => row.factId));

    const parts: CatalogPart[] = [];
    const part = (key: CatalogPartKey, header: string, lines: string[], omittedLabel: string, omitted = 0, trimFrom: CatalogPart['trimFrom'] = 'end'): void => {
      if (lines.length > 0 || omitted > 0) parts.push({ key, header, lines, trimFrom, omittedLabel, omitted });
    };

    const sortedChapters = [...chapters].sort((left, right) => left.number - right.number);
    const shownChapters = sortedChapters.slice(-CATALOG_CHAPTER_CAP);
    const chapterLines = shownChapters.map(ch => {
      const tag = ch.isolated ? ' [unrestricted]' : ch.status === 'done' ? '' : ' [draft]';
      const suffix = ch.status === 'done' && ch.summary && ch.summary.length <= 60 ? ` (${ch.summary})` : '';
      return `${ch.number} — ${ch.title ?? `Chapter ${ch.number}`}${tag}${suffix}`;
    });
    part('chapters', 'CHAPTERS:', chapterLines, 'earlier chapters', sortedChapters.length - shownChapters.length, 'start');

    const volumeLines = [...volumes]
      .sort((left, right) => left.ordinal - right.ordinal || byKey(left.volumeKey, right.volumeKey))
      .map(v => {
        const range = v.startChapter != null ? `ch ${v.startChapter}-${v.endChapter != null ? v.endChapter : '?'}` : 'ch ?-?';
        return `v${String(v.ordinal).padStart(2, '0')} — ${v.title ?? v.volumeKey} (${range})`;
      });
    part('volumes', 'VOLUMES:', volumeLines, 'volumes');

    const rankedEntities = rankEntities(entities, options.focusEntityKeys ?? []);
    const entityLines = renderEntityLines(rankedEntities.slice(0, CATALOG_ENTITY_CAP), options.descriptors);
    part('entities', 'ENTITIES:', entityLines, 'minor entities', Math.max(0, rankedEntities.length - CATALOG_ENTITY_CAP));

    const byCategory = new Map<string, string[]>();
    for (const fact of [...worldFacts].sort((left, right) => byKey(left.category, right.category) || byKey(left.key, right.key))) {
      byCategory.set(fact.category, [...(byCategory.get(fact.category) ?? []), fact.key]);
    }
    part(
      'world_facts',
      'WORLD FACTS:',
      [...byCategory].map(([category, keys]) => `${category}: ${keys.join(' | ')}`),
      'world fact categories',
    );

    const threadLines = [...plotThreads]
      .sort(
        (left, right) => (right.lastAdvancedChapter ?? right.openedChapter ?? 0) - (left.lastAdvancedChapter ?? left.openedChapter ?? 0) || byKey(left.threadKey, right.threadKey),
      )
      .map(t => `${t.threadKey} — ${t.summary ?? ''} (open since ch ${t.openedChapter ?? '?'})`);
    part('threads', 'OPEN PLOT THREADS:', threadLines, 'less recently advanced threads');

    const mysteryLines = [...mysteries]
      .sort(
        (left, right) =>
          (right.lastAdvancedChapter ?? right.openedChapter ?? 0) - (left.lastAdvancedChapter ?? left.openedChapter ?? 0) || byKey(left.mysteryKey, right.mysteryKey),
      )
      .map(m => `${m.mysteryKey} — open: ${m.question} (ch ${m.openedChapter ?? '?'})`);
    part('mysteries', 'UNRESOLVED MYSTERIES:', mysteryLines, 'less recently advanced mysteries');

    const factLines = [...canonFacts]
      .sort(
        (left, right) =>
          factPriority(left, revealedFactIds.has(left.id)) - factPriority(right, revealedFactIds.has(right.id)) ||
          (left.revealChapter ?? 0) - (right.revealChapter ?? 0) ||
          byKey(left.factKey, right.factKey),
      )
      .map(f => {
        const text = f.text.replace(/\n/g, ' ').slice(0, 160);
        const status = revealedFactIds.has(f.id) ? ' (revealed)' : f.revealChapter != null ? ` (unrevealed; scheduled ch ${f.revealChapter})` : ' (unrevealed)';
        return `${f.factKey}: ${text}${status}`;
      });
    part('canon_facts', 'CANON FACTS:', factLines, 'lower-priority canon facts');

    const documentLines = renderDocumentLines(documents);
    part('documents', 'BIBLE DOCUMENTS (cite with the ref exactly as written):', documentLines.lines, 'lower-priority documents', documentLines.omitted);

    if (options.maxTokens !== undefined) {
      const trimmed = trimToCeiling(parts, options.maxTokens);
      if (Object.keys(trimmed).length > 0) this.logger.info('catalog trimmed to its ceiling', { projectId, maxTokens: options.maxTokens, trimmed });
    }
    return renderParts(parts);
  }
}
