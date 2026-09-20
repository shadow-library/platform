/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

@Schema()
export class OcrParseDto {
  @Field({ minLength: 1, maxLength: 8000, description: 'On-device-extracted receipt text (ARCHITECTURE §14.3 step 1); the server never sees the receipt image itself' })
  extractedText: string;
}

@Schema()
export class OcrLineItemDto {
  @Field()
  label: string;

  @Field({ optional: true, nullable: true })
  amountText?: string | null;

  @Field({ optional: true, nullable: true })
  amountMinor?: number | null;
}

@Schema()
export class OcrParseResponseDto {
  @Field()
  amount: string;

  @Field({ optional: true, nullable: true })
  merchant?: string | null;

  @Field({ optional: true, nullable: true })
  category?: string | null;

  @Field({ optional: true, nullable: true, format: 'date' })
  date?: string | null;

  @Field()
  confidence: number;

  @Field(() => [OcrLineItemDto], {
    optional: true,
    nullable: true,
    description: 'Present only when the structuring call resolved individual line items; the client still offers full/total-only/mix at confirm time',
  })
  lineItems?: OcrLineItemDto[] | null;
}

@Schema()
export class OcrQuotaResponseDto {
  @Field({ description: 'Daily scan cap (quotas.ocr-daily, tunable)' })
  cap: number;

  @Field({ description: "Scans consumed so far for the account's current local day" })
  used: number;

  @Field()
  remaining: number;

  @Field({ format: 'date-time', description: 'Next local midnight in the account timezone — when the count resets' })
  resetAt: string;
}
