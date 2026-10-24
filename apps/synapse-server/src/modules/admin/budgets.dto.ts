import { Field, Integer, Schema, SchemaComposer } from '@shadow-library/class-schema';

const API_PRICE = 'Cost at catalog list prices in USD, which budgets count: a free subscription call still adds to it';

@Schema()
export class BudgetSubjectCounterResponse {
  @Field({ description: 'owner, user or app' })
  subjectType: string;

  @Field({ description: "The calling app's opaque id for the subject" })
  subjectId: string;

  @Field(() => Integer, { description: 'Calls admitted in the window, including any still in flight' })
  calls: number;

  @Field({ description: API_PRICE })
  listCostUsd: number;
}

@Schema()
export class AppBudgetUsageResponse {
  @Field({ const: 'app' })
  kind: 'app';

  @Field(() => Integer, { description: 'Calls admitted in the window, including any still in flight; zero when the app made none' })
  calls: number;

  @Field({ description: API_PRICE })
  listCostUsd: number;
}

@Schema()
export class SubjectBudgetUsageResponse {
  @Field({ const: 'subject' })
  kind: 'subject';

  @Field(() => Integer, { description: 'Subjects with at least one call in the window' })
  activeSubjects: number;

  @Field(() => Integer, { description: 'Subjects whose next call this budget refuses: calls at maxCalls or cost at maxListCostUsd, whichever are set' })
  atLimit: number;

  @Field(() => [BudgetSubjectCounterResponse], { description: 'At most 10 subjects, by cost then calls, highest first' })
  top: BudgetSubjectCounterResponse[];
}

@Schema()
export class BudgetStatusEntryResponse {
  @Field(() => Integer, { description: "Position of the budget in the active catalog's budgets" })
  index: number;

  @Field()
  app: string;

  @Field(() => String, { enum: ['subject', 'app'] })
  per: 'subject' | 'app';

  @Field(() => String, { enum: ['1h', '1d', '30d'] })
  window: '1h' | '1d' | '30d';

  @Field(() => Integer, { optional: true })
  maxCalls?: number;

  @Field({ optional: true, description: 'Limit on list-price cost in USD' })
  maxListCostUsd?: number;

  @Field(() => String, { format: 'date-time', description: 'Start of the current window. Windows are fixed UTC buckets counted from the epoch, so 30d is not a calendar month' })
  windowStart: Date;

  @Field(() => String, { format: 'date-time', description: 'When the current window ends and its counters start again from zero' })
  windowEnd: Date;

  @Field(() => SchemaComposer.discriminator('kind', AppBudgetUsageResponse, SubjectBudgetUsageResponse), {
    description:
      'Usage in the current window, shaped by `kind`, which matches `per`. Budgets of one app, scope and window share their counters and each reports them against its own limits',
  })
  usage: AppBudgetUsageResponse | SubjectBudgetUsageResponse;
}

@Schema()
export class BudgetStatusResponse {
  @Field(() => Integer, { description: 'Version of the active catalog the budgets come from' })
  catalogVersion: number;

  @Field(() => [BudgetStatusEntryResponse])
  budgets: BudgetStatusEntryResponse[];
}
