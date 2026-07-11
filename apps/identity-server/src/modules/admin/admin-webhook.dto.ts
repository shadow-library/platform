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

const DELIVERY_STATUSES = ['PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD'] as const;
type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/**
 * Declaring the constants
 */

@Schema()
export class WebhookIdParams {
  @Field({ pattern: '^\\d+$' })
  webhookId: string;
}

@Schema()
export class WebhookDeliveryParams {
  @Field({ pattern: '^\\d+$' })
  webhookId: string;

  @Field({ pattern: '^\\d+$' })
  deliveryId: string;
}

@Schema()
export class CreateWebhookBody {
  @Field({ minLength: 1, maxLength: 128 })
  name: string;

  @Field({ minLength: 8, maxLength: 2048 })
  targetUrl: string;

  @Field(() => [String], { minItems: 1, maxItems: 32 })
  eventTypes: string[];
}

@Schema()
export class UpdateWebhookBody {
  @Field(() => String, { optional: true, minLength: 1, maxLength: 128 })
  name?: string;

  @Field(() => String, { optional: true, minLength: 8, maxLength: 2048 })
  targetUrl?: string;

  @Field(() => [String], { optional: true, minItems: 1, maxItems: 32 })
  eventTypes?: string[];

  @Field(() => Boolean, { optional: true })
  isActive?: boolean;
}

@Schema()
export class WebhookItem {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  targetUrl: string;

  @Field(() => [String])
  eventTypes: string[];

  @Field(() => Boolean)
  isActive: boolean;

  @Field()
  createdAt: string;
}

@Schema()
export class WebhookListResponse {
  @Field(() => [WebhookItem])
  items: WebhookItem[];
}

@Schema()
export class CreatedWebhookResponse {
  @Field(() => WebhookItem)
  webhook: WebhookItem;

  /** Signing secret; shown exactly once. */
  @Field()
  secret: string;
}

@Schema()
export class RotatedWebhookSecretResponse {
  @Field()
  secret: string;
}

@Schema()
export class WebhookDeliveryItem {
  @Field()
  id: string;

  @Field()
  eventId: string;

  @Field()
  eventType: string;

  @Field(() => String, { enum: [...DELIVERY_STATUSES] })
  status: DeliveryStatus;

  @Field(() => Number)
  attemptCount: number;

  @Field(() => String, { optional: true })
  lastError?: string;

  @Field(() => Number, { optional: true })
  responseStatus?: number;

  @Field(() => String, { optional: true })
  sentAt?: string;

  @Field()
  createdAt: string;
}

@Schema()
export class WebhookDeliveriesQuery {
  @Field(() => String, { enum: [...DELIVERY_STATUSES], optional: true })
  status?: DeliveryStatus;
}

@Schema()
export class WebhookDeliveriesResponse {
  @Field(() => [WebhookDeliveryItem])
  items: WebhookDeliveryItem[];
}
