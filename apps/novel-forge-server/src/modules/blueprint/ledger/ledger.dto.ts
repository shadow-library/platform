import { EnumType, Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { BibleSection, BlueprintPhase, LedgerDecidedBy, LedgerEntryKind } from '@server/common';
import { type Bible, type Ledger, schema } from '@server/database';

import { AUTHOR_ENTRY_KINDS, AUTHOR_SUPERSEDE_KINDS, type AuthorEntryKind, type AuthorSupersedeKind, TOPIC_KEY_PATTERN } from './ledger.types';

const AuthorLedgerKind = EnumType.create('AuthorLedgerKind', [...AUTHOR_ENTRY_KINDS]);
const AuthorSupersedeLedgerKind = EnumType.create('AuthorSupersedeLedgerKind', [...AUTHOR_SUPERSEDE_KINDS]);
const LedgerEntryStatus = EnumType.create('LedgerEntryStatus', ['active', 'superseded', 'withdrawn']);

const TOPIC_PATTERN = TOPIC_KEY_PATTERN.source;
const TOPIC_FILTER = '[a-z0-9][a-z0-9_.-]*(\\.\\*)?';
const csvOf = (values: readonly string[]): string => `^(${values.join('|')})(,(${values.join('|')}))*$`;

@Schema()
export class LedgerProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class LedgerEntryParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  entryId: bigint;
}

@Schema()
export class LedgerTopicParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field({ pattern: TOPIC_PATTERN, maxLength: 100 })
  topic: string;
}

@Schema()
export class ListLedgerQuery {
  @Field(() => String, { optional: true, pattern: csvOf(schema.ledgerEntryKind.enumValues), description: 'Comma-separated entry kinds to keep.' })
  @Transform({ input: 'csv:split' })
  kinds?: Ledger.Kind[];

  @Field(() => String, { optional: true, pattern: csvOf(schema.blueprintPhase.enumValues), description: 'Comma-separated Blueprint phases to keep.' })
  @Transform({ input: 'csv:split' })
  phases?: Ledger.Phase[];

  @Field(() => String, {
    optional: true,
    pattern: `^${TOPIC_FILTER}(,${TOPIC_FILTER})*$`,
    description: 'Comma-separated topic keys to keep; a key ending in `.*` keeps every topic under that prefix.',
  })
  @Transform({ input: 'csv:split' })
  topics?: string[];
}

@Schema()
export class CreateLedgerEntryBody {
  @Field(() => AuthorLedgerKind, { description: 'Decisions come from locking a Blueprint step; the author writes directions, rejected ideas and backlog entries directly.' })
  kind: AuthorEntryKind;

  @Field(() => BlueprintPhase, { optional: true, nullable: true })
  phase?: Ledger.Phase | null;

  @Field({ pattern: TOPIC_PATTERN, maxLength: 100, description: 'Stable topic key, e.g. `premise`, `world.rules`, `check.<id>`.' })
  topic: string;

  @Field({ minLength: 1, maxLength: 4000 })
  statement: string;

  @Field({ optional: true, maxLength: 4000, description: 'For a rejected entry, the reason the author gave for killing it.' })
  why?: string;

  @Field(() => Object, { optional: true, additionalProperties: true, description: 'Structured detail whose fields depend on the topic.' })
  payload?: Record<string, unknown>;
}

@Schema()
export class SupersedeLedgerEntryBody {
  @Field(() => AuthorSupersedeLedgerKind, {
    optional: true,
    description: 'Kind of the successor; defaults to the superseded entry’s kind (a system detail becomes a decision). Only a decision or a system detail can become a decision.',
  })
  kind?: AuthorSupersedeKind;

  @Field({ minLength: 1, maxLength: 4000 })
  statement: string;

  @Field({ optional: true, maxLength: 4000, description: 'Omit to keep the superseded entry’s value when the kind is kept; send an empty string to clear it.' })
  why?: string;

  @Field({ optional: true, maxLength: 1000, description: 'What the decision means for the chapter writer. Omit to keep, empty string to clear.' })
  writerLine?: string;

  @Field(() => [String], { optional: true, maxItems: 20, description: 'Omit to keep the superseded entry’s alternatives when the kind is kept.' })
  rejectedAlternatives?: string[];

  @Field(() => Object, { optional: true, additionalProperties: true, description: 'Omit to keep the superseded entry’s payload when the kind is kept.' })
  payload?: Record<string, unknown>;
}

@Schema()
export class WithdrawLedgerEntryBody {
  @Field({
    minLength: 1,
    maxLength: 4000,
    description: 'Why the author withdraws the entry. It is deactivated with no successor; a withdrawn rejection is no longer a do-not-propose item.',
  })
  reason: string;
}

@Schema()
export class LedgerBibleDocumentLinkResponse {
  @Field(() => BibleSection)
  section: Bible.Section;

  @Field()
  slug: string;
}

@Schema()
export class LedgerLinksResponse {
  @Field(() => [LedgerBibleDocumentLinkResponse], { optional: true })
  bibleDocuments?: LedgerBibleDocumentLinkResponse[];

  @Field(() => [String], { optional: true })
  entityKeys?: string[];

  @Field(() => [String], { optional: true })
  factKeys?: string[];

  @Field(() => [String], { optional: true })
  volumeKeys?: string[];

  @Field(() => [String], { optional: true })
  arcKeys?: string[];

  @Field(() => [Integer], { optional: true })
  briefChapters?: number[];
}

@Schema()
export class LedgerEntryResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field(() => LedgerEntryKind)
  kind: Ledger.Kind;

  @Field(() => BlueprintPhase, { nullable: true })
  phase: Ledger.Phase | null;

  @Field()
  topic: string;

  @Field()
  statement: string;

  @Field({ nullable: true })
  why: string | null;

  @Field(() => [String])
  rejectedAlternatives: string[];

  @Field({ nullable: true, description: 'What the decision means for the chapter writer; chapter packs carry it while the decision is active.' })
  writerLine: string | null;

  @Field(() => LedgerDecidedBy)
  decidedBy: Ledger.DecidedBy;

  @Field(() => Object, { nullable: true, additionalProperties: true, description: 'Structured detail whose fields depend on the topic.' })
  payload: unknown;

  @Field(() => LedgerLinksResponse, { description: 'Content this entry produced, addressed by the keys the change-set ops use.' })
  links: LedgerLinksResponse;

  @Field(() => String, { nullable: true })
  supersedesId: bigint | null;

  @Field(() => String, { nullable: true, format: 'date-time', description: 'Set once the entry was superseded or withdrawn; an entry is active while it is null.' })
  supersededAt: Date | null;

  @Field({ nullable: true, description: 'The author’s reason, when the entry was withdrawn rather than superseded.' })
  withdrawnReason: string | null;

  @Field(() => LedgerEntryStatus, { description: 'Superseded entries have a successor on the same topic; withdrawn ones do not.' })
  status: Ledger.Status;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class ListLedgerEntriesResponse {
  @Field(() => [LedgerEntryResponse])
  entries: LedgerEntryResponse[];
}
