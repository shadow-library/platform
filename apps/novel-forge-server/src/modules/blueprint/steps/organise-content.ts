import { and, eq, inArray } from 'drizzle-orm';
import { ORGANISE_RECORD_TYPE_WORDS, ORGANISE_TOPIC, type OrganiseRecordType, organiseTextKey, textDigest } from '@shadow-library/sdk';

import { AppErrorCode } from '@server/classes';
import { type DbExecutor, type Knowledge, type Ledger, schema } from '@server/database';

import { requiredEntityTypesForSlug } from '../../bible/bible-manifest';
import { type ContentOp } from '../../refinement/change-set';
import { isEmptyPage, type PageRef, type PageSection, pageSections, upsertPageSections } from './bible-page';
import { contentKey, linkedByOtherSteps, lockedLinks, removedContentOps } from './content-keys';
import { ORGANISE_STEP_KEY } from './organised-timeline';

export interface WrittenSection {
  heading: string;
  digest: string;
}

export interface WrittenPage extends PageRef {
  sections: WrittenSection[];
}

export interface WrittenRecord {
  entityKey: string;
  name: string;
  digest: string;
}

export interface StoredPage extends PageRef {
  body: string;
}

export interface PageWrite {
  ops: ContentOp[];
  written: WrittenPage | null;
}

export interface OrganisedRecord {
  name: string;
  type: OrganiseRecordType;
  summary: string;
}

export interface RecordWrite {
  ops: ContentOp[];
  /** What this step wrote and still owns, which is all its next lock may rewrite or remove. */
  written: WrittenRecord[];
}

export interface BackedPage extends PageRef {
  title: string;
}

type SectionState = 'absent' | 'mine' | 'changed' | 'foreign';

const OWN_HEADING_MARK = ' — from your notes';

export const addressOf = (page: PageRef): string => `${page.section}/${page.slug}`;
export const samePage = (a: PageRef, b: PageRef): boolean => a.section === b.section && a.slug === b.slug;

export function refuseSelection(issues: string): never {
  throw AppErrorCode.BPR_004.create({ part: 'selection', issues });
}

/** A heading, an event or a question: one line, which can never open a heading of its own. */
export function pageLine(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^#+\s*/, '')
    .trim();
}

/** A page is merged by its `##` headings, so a body may never open one: it would split the section it belongs to. */
export function pageBody(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^[ \t]*#{1,2}(?=\s)/gm, '###')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function payloadOf(entry: Ledger.Entry | undefined): Record<string, unknown> {
  return typeof entry?.payload === 'object' && entry.payload !== null ? (entry.payload as Record<string, unknown>) : {};
}

function organiseDecision(ledger: Ledger.Entry[]): Ledger.Entry | undefined {
  return ledger.find(entry => entry.kind === 'decision' && entry.topic === ORGANISE_TOPIC && entry.stepKey === ORGANISE_STEP_KEY);
}

export function writtenBefore(ledger: Ledger.Entry[]): WrittenPage[] {
  const pages = payloadOf(organiseDecision(ledger))['pages'];
  if (!Array.isArray(pages)) return [];
  return pages.flatMap(item => {
    const page = (typeof item === 'object' && item !== null ? item : {}) as Partial<WrittenPage>;
    if (typeof page.section !== 'string' || typeof page.slug !== 'string' || !Array.isArray(page.sections)) return [];
    const sections = page.sections.filter((section): section is WrittenSection => typeof section?.heading === 'string' && typeof section.digest === 'string');
    return [{ section: page.section, slug: page.slug, sections }];
  });
}

function recordsWrittenBefore(ledger: Ledger.Entry[]): WrittenRecord[] {
  const records = payloadOf(organiseDecision(ledger))['records'];
  if (!Array.isArray(records)) return [];
  return records.filter((record): record is WrittenRecord => typeof record?.entityKey === 'string' && typeof record.name === 'string' && typeof record.digest === 'string');
}

/**
 * A section is this step's own only while it still holds exactly what this step wrote. One another step or the author has since rewritten
 * is theirs now and is never touched again; a heading this step never wrote belongs to whoever did.
 */
function sectionState(current: PageSection[], written: WrittenSection[], heading: string): SectionState {
  const present = current.find(section => organiseTextKey(section.heading) === organiseTextKey(heading));
  if (!present) return 'absent';
  const mine = written.find(section => organiseTextKey(section.heading) === organiseTextKey(heading));
  if (!mine) return 'foreign';
  return mine.digest === textDigest(present.body) ? 'mine' : 'changed';
}

/** An organised section that collides with someone else's heading is written beside it under a heading of its own, never over it. */
function ownHeading(current: PageSection[], written: WrittenSection[], heading: string): { heading: string; yielded: boolean } {
  for (let attempt = 0; ; attempt++) {
    const candidate = attempt === 0 ? heading : `${heading}${OWN_HEADING_MARK}${attempt === 1 ? '' : ` (${attempt})`}`;
    const state = sectionState(current, written, candidate);
    if (state === 'absent' || state === 'mine') return { heading: candidate, yielded: false };
    if (state === 'changed') return { heading: candidate, yielded: true };
  }
}

/**
 * A section this step wrote that someone has changed since stays remembered as changed — on a page this step still writes to or one it has
 * dropped — so no later lock mistakes it for another step's heading and writes the notes' version beside it.
 */
export function sharedPageWrite(page: PageRef, title: string, stored: string | null, written: WrittenSection[], wanted: PageSection[]): PageWrite {
  const address: PageRef = { section: page.section, slug: page.slug };
  const current = pageSections(stored);
  const writes: PageSection[] = [];
  const recorded: WrittenSection[] = [];
  for (const section of wanted) {
    const { heading, yielded } = ownHeading(current, written, pageLine(section.heading));
    if (yielded) continue;
    const body = pageBody(section.body);
    writes.push({ heading, body });
    recorded.push({ heading, digest: textDigest(body) });
  }
  const claimed = new Set(recorded.map(section => organiseTextKey(section.heading)));
  const unclaimed = written.filter(section => !claimed.has(organiseTextKey(section.heading)));
  const dropped = unclaimed.filter(section => sectionState(current, written, section.heading) === 'mine');
  const remembered = [...recorded, ...unclaimed.filter(section => sectionState(current, written, section.heading) === 'changed')];
  const body = upsertPageSections(stored, title, null, [...writes, ...dropped.map(section => ({ heading: section.heading, body: '' }))]);
  const kept = remembered.length > 0 ? { ...address, sections: remembered } : null;
  if (body === stored) return { ops: [], written: kept };
  if (isEmptyPage(body)) return { ops: stored === null ? [] : [{ op: 'bible_document.remove', ...address }], written: null };
  return { ops: [{ op: 'bible_document.upsert', ...address, body }], written: kept };
}

/**
 * The timeline and the open questions are this step's own pages: every lock rewrites their lead and their fixed sections whole, keeps any
 * other section the author added there, and removes the page once nothing but its own lead would be left.
 */
export function ownPageWrite(address: PageRef, title: string, lead: string, stored: string | null, sections: PageSection[]): ContentOp[] {
  const clean = sections.map(section => ({ heading: pageLine(section.heading), body: pageBody(section.body) }));
  const writing = clean.some(section => section.body);
  if (!writing && stored === null) return [];
  const body = upsertPageSections(stored, title, writing ? lead : null, clean);
  if (!writing && pageSections(body).length === 0) return [{ op: 'bible_document.remove', ...address }];
  return body === stored ? [] : [{ op: 'bible_document.upsert', ...address, body }];
}

export async function loadPages(executor: Pick<DbExecutor, 'select'>, projectId: bigint, pages: PageRef[]): Promise<StoredPage[]> {
  if (pages.length === 0) return [];
  const rows = await executor
    .select({ section: schema.bibleDocuments.section, slug: schema.bibleDocuments.slug, body: schema.bibleDocuments.body })
    .from(schema.bibleDocuments)
    .where(and(eq(schema.bibleDocuments.projectId, projectId), inArray(schema.bibleDocuments.slug, [...new Set(pages.map(page => page.slug))])));
  return rows.flatMap(row => (row.body === null ? [] : [{ section: row.section, slug: row.slug, body: row.body }]));
}

interface StoredRecord {
  entityKey: string;
  type: Knowledge.EntityType;
  name: string;
  body: string | null;
}

const RECORD_COLUMNS = { entityKey: schema.entities.entityKey, type: schema.entities.type, name: schema.entities.name, body: schema.entities.body };

async function loadRecords(executor: Pick<DbExecutor, 'select'>, projectId: bigint, keys: string[]): Promise<StoredRecord[]> {
  if (keys.length === 0) return [];
  const wanted = new Set(keys);
  const rows = await executor
    .select(RECORD_COLUMNS)
    .from(schema.entities)
    .where(and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, [...wanted])));
  return rows.filter(row => wanted.has(row.entityKey));
}

async function loadRecordsOfTypes(executor: Pick<DbExecutor, 'select'>, projectId: bigint, types: Knowledge.EntityType[]): Promise<StoredRecord[]> {
  const wanted = new Set(types);
  const rows = await executor
    .select(RECORD_COLUMNS)
    .from(schema.entities)
    .where(and(eq(schema.entities.projectId, projectId), inArray(schema.entities.type, [...wanted])));
  return rows.filter(row => wanted.has(row.type));
}

function recordDigest(record: { type: string; name: string; body: string | null }): string {
  return textDigest(`${record.type}\n${record.name}\n${record.body ?? ''}`);
}

/**
 * Records take the key every other step derives from a name, so a character the notes name is the same record the protagonist step makes of
 * them. A record is this step's to rewrite or remove only while it still holds exactly what this step wrote: one another step claims, one
 * the author has edited since, or one that existed before this step made it is only touched, keeping its own type, so a page that owes
 * records still finds one staged — and it is never removed.
 */
export async function recordWrite(records: OrganisedRecord[], ledger: Ledger.Entry[], executor: Pick<DbExecutor, 'select'>, projectId: bigint): Promise<RecordWrite> {
  const previous = lockedLinks(ledger, ORGANISE_STEP_KEY, [ORGANISE_TOPIC]);
  const before = new Map(recordsWrittenBefore(ledger).map(record => [record.entityKey, record]));
  const others = linkedByOtherSteps(ledger, ORGANISE_STEP_KEY);
  const taken = new Set<string>();
  const keyed = records.map(record => ({ record, entityKey: contentKey('', record.name, taken) }));
  const existing = new Map((await loadRecords(executor, projectId, [...keyed.map(item => item.entityKey), ...(previous.entityKeys ?? [])])).map(row => [row.entityKey, row]));
  const ownedNow = (entityKey: string): boolean => {
    const stored = existing.get(entityKey);
    return stored !== undefined && !others.has(entityKey) && before.get(entityKey)?.digest === recordDigest(stored);
  };

  const written: WrittenRecord[] = [];
  const ops: ContentOp[] = keyed.map(({ record, entityKey }): ContentOp => {
    const stored = existing.get(entityKey);
    if (stored !== undefined && !ownedNow(entityKey)) return { op: 'entity.upsert', entityKey, type: stored.type };
    const upsert = { type: record.type, name: pageLine(record.name), body: pageBody(record.summary) };
    written.push({ entityKey, name: upsert.name, digest: recordDigest(upsert) });
    return { op: 'entity.upsert', entityKey, ...upsert };
  });
  const yielded = new Set((previous.entityKeys ?? []).filter(entityKey => !existing.has(entityKey) || !ownedNow(entityKey)));
  const removed = removedContentOps(previous, { entityKeys: written.map(record => record.entityKey) }, yielded, others);
  return { ops: [...ops, ...removed], written };
}

function recordNeeds(op: ContentOp): Knowledge.EntityType[] {
  return op.op === 'bible_document.upsert' ? [...requiredEntityTypesForSlug(op.section, op.slug)] : [];
}

function needsWords(needs: Knowledge.EntityType[]): string {
  const words = needs.map(type => ORGANISE_RECORD_TYPE_WORDS[type]);
  return words.length <= 1 ? (words[0] ?? 'a record') : `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`;
}

/**
 * Every page write in a record-bearing section needs a record of its kind staged beside it, or the change set is refused. A page the author
 * kept is theirs to back, so an unbacked one is refused in their words; a page this step only tidied — its old sections taken out — is
 * backed by touching a record the Story Bible already holds, and left as it is when there is none.
 */
export async function withBacking(ops: ContentOp[], kept: BackedPage[], executor: Pick<DbExecutor, 'select'>, projectId: bigint): Promise<ContentOp[]> {
  const staged = new Set(ops.flatMap(op => (op.op === 'entity.upsert' ? [op.type] : [])));
  const unbacked = (op: ContentOp): boolean => {
    const needs = recordNeeds(op);
    return needs.length > 0 && !needs.some(type => staged.has(type));
  };
  const page = kept.find(candidate => ops.some(op => op.op === 'bible_document.upsert' && samePage(op, candidate) && unbacked(op)));
  if (page) refuseSelection(`“${page.title}” needs at least one record kept that is ${needsWords([...requiredEntityTypesForSlug(page.section, page.slug)])}`);
  if (!ops.some(unbacked)) return ops;

  const removed = new Set(ops.flatMap(op => (op.op === 'entity.remove' ? [op.entityKey] : [])));
  const available = (await loadRecordsOfTypes(executor, projectId, [...new Set(ops.flatMap(recordNeeds))])).filter(row => !removed.has(row.entityKey));
  const touches: ContentOp[] = [];
  const backed = ops.filter(op => {
    if (!unbacked(op)) return true;
    const record = available.find(row => recordNeeds(op).includes(row.type));
    if (!record) return false;
    touches.push({ op: 'entity.upsert', entityKey: record.entityKey, type: record.type });
    staged.add(record.type);
    return true;
  });
  return [...touches, ...backed];
}
