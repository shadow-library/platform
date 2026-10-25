import { Field, Integer, Schema } from '@shadow-library/class-schema';

const CATALOG_STATES = ['PUBLISHED', 'ARCHIVED'] as const;

@Schema()
export class VersionParams {
  @Field(() => Integer, { minimum: 1 })
  version: number;
}

@Schema()
export class AliasParams {
  @Field({ minLength: 1, maxLength: 200 })
  key: string;
}

@Schema()
export class AliasImpactQuery {
  @Field({ optional: true, maxLength: 200, description: 'Model key the alias would be retargeted to; adds the list-price delta to the answer' })
  model?: string;
}

@Schema()
export class CatalogIssueResponse {
  @Field({ description: 'Location in the document, e.g. `tasks.novel-forge.chat.routes[1].model`; empty for the document itself' })
  path: string;

  @Field({ description: 'Machine-readable rule that failed, e.g. unknown_model or pinned_changed' })
  code: string;

  @Field()
  message: string;
}

@Schema({ description: 'The `SYN_CATALOG_INVALID` error body, with the issues the generic error shape does not carry' })
export class CatalogInvalidResponse {
  @Field()
  code: string;

  @Field()
  message: string;

  @Field(() => [CatalogIssueResponse])
  issues: CatalogIssueResponse[];
}

@Schema()
export class CatalogVersionSummaryResponse {
  @Field(() => Integer)
  version: number;

  @Field(() => String, { enum: [...CATALOG_STATES] })
  state: (typeof CATALOG_STATES)[number];

  @Field({ optional: true })
  note?: string;

  @Field({ optional: true, description: 'Subject of the admin whose change, budget update or rollback published it' })
  createdBy?: string;

  @Field(() => String, {
    nullable: true,
    description: 'Display name of `createdBy`, read from Identity when the response is built; null when Identity does not name that subject or cannot be reached',
  })
  createdByName: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time', optional: true })
  publishedAt?: Date;
}

@Schema()
export class CatalogVersionDetailResponse extends CatalogVersionSummaryResponse {
  @Field({ additionalProperties: true, description: 'The catalog document: providers, models, aliases, tasks and budgets' })
  document: Record<string, unknown>;
}

@Schema()
export class CatalogVersionListResponse {
  @Field(() => [CatalogVersionSummaryResponse], { description: 'Published and archived versions, newest first' })
  items: CatalogVersionSummaryResponse[];
}

@Schema()
export class ApplyChangeBody {
  @Field({
    additionalProperties: true,
    description: 'The whole catalog document as it should be live. It is validated before it is published; an invalid one is refused with 422 and its issues',
  })
  document: Record<string, unknown>;

  @Field(() => Integer, {
    nullable: true,
    minimum: 1,
    description:
      'Version of the active catalog the change was made against, or null when none has been published yet. Refused with 409 when the active version differs. A document equal to the active one publishes nothing and the response is that active version',
  })
  expectedVersion: number | null;

  @Field({ optional: true, maxLength: 500, description: 'Plain-language note stored with the new version and shown in history; defaults to "Catalog change"' })
  note?: string;
}

@Schema()
export class RollbackBody {
  @Field(() => Integer, {
    minimum: 1,
    description:
      'Version of the active catalog the caller saw when choosing to restore; refused with 409 when another version has been published since, so an undo never reverts a newer change. Restoring a document equal to the active one publishes nothing and the response is that active version',
  })
  expectedVersion: number;
}

@Schema()
export class PublishBudgetsBody {
  @Field(() => [Object], {
    description:
      'The complete budget list that replaces the active one. Validated with the whole catalog, so an invalid entry is refused with 422 and its issues. Budgets equal to the active ones publish nothing and the response is the active version',
  })
  budgets: Record<string, unknown>[];

  @Field(() => Integer, {
    minimum: 1,
    description: 'Version of the active catalog the budgets were edited against; refused with 409 when another version has been published since',
  })
  expectedVersion: number;

  @Field({ optional: true, maxLength: 500, description: 'Free-text note stored with the new version; defaults to "Budgets updated"' })
  note?: string;
}

@Schema()
export class AliasImpactRowResponse {
  @Field()
  app: string;

  @Field()
  task: string;

  @Field(() => Integer)
  calls: number;

  @Field(() => Integer)
  inputTokens: number;

  @Field(() => Integer)
  cachedInputTokens: number;

  @Field(() => Integer)
  outputTokens: number;

  @Field({ optional: true, description: 'Change in list cost over the window if this traffic had gone to the target model; negative is cheaper' })
  deltaUsd?: number;
}

@Schema()
export class AliasRetargetResponse {
  @Field()
  fromModel: string;

  @Field()
  toModel: string;

  @Field({ description: "List cost of the window's tokens at the current target model's prices" })
  currentUsd: number;

  @Field({ description: "List cost of the same tokens at the proposed model's prices. Image output is not included" })
  proposedUsd: number;

  @Field()
  deltaUsd: number;
}

@Schema()
export class AliasImpactResponse {
  @Field()
  alias: string;

  @Field({ description: 'Model the alias targets in the active catalog' })
  model: string;

  @Field(() => Integer)
  windowDays: number;

  @Field(() => String, { format: 'date-time' })
  since: Date;

  @Field(() => Integer)
  totalCalls: number;

  @Field(() => [AliasImpactRowResponse])
  rows: AliasImpactRowResponse[];

  @Field(() => AliasRetargetResponse, { optional: true, description: 'Present only when `model` was given' })
  retarget?: AliasRetargetResponse;
}
