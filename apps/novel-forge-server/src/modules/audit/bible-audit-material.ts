import { isOpenCanon } from '@server/common';
import { type Bible, type BibleAuditChecked, type BibleAuditPass, type Chapter, type Knowledge } from '@server/database';

import { clipAtBoundary } from '../ai/context/bible-docs';
import { type FactLike } from '../bible/fact/knowledge-view';

export type AuditDocumentRow = Pick<Bible.Document, 'section' | 'slug' | 'body'>;
export type AuditEntityRow = Pick<Knowledge.Entity, 'entityKey' | 'type' | 'name' | 'status' | 'motivation' | 'notes' | 'body'>;
export type AuditFactRow = Pick<Knowledge.CanonFact, 'factKey' | 'text' | 'writerNote' | 'terms' | 'allowedClues' | 'revealChapter' | 'disclosedInChapter' | 'source'>;
export type AuditChapterRow = Pick<Chapter.Row, 'number' | 'title' | 'summary'>;

export interface AuditRows {
  documents: AuditDocumentRow[];
  entities: AuditEntityRow[];
  facts: AuditFactRow[];
  /** Finalized standard chapters, ascending; only their summaries are read. */
  chapters: AuditChapterRow[];
  /** Finalized isolated chapters: firewalled from standard models, so not even their summaries are read. */
  isolatedChapters: number[];
}

interface Examined {
  documents: { count: number; sections: string[]; clipped: number; omitted: number };
  entities: { count: number; byType: Record<string, number>; omitted: number };
  facts: { count: number; omitted: number };
  chapters: number[];
  chaptersWithoutSummary: number[];
  chaptersOmitted: number;
}

export interface AuditMaterial {
  rendered: string;
  /** Each label the contradiction pass read → the text it read under it, which evidence quotes are checked against. */
  sources: ReadonlyMap<string, string>;
  examined: Examined;
}

interface Budget {
  total: number;
  item: number;
}

const BUDGETS = {
  documents: { total: 120_000, item: 8_000 },
  entities: { total: 40_000, item: 1_500 },
  facts: { total: 30_000, item: 1_500 },
  chapters: { total: 50_000, item: 2_000 },
} satisfies Record<string, Budget>;

const ENTITY_LABELS: Record<string, [string, string]> = {
  character: ['character', 'characters'],
  faction: ['faction', 'factions'],
  location: ['place', 'places'],
  power_rule: ['power rule', 'power rules'],
  item: ['item', 'items'],
  concept: ['concept', 'concepts'],
};

/** A secret is a truth the reader has not been told: not disclosed by a finalized chapter, not open from the start, not a seed promise. */
export function isSecretFact(fact: Pick<AuditFactRow, 'disclosedInChapter' | 'revealChapter' | 'source'>): boolean {
  return fact.disclosedInChapter === null && !isOpenCanon(fact.revealChapter) && fact.source !== 'seed';
}

export function secretFacts(facts: readonly AuditFactRow[]): FactLike[] {
  return facts.filter(isSecretFact).map(fact => ({ factKey: fact.factKey, text: fact.text, terms: fact.terms, source: fact.source }));
}

/** Each record's fields by ref, named as the change-set ops name them. */
export function currentRecords(rows: AuditRows): Map<string, Record<string, unknown>> {
  return new Map<string, Record<string, unknown>>([
    ...rows.documents.map(({ section, slug, body }): [string, Record<string, unknown>] => [`doc:${section}/${slug}`, { body }]),
    ...rows.entities.map(({ entityKey, ...fields }): [string, Record<string, unknown>] => [`entity:${entityKey}`, fields]),
    ...rows.facts.map(({ factKey, text, writerNote, allowedClues }): [string, Record<string, unknown>] => [`fact:${factKey}`, { body: text, writerNote, allowedClues }]),
  ]);
}

function plural(count: number, [one, many]: [string, string]): string {
  return `${count} ${count === 1 ? one : many}`;
}

function fitted<T>(
  items: readonly T[],
  budget: Budget,
  render: (item: T) => { label: string; text: string },
): { entries: { label: string; text: string }[]; clipped: number; omitted: number } {
  const entries: { label: string; text: string }[] = [];
  let used = 0;
  let clipped = 0;
  for (const item of items) {
    const { label, text } = render(item);
    const clippedText = text.length > budget.item ? clipAtBoundary(text, budget.item) : text;
    if (used + clippedText.length > budget.total) break;
    if (clippedText !== text) clipped++;
    used += clippedText.length;
    entries.push({ label, text: clippedText });
  }
  return { entries, clipped, omitted: items.length - entries.length };
}

function entityText(entity: AuditEntityRow): string {
  const fields: [string, string | null][] = [
    ['name', entity.name],
    ['type', entity.type],
    ['status', entity.status],
    ['motivation', entity.motivation],
    ['notes', entity.notes],
    ['body', entity.body],
  ];
  return fields.flatMap(([field, value]) => (value?.trim() ? [`${field}: ${value.trim()}`] : [])).join('\n');
}

function factText(fact: AuditFactRow): string {
  const lines = [`${isSecretFact(fact) ? 'SECRET — the reader has not been told. ' : ''}${fact.text}`];
  if (fact.writerNote?.trim()) lines.push(`writerNote: ${fact.writerNote.trim()}`);
  if (fact.allowedClues?.length) lines.push(`allowedClues: ${fact.allowedClues.join('; ')}`);
  return lines.join('\n');
}

/** Renders what the contradiction pass reads within fixed budgets, and records exactly what made it in — the report may claim nothing more. */
export function renderAuditMaterial(rows: AuditRows): AuditMaterial {
  const documents = fitted(
    rows.documents.filter(doc => doc.body?.trim()),
    BUDGETS.documents,
    doc => ({ label: `doc:${doc.section}/${doc.slug}`, text: doc.body?.trim() ?? '' }),
  );
  const entities = fitted(rows.entities, BUDGETS.entities, entity => ({ label: `entity:${entity.entityKey}`, text: entityText(entity) }));
  const facts = fitted(rows.facts, BUDGETS.facts, fact => ({ label: `fact:${fact.factKey}`, text: factText(fact) }));
  const summarised = rows.chapters.filter(chapter => chapter.summary?.trim()).reverse();
  const newestFirst = fitted(summarised, BUDGETS.chapters, chapter => ({
    label: `chapter:${chapter.number}`,
    text: `${chapter.title ? `${chapter.title}\n` : ''}${chapter.summary?.trim() ?? ''}`,
  }));
  const chapters = { ...newestFirst, entries: [...newestFirst.entries].reverse() };

  const block = (heading: string, entries: { label: string; text: string }[]) =>
    `## ${heading}\n\n${entries.length === 0 ? '(none)' : entries.map(entry => `[${entry.label}]\n${entry.text}`).join('\n\n')}`;
  const rendered = [
    block('Story Bible pages', documents.entries),
    block('Entity records', entities.entries),
    block('Canon facts', facts.entries),
    block('Finalized chapter summaries', chapters.entries),
  ].join('\n\n');

  const byType: Record<string, number> = {};
  const entityByLabel = new Map(rows.entities.map(entity => [`entity:${entity.entityKey}`, entity]));
  for (const entry of entities.entries) {
    const type = entityByLabel.get(entry.label)?.type ?? 'concept';
    byType[type] = (byType[type] ?? 0) + 1;
  }
  const chapterNumbers = chapters.entries.map(entry => Number(entry.label.slice('chapter:'.length)));

  return {
    rendered,
    sources: new Map([...documents.entries, ...entities.entries, ...facts.entries, ...chapters.entries].map(entry => [entry.label, entry.text])),
    examined: {
      documents: {
        count: documents.entries.length,
        sections: [...new Set(documents.entries.map(entry => entry.label.slice('doc:'.length).split('/')[0] ?? ''))],
        clipped: documents.clipped,
        omitted: documents.omitted,
      },
      entities: { count: entities.entries.length, byType, omitted: entities.omitted },
      facts: { count: facts.entries.length, omitted: facts.omitted },
      chapters: chapterNumbers,
      chaptersWithoutSummary: rows.chapters.filter(chapter => !chapter.summary?.trim()).map(chapter => chapter.number),
      chaptersOmitted: chapters.omitted,
    },
  };
}

function countByType(entities: readonly AuditEntityRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entity of entities) counts[entity.type] = (counts[entity.type] ?? 0) + 1;
  return counts;
}

function renderEntityCounts(byType: Record<string, number>): string {
  const parts = Object.keys(ENTITY_LABELS).flatMap(type => (byType[type] ? [plural(byType[type], ENTITY_LABELS[type] as [string, string])] : []));
  return parts.length === 0 ? 'no entity records' : parts.join(', ');
}

function renderChapterRange(numbers: readonly number[]): string {
  const first = numbers[0];
  const last = numbers.at(-1);
  if (first === undefined || last === undefined) return 'no finalized chapter summaries';
  return first === last ? `chapter ${first}` : `chapters ${first}–${last}`;
}

/**
 * What the report may say was checked. The coverage pass reads the page and record inventories; only the contradiction pass reads facts
 * and chapter summaries, and it may have read part of the bible when the material ran over its budget — so a failed pass or a budget cut
 * narrows the claim instead of vanishing from it.
 */
export function describeChecked(passes: Record<BibleAuditPass, 'ran' | 'failed'>, rows: AuditRows, material: AuditMaterial): BibleAuditChecked {
  const compared = passes.contradictions === 'ran';
  const pages = rows.documents.filter(doc => doc.body?.trim());
  const examined = material.examined;
  const documents = compared ? examined.documents : { count: pages.length, sections: [...new Set(pages.map(doc => doc.section))], clipped: 0, omitted: 0 };
  const entities = compared ? examined.entities : { count: rows.entities.length, byType: countByType(rows.entities), omitted: 0 };
  const facts = compared ? examined.facts : { count: 0, omitted: 0 };
  const chapterNumbers = compared ? examined.chapters : [];
  const chapters = chapterNumbers.length > 0 ? { from: chapterNumbers[0] as number, to: chapterNumbers.at(-1) as number, count: chapterNumbers.length } : null;

  const parts = [plural(documents.count, ['page', 'pages']), renderEntityCounts(entities.byType)];
  if (compared) parts.push(plural(facts.count, ['fact', 'facts']), renderChapterRange(chapterNumbers));
  const caveats: string[] = [];
  if (passes.coverage === 'failed') caveats.push('The coverage check did not run, so missing or thin pages were not looked for.');
  if (!compared) caveats.push('The contradiction check did not run, so facts and chapters were not compared.');
  if (documents.clipped > 0) caveats.push(`${plural(documents.clipped, ['page was', 'pages were'])} too long and only partly read.`);
  const skipped = documents.omitted + entities.omitted + facts.omitted + (compared ? examined.chaptersOmitted : 0);
  if (skipped > 0) caveats.push(`${plural(skipped, ['entry', 'entries'])} did not fit and were not compared.`);
  const isolated = compared ? rows.isolatedChapters : [];
  if (isolated.length > 0)
    caveats.push(`${isolated.length === 1 ? 'Chapter' : 'Chapters'} ${isolated.join(', ')} ${isolated.length === 1 ? 'is' : 'are'} isolated, so not compared.`);
  const withoutSummary = compared ? examined.chaptersWithoutSummary : [];
  if (withoutSummary.length > 0)
    caveats.push(
      `${withoutSummary.length === 1 ? 'Chapter' : 'Chapters'} ${withoutSummary.join(', ')} ${withoutSummary.length === 1 ? 'has' : 'have'} no summary yet, so not compared.`,
    );

  return {
    passes,
    documents,
    entities,
    facts,
    chapters,
    chaptersWithoutSummary: withoutSummary,
    chaptersIsolated: isolated,
    chaptersOmitted: compared ? examined.chaptersOmitted : 0,
    copy: [`Checked: ${parts.join(', ')}.`, ...caveats].join(' '),
  };
}
