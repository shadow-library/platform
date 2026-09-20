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
export class CheckoutDto {
  @Field({ enum: ['monthly', 'yearly'], description: 'Billing period to purchase; pricing per period is environment config (PRD §6.9)' })
  plan: 'monthly' | 'yearly';
}

@Schema()
export class CheckoutResponseDto {
  @Field({ description: "The payment provider's hosted checkout URL to redirect to; it already carries this account's purchase token as client reference" })
  url: string;

  @Field({ format: 'date-time', description: 'When the hosted session stops accepting payment and a new one must be created' })
  expiresAt: string;
}

@Schema()
export class WebhookParamsDto {
  @Field({ description: 'Adapter id of the payment provider delivering this event' })
  provider: string;
}

@Schema()
export class WebhookResponseDto {
  @Field({ description: 'Always true for any delivery that verified — duplicates, stale events and unmatched purchase tokens are acknowledged rather than retried' })
  received: boolean;
}
