import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { MAX_USAGE_RANGE_DAYS, SERIES_GROUPS, USAGE_GROUPS } from './admin.constants';

@Schema()
export class UsageRangeQuery {
  @Field({ optional: true, maxLength: 40, description: 'Start of the range, inclusive: an ISO date (UTC midnight) or a date-time with an offset. Defaults to 30 days before `to`' })
  from?: string;

  @Field({ optional: true, maxLength: 40, description: `End of the range, exclusive, in the same formats. Defaults to now. The range cannot exceed ${MAX_USAGE_RANGE_DAYS} days` })
  to?: string;

  @Field({ optional: true, maxLength: 64, description: 'Only count requests from this app, matched exactly. Combines with every groupBy and with `task`' })
  app?: string;

  @Field({ optional: true, maxLength: 64, description: 'Only count requests for this task id, matched exactly. Combines with every groupBy and with `app`' })
  task?: string;
}

@Schema()
export class UsageQuery extends UsageRangeQuery {
  @Field({ optional: true, maxLength: 20, description: `One of ${USAGE_GROUPS.join(', ')}. Defaults to app` })
  groupBy?: string;
}

@Schema()
export class UsageSeriesQuery extends UsageRangeQuery {
  @Field({
    optional: true,
    maxLength: 20,
    description: `One of ${SERIES_GROUPS.join(', ')}. Defaults to app. Unlike the usage report, day is not a grouping: every series already has one point per day`,
  })
  groupBy?: string;
}

@Schema()
export class UsageTotalsResponse {
  @Field(() => Integer, { description: 'Settled requests: every outcome except those still in flight' })
  calls: number;

  @Field(() => Integer)
  inputTokens: number;

  @Field(() => Integer)
  cachedInputTokens: number;

  @Field(() => Integer)
  outputTokens: number;

  @Field(() => Integer)
  reasoningTokens: number;

  @Field({ description: 'Cost at catalog list prices, in USD' })
  listCostUsd: number;

  @Field({ description: 'Cost actually charged, in USD; zero for free providers' })
  billedCostUsd: number;
}

@Schema()
export class UsageRowResponse extends UsageTotalsResponse {
  @Field(() => String, { nullable: true, description: 'The group value; null for requests that never named an alias, model or provider' })
  key: string | null;
}

@Schema()
export class UsageResponse {
  @Field(() => String, { format: 'date-time' })
  from: Date;

  @Field(() => String, { format: 'date-time' })
  to: Date;

  @Field()
  groupBy: string;

  @Field(() => [UsageRowResponse])
  rows: UsageRowResponse[];

  @Field(() => UsageTotalsResponse)
  totals: UsageTotalsResponse;
}

@Schema()
export class UsageSeriesPointResponse {
  @Field({ description: 'The UTC calendar day, YYYY-MM-DD' })
  day: string;

  @Field(() => Integer)
  calls: number;

  @Field({ description: 'Cost at catalog list prices, in USD' })
  listCostUsd: number;

  @Field({ description: 'Cost actually charged, in USD; zero for free providers' })
  billedCostUsd: number;
}

@Schema()
export class UsageSeriesEntryResponse {
  @Field(() => String, { nullable: true, description: 'The group value; null for requests that never named an alias, model or provider' })
  key: string | null;

  @Field(() => [UsageSeriesPointResponse], { description: 'Exactly one point per entry of `days`, in the same order; days without requests are zero' })
  points: UsageSeriesPointResponse[];

  @Field(() => UsageTotalsResponse)
  totals: UsageTotalsResponse;
}

@Schema()
export class UsageSeriesResponse {
  @Field(() => String, { format: 'date-time' })
  from: Date;

  @Field(() => String, { format: 'date-time' })
  to: Date;

  @Field()
  groupBy: string;

  @Field(() => [String], { description: 'Every UTC calendar day (YYYY-MM-DD) touched by the half-open range, in order' })
  days: string[];

  @Field(() => [UsageSeriesEntryResponse], { description: 'Ordered by list cost, highest first, then key; the null key last' })
  series: UsageSeriesEntryResponse[];

  @Field(() => UsageTotalsResponse)
  totals: UsageTotalsResponse;
}
