import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { shiftChapterNumber } from '@server/common';
import { type DbExecutor, type Ledger, schema } from '@server/database';

import { type LedgerFilter } from './ledger.types';

type FilterableEntry = Pick<Ledger.Entry, 'kind' | 'phase' | 'topic'>;

const LINK_KEY_LISTS = ['entityKeys', 'factKeys', 'volumeKeys', 'arcKeys'] as const;

export function loadActiveLedger(db: Pick<DbExecutor, 'query'>, projectId: bigint): Promise<Ledger.Entry[]> {
  const table = schema.decisionLedgerEntries;
  return db.query.decisionLedgerEntries.findMany({ where: and(eq(table.projectId, projectId), isNull(table.supersededAt)), orderBy: [asc(table.createdAt), asc(table.id)] });
}

function matchesTopic(topic: string, pattern: string): boolean {
  if (pattern.endsWith('.*')) return topic.startsWith(pattern.slice(0, -1));
  return topic === pattern;
}

export function filterLedgerEntries<T extends FilterableEntry>(entries: T[], filter: LedgerFilter = {}): T[] {
  const kinds = filter.kinds?.length ? new Set(filter.kinds) : null;
  const phases = filter.phases?.length ? new Set(filter.phases) : null;
  const topics = filter.topics?.length ? filter.topics : null;
  return entries.filter(entry => {
    if (kinds && !kinds.has(entry.kind)) return false;
    if (phases && (entry.phase === null || !phases.has(entry.phase))) return false;
    return !topics || topics.some(pattern => matchesTopic(entry.topic, pattern));
  });
}

export function mergeLedgerLinks(current: Ledger.Links, added: Ledger.Links): Ledger.Links {
  const merged: Ledger.Links = {};
  for (const key of LINK_KEY_LISTS) {
    const values = [...new Set([...(current[key] ?? []), ...(added[key] ?? [])])];
    if (values.length > 0) merged[key] = values;
  }

  const documents = new Map([...(current.bibleDocuments ?? []), ...(added.bibleDocuments ?? [])].map(link => [`${link.section}/${link.slug}`, link]));
  if (documents.size > 0) merged.bibleDocuments = [...documents.values()];

  const chapters = [...new Set([...(current.briefChapters ?? []), ...(added.briefChapters ?? [])])].sort((a, b) => a - b);
  if (chapters.length > 0) merged.briefChapters = chapters;
  return merged;
}

export function shiftLinkedBriefChapters(links: Ledger.Links, afterChapter: number, delta = 1): Ledger.Links {
  if (!links.briefChapters?.length) return links;
  return { ...links, briefChapters: links.briefChapters.map(chapter => shiftChapterNumber(chapter, afterChapter, delta)) };
}

export async function shiftLedgerBriefLinks(tx: DbExecutor, projectId: bigint, afterChapter: number): Promise<void> {
  const table = schema.decisionLedgerEntries;
  const linked = await tx
    .select({ id: table.id, links: table.links })
    .from(table)
    .where(and(eq(table.projectId, projectId), sql`${table.links} -> 'briefChapters' IS NOT NULL`))
    .for('update');

  for (const entry of linked) {
    const shifted = shiftLinkedBriefChapters(entry.links, afterChapter);
    if (shifted.briefChapters?.some((chapter, index) => chapter !== entry.links.briefChapters?.[index])) {
      await tx.update(table).set({ links: shifted }).where(eq(table.id, entry.id));
    }
  }
}

export async function clearLedgerBriefLinks(db: Pick<DbExecutor, 'update'>, projectId: bigint): Promise<void> {
  const table = schema.decisionLedgerEntries;
  await db
    .update(table)
    .set({ links: sql`${table.links} - 'briefChapters'` })
    .where(and(eq(table.projectId, projectId), sql`${table.links} -> 'briefChapters' IS NOT NULL`));
}
