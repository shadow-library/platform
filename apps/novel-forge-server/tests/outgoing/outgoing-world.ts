import * as operators from 'drizzle-orm';
import { Column, is, SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { schema, type UnlockCondition } from '@server/database';

import { bridgeReview, type BridgeReviewOptions, bridgeSelect } from '../finalize-review/bridge-fixtures';
import { matchesWhere } from '../sql-filter';

type Row = Record<string, unknown>;

export const PROJECT_ID = 7n;

export interface FactSpec {
  key: string;
  truth: string;
  terms?: string[];
  clues?: string[];
  revealChapter?: number | null;
  unlock?: UnlockCondition | null;
  writerNote?: string | null;
  constraintNote?: string | null;
  source?: 'manual' | 'seed' | 'bible';
  subjects?: string[];
}

export interface EntitySpec {
  key: string;
  name: string;
  type?: string;
  body?: string;
  appearance?: string | null;
  status?: string;
  aliases?: string[];
}

/** A character learned a fact in a chapter; `source: 'brief'` is an on-page reveal a plan recorded, `manual` the author's private note. */
export interface LearnSpec {
  entity: string;
  fact: string;
  chapter: number;
  source?: 'brief' | 'manual' | 'draft';
}

export interface BriefSpec {
  chapter: number;
  body?: string;
  volumeKey?: string | null;
  pov?: string | null;
  /** The knowledge contract's point-of-view cast; with `learns` it makes the contract. */
  cast?: string[];
  learns?: [entity: string, fact: string][];
  isEnding?: boolean;
  claims?: string[];
  refs?: string[];
  endingContract?: Row | null;
  revision?: number;
  contentMode?: 'standard' | 'unrestricted' | null;
}

export interface ChapterSpec {
  number: number;
  content?: string;
  summary?: string;
  title?: string | null;
  isolated?: boolean;
}

export interface DraftSpec {
  chapter: number;
  body: string;
  summary?: string;
  title?: string | null;
  revision?: number;
  isolated?: boolean;
  state?: unknown;
}

export interface EventSpec {
  entity: string;
  chapter: number;
  kind: string;
  detailKey?: string | null;
  after: unknown;
  status?: 'committed' | 'provisional';
}

export interface WorldSpec {
  cursor?: number;
  premise?: string;
  instructions?: string;
  ending?: string | null;
  endingQuestion?: string | null;
  volumes?: { key: string; ordinal: number; title: string; objective: string }[];
  milestones?: { key: string; state?: 'open' | 'planned' | 'reached'; reachedChapter?: number | null }[];
  entities?: EntitySpec[];
  facts?: FactSpec[];
  learned?: LearnSpec[];
  briefs?: BriefSpec[];
  chapters?: ChapterSpec[];
  drafts?: DraftSpec[];
  pages?: { section: string; slug: string; body: string }[];
  threads?: { key: string; summary: string; openedChapter: number | null }[];
  worldFacts?: { category: string; key: string; value: string }[];
  events?: EventSpec[];
  reviews?: BridgeReviewOptions[];
  ledger?: { topic: string; statement: string; writerLine?: string | null }[];
}

const byKey = (entities: readonly EntitySpec[], key: string): bigint => BigInt(entities.findIndex(entity => entity.key === key) + 1);
const factId = (facts: readonly FactSpec[], key: string): bigint => BigInt(facts.findIndex(fact => fact.key === key) + 1);

function contract(brief: BriefSpec): Row | null {
  if (!brief.cast && !brief.learns) return null;
  return { pov: brief.cast ?? (brief.pov ? [brief.pov] : []), learns: (brief.learns ?? []).map(([entityKey, factKey]) => ({ entityKey, factKey })) };
}

/** The world as the rows the assembler, the disclosure policy and the bridge query read. */
export function worldTables(spec: WorldSpec): Map<string, Row[]> {
  const entities = spec.entities ?? [];
  const facts = spec.facts ?? [];
  const common = { projectId: PROJECT_ID };
  const drafts = (spec.drafts ?? []).map((draft, index) => ({
    ...common,
    id: BigInt(index + 1),
    chapter: draft.chapter,
    body: draft.body,
    summary: draft.summary ?? null,
    title: draft.title ?? null,
    revision: draft.revision ?? 1,
    isolated: draft.isolated ?? false,
    state: draft.state ?? null,
    staleReason: null,
    status: 'draft',
    reviewStatus: 'needs_review',
    generator: 'standard',
    saveSeq: 0,
    words: null,
  }));
  const reviews = (spec.reviews ?? []).map((options, index) => ({ ...bridgeReview(options), id: BigInt(index + 1), projectId: PROJECT_ID }));
  return new Map<string, Row[]>([
    [
      'projects',
      [
        {
          id: PROJECT_ID,
          title: 'The Lantern Coast',
          instructions: spec.instructions ?? 'Write close third person, past tense.',
          premise: spec.premise ?? 'A lamp keeper guards a coast where the tide remembers.',
          themes: null,
          ending: spec.ending ?? null,
          endingQuestion: spec.endingQuestion ?? null,
          storyCurrentChapter: spec.cursor ?? 0,
          contentMode: 'standard',
          config: null,
        },
      ],
    ],
    [
      'volumes',
      (spec.volumes ?? []).map((volume, index) => ({
        ...common,
        id: BigInt(index + 1),
        volumeKey: volume.key,
        ordinal: volume.ordinal,
        title: volume.title,
        objective: volume.objective,
        body: null,
        state: index === 0 ? 'active' : 'not_started',
      })),
    ],
    [
      'milestones',
      (spec.milestones ?? []).map((milestone, index) => ({
        ...common,
        id: BigInt(index + 1),
        milestoneKey: milestone.key,
        label: null,
        state: milestone.state ?? 'open',
        reachedChapter: milestone.reachedChapter ?? null,
        plannedChapter: null,
      })),
    ],
    [
      'entities',
      entities.map((entity, index) => ({
        ...common,
        id: BigInt(index + 1),
        entityKey: entity.key,
        name: entity.name,
        type: entity.type ?? 'character',
        status: entity.status ?? 'active',
        significance: null,
        body: entity.body ?? null,
        notes: null,
        appearance: entity.appearance ?? null,
        motivation: null,
        aliases: (entity.aliases ?? []).map(alias => ({ alias })),
      })),
    ],
    [
      'canonFacts',
      facts.map((fact, index) => ({
        ...common,
        id: BigInt(index + 1),
        factKey: fact.key,
        label: null,
        text: fact.truth,
        constraintNote: fact.constraintNote ?? null,
        writerNote: fact.writerNote ?? null,
        terms: fact.terms ?? [],
        revealChapter: fact.revealChapter ?? null,
        unlock: fact.unlock ?? null,
        allowedClues: fact.clues ?? null,
        source: fact.source ?? 'manual',
        subjects: fact.subjects ?? null,
        plannedChapter: null,
        disclosedInChapter: null,
      })),
    ],
    [
      'characterKnowledge',
      (spec.learned ?? []).map((learn, index) => ({
        ...common,
        id: BigInt(index + 1),
        entityId: byKey(entities, learn.entity),
        factId: factId(facts, learn.fact),
        learnedInChapter: learn.chapter,
        source: learn.source ?? 'draft',
      })),
    ],
    [
      'briefs',
      (spec.briefs ?? []).map((brief, index) => ({
        ...common,
        id: BigInt(index + 1),
        chapter: brief.chapter,
        title: null,
        body: brief.body ?? `Plan for chapter ${brief.chapter}.`,
        volumeKey: brief.volumeKey ?? null,
        pov: brief.pov ?? null,
        isEnding: brief.isEnding ?? false,
        claimedMilestones: brief.claims ?? [],
        knowledgeContract: contract(brief),
        endingContract: brief.endingContract ?? null,
        contextRefs: brief.refs ?? [],
        staleReason: null,
        revision: brief.revision ?? 1,
        contentMode: brief.contentMode ?? null,
      })),
    ],
    [
      'chapters',
      (spec.chapters ?? []).map(chapter => ({
        ...common,
        id: BigInt(chapter.number),
        number: chapter.number,
        status: 'done',
        isolated: chapter.isolated ?? false,
        title: chapter.title ?? null,
        content: chapter.content ?? `Chapter ${chapter.number} passes quietly.`,
        summary: chapter.summary ?? `Chapter ${chapter.number} passes quietly.`,
      })),
    ],
    ['drafts', drafts],
    ['finalizeReviews', reviews],
    ['bibleDocuments', (spec.pages ?? []).map((page, index) => ({ ...common, id: BigInt(index + 1), frontmatter: null, revision: 1, ...page }))],
    [
      'plotThreads',
      (spec.threads ?? []).map((thread, index) => ({
        ...common,
        id: BigInt(index + 1),
        threadKey: thread.key,
        status: 'open',
        summary: thread.summary,
        openedChapter: thread.openedChapter,
        closedChapter: null,
        intentionallyOpen: false,
      })),
    ],
    ['mysteries', []],
    ['worldFacts', (spec.worldFacts ?? []).map((fact, index) => ({ ...common, id: BigInt(index + 1), ...fact }))],
    [
      'characterEvents',
      (spec.events ?? []).map((event, index) => ({
        ...common,
        id: BigInt(index + 1),
        entityId: byKey(entities, event.entity),
        chapter: event.chapter,
        kind: event.kind,
        detailKey: event.detailKey ?? null,
        after: event.after,
        status: event.status ?? 'committed',
        createdAt: new Date(index),
      })),
    ],
    ['characterStates', []],
    ['entityRelationships', []],
    ['entityAppearances', []],
    [
      'decisionLedgerEntries',
      (spec.ledger ?? []).map((entry, index) => ({
        ...common,
        id: BigInt(index + 1),
        kind: 'decision',
        topic: entry.topic,
        statement: entry.statement,
        why: null,
        rejectedAlternatives: [],
        writerLine: entry.writerLine ?? null,
        decidedBy: 'author',
        supersededAt: null,
        links: {},
        ideaId: null,
        scope: null,
      })),
    ],
    ['contextPacks', []],
    ['refinementProposals', []],
  ]);
}

const dialect = new PgDialect();
const ORDER = /^(?:"\w+"\.)?"(\w+)" (asc|desc)$/i;

function camel(column: string): string {
  return column.replace(/_(\w)/g, (_, letter: string) => letter.toUpperCase());
}

function orderTerm(term: unknown): { key: string; sign: number } {
  if (is(term, Column)) return { key: camel(term.name), sign: 1 };
  const match = is(term, SQL) ? ORDER.exec(dialect.sqlToQuery(term).sql.trim()) : null;
  if (!match?.[1]) throw new Error('outgoing-world: unsupported orderBy');
  return { key: camel(match[1]), sign: match[2]?.toLowerCase() === 'desc' ? -1 : 1 };
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === 'number' || typeof left === 'bigint') return Number(left) - Number(right);
  return String(left ?? '').localeCompare(String(right ?? ''));
}

interface RelationalQuery {
  where?: SQL | ((table: unknown, ops: typeof operators) => SQL);
  orderBy?: unknown;
  limit?: number;
}

function select(name: string, rows: readonly Row[], query: RelationalQuery = {}): Row[] {
  const table = (schema as unknown as Record<string, unknown>)[name];
  const where = typeof query.where === 'function' ? query.where(table, operators) : query.where;
  const kept = rows.filter(row => matchesWhere(row, where));
  const order = query.orderBy === undefined ? [] : (Array.isArray(query.orderBy) ? query.orderBy : [query.orderBy]).map(orderTerm);
  const sorted = order.length === 0 ? kept : [...kept].sort((left, right) => order.reduce((result, { key, sign }) => result || sign * compareValues(left[key], right[key]), 0));
  return query.limit === undefined ? sorted : sorted.slice(0, query.limit);
}

const INSERTED_TABLES = new Map<unknown, string>([[schema.contextPacks, 'contextPacks']]);

/** The drizzle surface over the world's rows: relational reads honour `where`, `orderBy` and `limit`; context packs inserted through it read back. */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function worldDb(rows: Map<string, Row[]>) {
  const finder = (name: string) => ({
    findFirst: async (query?: RelationalQuery) => select(name, rows.get(name) ?? [], query)[0],
    findMany: async (query?: RelationalQuery) => select(name, rows.get(name) ?? [], query),
  });
  let nextId = 100n;
  return {
    query: new Proxy({} as Record<string, ReturnType<typeof finder>>, { get: (_, name: string) => finder(name) }),
    select: bridgeSelect(() => ({ drafts: rows.get('drafts') ?? [], reviews: rows.get('finalizeReviews') ?? [], entities: rows.get('entities') ?? [] })),
    $count: async () => 0,
    insert: (table: unknown) => ({
      values: (values: Row) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const row = { id: nextId++, ...values };
            rows.get(INSERTED_TABLES.get(table) ?? '')?.push(row);
            return [row];
          },
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
}

export type WorldDb = ReturnType<typeof worldDb>;
