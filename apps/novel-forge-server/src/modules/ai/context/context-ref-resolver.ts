import { and, eq, inArray, or } from 'drizzle-orm';

import { type PlanOverlay } from '@server/common';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { loadWriterHiddenFactKeys } from '../../bible/fact/knowledge-view';
import { loadWriterDisclosurePolicy, WriterDisclosurePolicy } from '../../bible/fact/writer-disclosure-policy';
import { type BridgeLoader, bridgeLoader, type IsolationBridge } from '../../finalize-review/isolation-bridge';
import { isWriterExcludedBibleDoc } from './bible-docs';
import { type CanonFactRow, type EntityCardRow, entityCardTier, entityLabel, makeRefSection, matchWorldFacts, renderEntityCard, walledOff, type WorldFactRow } from './pack-render';
import { type ContextSection } from './sections';
import { truncateAtParagraph } from './token-budget';

export interface ResolvedRefs {
  resolved: ContextSection[];
  unresolved: string[];
  /** Refs the chapter's disclosure policy refused on purpose — later volumes, chapters, threads and mysteries, excluded pages. */
  withheld: string[];
  /** The resolved `entity:` refs whose entity is a character. */
  characters: string[];
  /** The resolved `fact:` refs the writer reads as a writing constraint: a locked secret's cover note in place of its truth. */
  constraints: string[];
}

export interface WriterRefs {
  /** The refs the plan cites that resolve to a section the writer may read, in the plan's order — before any budget cut the pack makes. */
  included: string[];
  unresolved: string[];
  withheld: string[];
  constraints: string[];
}

export const ENTITY_CARD_BUDGET = 800;

interface ResolvedRefRows {
  entityMap: Map<string, EntityCardRow>;
  worldFactRows: WorldFactRow[];
  threadMap: Map<string, typeof schema.plotThreads.$inferSelect>;
  mysteryMap: Map<string, typeof schema.mysteries.$inferSelect>;
  chapterMap: Map<number, typeof schema.chapters.$inferSelect>;
  volumeMap: Map<string, schema.Plan.Volume>;
  bibleDocMap: Map<string, typeof schema.bibleDocuments.$inferSelect>;
  factMap: Map<string, CanonFactRow>;
  hiddenFactKeys: ReadonlySet<string> | null;
  disclosure: WriterDisclosurePolicy;
  bridges: ReadonlyMap<number, IsolationBridge>;
}

export class ContextRefResolver {
  constructor(private readonly db: PrimaryDatabase) {}

  /** `chapter` is the chapter the refs are resolved for; it makes the sections writer-safe for it. */
  async resolveRefs(projectId: bigint, refs: string[], chapter?: number): Promise<ResolvedRefs> {
    const disclosure = chapter !== undefined && refs.length > 0 ? await loadWriterDisclosurePolicy(this.db, projectId, chapter) : WriterDisclosurePolicy.planner();
    return this.resolveRefsFor(projectId, refs, chapter, disclosure);
  }

  /** Which refs the writer of `chapter` would read under `disclosure`, by ref alone: a preview never carries their content. */
  async writerRefs(projectId: bigint, refs: string[], chapter: number, disclosure: WriterDisclosurePolicy, overlay?: PlanOverlay): Promise<WriterRefs> {
    if (refs.length === 0) return { included: [], unresolved: [], withheld: [], constraints: [] };
    const { resolved, unresolved, withheld, constraints } = await this.resolveRefsFor(projectId, refs, chapter, disclosure, overlay);
    return { included: resolved.flatMap(section => section.sourceRefs), unresolved, withheld, constraints };
  }

  async resolveRefsFor(
    projectId: bigint,
    refs: string[],
    chapter: number | undefined,
    disclosure: WriterDisclosurePolicy,
    overlay?: PlanOverlay,
    loadBridges: BridgeLoader = bridgeLoader(this.db, projectId),
  ): Promise<ResolvedRefs> {
    const refused = refs.filter(ref => !disclosure.canResolve(ref));
    const uniqueRefs = [...new Set(refs)].filter(ref => disclosure.canResolve(ref));
    const entityKeys: string[] = [];
    const worldFactValues: string[] = [];
    const threadKeys: string[] = [];
    const mysteryKeys: string[] = [];
    const chapterNumbers: number[] = [];
    const volumeKeys: string[] = [];
    const bibleDocRefs: { section: string; slug: string }[] = [];
    const factKeys: string[] = [];

    for (const ref of uniqueRefs) {
      const colon = ref.indexOf(':');
      if (colon === -1) continue;
      const prefix = ref.slice(0, colon);
      const value = ref.slice(colon + 1);
      switch (prefix) {
        case 'entity':
          entityKeys.push(value);
          break;
        case 'world_fact':
          worldFactValues.push(value, ...value.split('/'));
          break;
        case 'thread':
          threadKeys.push(value);
          break;
        case 'mystery':
          mysteryKeys.push(value);
          break;
        case 'chapter':
          chapterNumbers.push(parseInt(value, 10));
          break;
        case 'volume':
          volumeKeys.push(value);
          break;
        case 'bible_doc': {
          const slashIdx = value.indexOf('/');
          bibleDocRefs.push({ section: slashIdx === -1 ? value : value.slice(0, slashIdx), slug: slashIdx === -1 ? '' : value.slice(slashIdx + 1) });
          break;
        }
        case 'fact':
          factKeys.push(value);
          break;
      }
    }

    const worldFactLookup = [...new Set(worldFactValues)];
    const [entitiesRows, worldFactRows, threadRows, mysteryRows, chapterRows, volumeRows, bibleDocRows, factRows] = await Promise.all([
      entityKeys.length > 0
        ? this.db.query.entities.findMany({ where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, entityKeys)), with: { aliases: true } })
        : [],
      worldFactLookup.length > 0
        ? this.db.query.worldFacts.findMany({
            where: and(eq(schema.worldFacts.projectId, projectId), or(inArray(schema.worldFacts.category, worldFactLookup), inArray(schema.worldFacts.key, worldFactLookup))),
            orderBy: [schema.worldFacts.category, schema.worldFacts.key],
          })
        : [],
      threadKeys.length > 0
        ? this.db.query.plotThreads.findMany({ where: and(eq(schema.plotThreads.projectId, projectId), inArray(schema.plotThreads.threadKey, threadKeys)) })
        : [],
      mysteryKeys.length > 0 ? this.db.query.mysteries.findMany({ where: and(eq(schema.mysteries.projectId, projectId), inArray(schema.mysteries.mysteryKey, mysteryKeys)) }) : [],
      chapterNumbers.length > 0 ? this.db.query.chapters.findMany({ where: and(eq(schema.chapters.projectId, projectId), inArray(schema.chapters.number, chapterNumbers)) }) : [],
      volumeKeys.length > 0 ? this.db.query.volumes.findMany({ where: and(eq(schema.volumes.projectId, projectId), inArray(schema.volumes.volumeKey, volumeKeys)) }) : [],
      bibleDocRefs.length > 0
        ? this.db.query.bibleDocuments.findMany({
            where: and(
              eq(schema.bibleDocuments.projectId, projectId),
              inArray(schema.bibleDocuments.section, [...new Set(bibleDocRefs.map(r => r.section))] as schema.Bible.Section[]),
              inArray(schema.bibleDocuments.slug, [...new Set(bibleDocRefs.map(r => r.slug))]),
            ),
          })
        : [],
      factKeys.length > 0 ? this.db.query.canonFacts.findMany({ where: and(eq(schema.canonFacts.projectId, projectId), inArray(schema.canonFacts.factKey, factKeys)) }) : [],
    ]);

    const entityMap = new Map(entitiesRows.map(e => [e.entityKey, e]));
    const threadMap = new Map(threadRows.map(t => [t.threadKey, t]));
    const mysteryMap = new Map(mysteryRows.map(m => [m.mysteryKey, m]));
    const chapterMap = new Map(chapterRows.map(c => [c.number, c]));
    const volumeMap = new Map(volumeRows.map(v => [v.volumeKey, v]));
    const bibleDocMap = new Map(bibleDocRows.map(d => [`${d.section}/${d.slug}`, d]));
    const factMap = new Map(factRows.map(f => [f.factKey, f]));
    const hiddenFactKeys = chapter !== undefined && factRows.length > 0 ? await loadWriterHiddenFactKeys(this.db, projectId, chapter, factRows, overlay) : null;
    const bridges = await loadBridges(chapterRows.map(row => ({ chapter: row.number, isolated: row.isolated })));

    const resolved: ContextSection[] = [];
    const unresolved: string[] = [];
    const withheld: string[] = [...new Set(refused)];
    const constraints: string[] = [];

    for (const ref of uniqueRefs) {
      const colon = ref.indexOf(':');
      const prefix = colon === -1 ? '' : ref.slice(0, colon);
      const value = ref.slice(colon + 1);
      if (prefix === 'fact' && hiddenFactKeys?.has(value) && !factMap.get(value)?.writerNote?.trim()) continue;
      const opened = prefix === 'thread' ? threadMap.get(value) : prefix === 'mystery' ? mysteryMap.get(value) : undefined;
      if (opened && !disclosure.opensBy(opened.openedChapter)) {
        withheld.push(ref);
        continue;
      }
      const rows = { entityMap, worldFactRows, threadMap, mysteryMap, chapterMap, volumeMap, bibleDocMap, factMap, hiddenFactKeys, disclosure, bridges };
      const section = this.resolveRef(ref, prefix, value, rows);
      if (!section) unresolved.push(ref);
      else resolved.push(section);
      if (section && prefix === 'fact' && hiddenFactKeys?.has(value)) constraints.push(ref);
    }

    const characters = uniqueRefs.filter(ref => ref.startsWith('entity:') && entityMap.get(ref.slice('entity:'.length))?.type === 'character');
    return { resolved, unresolved, withheld, characters, constraints };
  }

  /**
   * Sanitizes a model-written `requiredContext`: drops refs that resolve to nothing and every `fact:` ref, because an
   * outliner reading the catalog sees hidden facts in full and must never pin one into a chapter's context. A planner-only
   * page never resolves, so a ref to one is dropped with the rest.
   */
  async sanitizeOutlinedRefs(projectId: bigint, refs: string[]): Promise<{ kept: string[]; dropped: string[] }> {
    const candidates = refs.filter(ref => !ref.startsWith('fact:'));
    const { unresolved } = candidates.length > 0 ? await this.resolveRefs(projectId, candidates) : { unresolved: [] };
    const unresolvedSet = new Set(unresolved);
    const kept = candidates.filter(ref => !unresolvedSet.has(ref));
    const keptSet = new Set(kept);
    return { kept, dropped: refs.filter(ref => !keptSet.has(ref)) };
  }

  private resolveRef(ref: string, prefix: string, value: string, rows: ResolvedRefRows): ContextSection | null {
    const heading = (label: string): string => rows.disclosure.scrub(label, 'heading');
    const content = (text: string, field: 'entity' | 'reference' | 'summary' | 'plan' | 'bible_page' | 'knowledge'): string => rows.disclosure.scrub(text, field);
    switch (prefix) {
      case 'entity': {
        const entity = rows.entityMap.get(value);
        if (!entity) return null;
        const card = renderEntityCard(entity, ENTITY_CARD_BUDGET);
        return makeRefSection(ref, heading(entityLabel(entity)), content(card.text, 'entity'), entityCardTier(entity.status), card.truncated);
      }
      case 'world_fact': {
        const match = matchWorldFacts(rows.worldFactRows, value);
        if (!match) return null;
        const lines = match.facts.map(f => `${match.byKey ? `${f.category}/` : ''}${f.key}: ${truncateAtParagraph(f.value, 150).text}`);
        return makeRefSection(ref, heading(`WORLD FACTS: ${value}`), content(lines.join('\n'), 'reference'), 'canonical');
      }
      case 'thread': {
        const thread = rows.threadMap.get(value);
        if (!thread) return null;
        const text = `**${thread.threadKey}** (${thread.status}, ch ${thread.openedChapter ?? '?'}–${thread.closedChapter ?? '?'})\n${thread.summary ?? ''}`;
        return makeRefSection(ref, heading(`PLOT THREAD: ${thread.threadKey}`), content(text, 'reference'), 'canonical');
      }
      case 'mystery': {
        const mystery = rows.mysteryMap.get(value);
        if (!mystery) return null;
        const text = `**${mystery.mysteryKey}** (${mystery.status}, ch ${mystery.openedChapter ?? '?'})\n${mystery.question}`;
        return makeRefSection(ref, heading(`MYSTERY: ${mystery.mysteryKey}`), content(text, 'reference'), 'canonical');
      }
      case 'chapter': {
        const n = parseInt(value, 10);
        const found = rows.chapterMap.get(n);
        if (!found) return null;
        const chapter = walledOff(found, rows.bridges.get(n));
        const isDraft = chapter.status !== 'done';
        const text = `${isDraft ? '[DRAFT — not yet canon] ' : ''}Ch ${n}: ${content(chapter.summary ?? '', 'summary')}`;
        return makeRefSection(ref, heading(`EARLIER CHAPTER: ${n}${chapter.title ? ` — ${chapter.title}` : ''}`), text, isDraft ? 'working' : 'canonical');
      }
      case 'volume': {
        const volume = rows.volumeMap.get(value);
        if (!volume) return null;
        const text = `**${volume.title ?? volume.volumeKey}**\nGoal: ${volume.objective ?? ''}`;
        return makeRefSection(ref, heading(`VOLUME: ${volume.title ?? volume.volumeKey}`), content(text, 'plan'), 'approved_intent');
      }
      case 'bible_doc': {
        const doc = rows.bibleDocMap.get(value.includes('/') ? value : `${value}/`);
        if (!doc?.body || isWriterExcludedBibleDoc(doc)) return null;
        const { text: body, truncated } = truncateAtParagraph(doc.body, 8_000);
        return makeRefSection(ref, heading(`BIBLE: ${doc.section}/${doc.slug}`), content(body, 'bible_page'), 'canonical', truncated);
      }
      case 'fact': {
        const fact = rows.factMap.get(value);
        if (!fact) return null;
        if (rows.hiddenFactKeys?.has(fact.factKey)) return makeRefSection(ref, 'WRITING CONSTRAINT', content(fact.writerNote?.trim() ?? '', 'knowledge'), 'approved_intent');
        if (rows.hiddenFactKeys) return makeRefSection(ref, heading(`CANON FACT: ${fact.factKey}`), content(`**${fact.factKey}**: ${fact.text}`, 'knowledge'), 'canonical');
        const constraintLine = fact.constraintNote ? `\nConstraint: ${fact.constraintNote}` : '';
        return makeRefSection(ref, `CANON FACT: ${fact.factKey}`, `**${fact.factKey}**: ${fact.text}${constraintLine}`, 'canonical');
      }
      default:
        return null;
    }
  }
}
