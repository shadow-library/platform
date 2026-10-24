import { Field, Integer, Schema } from '@shadow-library/class-schema';

const CATALOG_STATES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

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
  @Field(() => Integer, { description: 'Zero for the draft, which has no version until it is published' })
  version: number;

  @Field(() => String, { enum: [...CATALOG_STATES] })
  state: (typeof CATALOG_STATES)[number];

  @Field({ optional: true })
  note?: string;

  @Field({ optional: true, description: 'Subject of the admin who last saved or published it' })
  createdBy?: string;

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
export class DraftResponse {
  @Field(() => CatalogVersionDetailResponse)
  draft: CatalogVersionDetailResponse;

  @Field({ description: 'Content hash of the draft; publishing must present it to prove the draft was seen' })
  fingerprint: string;
}

@Schema()
export class SaveDraftBody {
  @Field({ additionalProperties: true, description: 'The whole catalog document. It is saved as sent, even when invalid, so work in progress survives' })
  document: Record<string, unknown>;

  @Field({ optional: true, maxLength: 500, description: 'Free-text note stored with the draft' })
  note?: string;

  @Field({ optional: true, minLength: 1, description: 'Fingerprint of the draft this save replaces; the save is refused with 409 when the draft has changed since' })
  expectedFingerprint?: string;

  @Field({ optional: true, description: 'The save starts a new draft; it is refused with 409 when a draft already exists' })
  expectNoDraft?: boolean;

  @Field(() => Integer, {
    optional: true,
    minimum: 1,
    description:
      'The active version the document was built from; requires expectNoDraft and cannot be combined with expectedFingerprint. The save is refused with 409 when the active version differs at save time, e.g. after a budget-only publish, so the draft cannot silently revert it',
  })
  expectedActiveVersion?: number;
}

@Schema()
export class SaveDraftResponse extends DraftResponse {
  @Field(() => [CatalogIssueResponse], { description: 'What would block publishing this draft; empty when it is publishable' })
  issues: CatalogIssueResponse[];
}

@Schema()
export class ValidateDraftResponse {
  @Field()
  valid: boolean;

  @Field(() => [CatalogIssueResponse])
  issues: CatalogIssueResponse[];
}

@Schema()
export class DraftDiffResponse {
  @Field({ description: 'Fingerprint of the draft this diff was computed from; publish with it' })
  fingerprint: string;

  @Field(() => [String], { description: 'Paths present in the draft only' })
  added: string[];

  @Field(() => [String], { description: 'Paths present in the active catalog only' })
  removed: string[];

  @Field(() => [String], { description: 'Paths whose values differ' })
  changed: string[];
}

@Schema()
export class PublishBody {
  @Field({ minLength: 1, description: 'Fingerprint of the draft being published, as returned when it was read or saved' })
  fingerprint: string;
}

@Schema()
export class DiscardDraftQuery {
  @Field({ minLength: 1, description: 'Fingerprint of the draft being discarded; the discard is refused with 409 when the draft has changed since' })
  fingerprint: string;
}

@Schema()
export class PublishBudgetsBody {
  @Field(() => [Object], {
    description: 'The complete budget list that replaces the active one. Validated with the whole catalog, so an invalid entry is refused with 422 and its issues',
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
