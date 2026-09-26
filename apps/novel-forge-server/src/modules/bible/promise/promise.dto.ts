import { EnumType, Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

import { type DueStanding, type PromiseKind, type PromiseStatus, SortByTime } from '@server/common';

const PromiseKindType = EnumType.create('PromiseKind', ['thread', 'mystery']);
const PromiseStatusType = EnumType.create('PromiseStatus', ['open', 'closed', 'resolved', 'dropped']);
const DueStandingType = EnumType.create('DueStanding', ['not_due', 'due', 'overdue']);
const PromiseSortType = EnumType.create('PromiseSort', ['due']);

@Schema()
export class PromiseProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class ListPromisesQuery extends PaginationQuery(SortByTime) {
  @Field(() => PromiseKindType, { optional: true })
  kind?: PromiseKind;

  @Field(() => PromiseStatusType, { optional: true })
  status?: PromiseStatus;

  @Field(() => PromiseSortType, {
    optional: true,
    description: 'Orders overdue, then due, then not_due; each group keeps createdAt order (sortOrder still applies to it). Overrides sortBy.',
  })
  sort?: 'due';
}

@Schema({ description: "One thing the story owes the reader — a plot thread or a mystery — never the mystery's own truth fact (P4-38)." })
export class PromiseItemResponse {
  @Field(() => PromiseKindType)
  kind: PromiseKind;

  @Field({ description: 'The thread or mystery key.' })
  key: string;

  @Field({ description: "The thread's summary or the mystery's question." })
  label: string;

  @Field(() => PromiseStatusType)
  status: PromiseStatus;

  @Field({ description: 'Marked by the outliner or continuity extraction as a deliberate running promise, not an oversight.' })
  intentionallyOpen: boolean;

  @Field(() => Integer, { optional: true, nullable: true })
  openedChapter?: number | null;

  @Field(() => Integer, { optional: true, nullable: true, description: 'The most recent chapter whose continuity extraction named this promise.' })
  lastAdvancedChapter?: number | null;

  @Field(() => Integer, { optional: true, nullable: true, description: 'Set once a thread is closed; null for a mystery.' })
  closedChapter?: number | null;

  @Field(() => Integer, { optional: true, nullable: true, description: 'Set once a mystery is resolved; null for a thread.' })
  resolvedChapter?: number | null;

  @Field(() => Integer, { optional: true, nullable: true, description: 'A single target chapter the promise is expected to pay off by.' })
  payoffWindow?: number | null;

  @Field({ optional: true, nullable: true, description: 'The milestone this promise is meant to pay off by.' })
  payoffMilestoneKey?: string | null;

  @Field({ optional: true, nullable: true, description: 'The volume this promise is meant to pay off by.' })
  payoffVolumeKey?: string | null;

  @Field(() => DueStandingType, {
    description:
      "P4-41b: 'due' once the payoff milestone is reached or the payoff volume is the one now active; 'overdue' once the authored chapter window passes or the payoff volume already met its goal.",
  })
  due: DueStanding;
}

@Schema()
export class ListPromisesResponse extends Paginated(PromiseItemResponse) {}
