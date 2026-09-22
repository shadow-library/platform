import { Field, Schema } from '@shadow-library/class-schema';

import { TITLE_TEXT_MAX } from '../../ai/schemas/blueprint-title.schema';

export const TITLE_CHECK_BATCH_MAX = 8;
export const TITLE_CATALOG_CHARS = 42;
export const TITLE_CATALOG_WORDS = 7;
export const TITLE_CHECK_STATUSES = ['ok', 'warn', 'unknown'] as const;

export type TitleCheckStatus = (typeof TITLE_CHECK_STATUSES)[number];

@Schema()
export class TitleCheckResponse {
  @Field(() => String, { enum: [...TITLE_CHECK_STATUSES], description: '`unknown` means the check did not run; it is never reported as a pass.' })
  status: TitleCheckStatus;

  @Field({ minLength: 1, description: 'What the check found, or why it could not be made.' })
  detail: string;
}

@Schema()
export class TitleChecksResponse {
  @Field({ minLength: 1, maxLength: TITLE_TEXT_MAX, description: 'The title as it was checked, trimmed.' })
  title: string;

  @Field(() => TitleCheckResponse)
  catalogFit: TitleCheckResponse;

  @Field(() => TitleCheckResponse)
  library: TitleCheckResponse;

  @Field(() => TitleCheckResponse)
  published: TitleCheckResponse;
}

@Schema()
export class TitleChecksBody {
  @Field(() => [String], {
    minItems: 1,
    maxItems: TITLE_CHECK_BATCH_MAX,
    description: `The titles to check, at most one batch of ${TITLE_CHECK_BATCH_MAX}. Each is trimmed, blanks and repeats are dropped, and one longer than ${TITLE_TEXT_MAX} characters is refused.`,
  })
  titles: string[];
}

@Schema()
export class TitleChecksListResponse {
  @Field(() => [TitleChecksResponse], { maxItems: TITLE_CHECK_BATCH_MAX })
  results: TitleChecksResponse[];
}
