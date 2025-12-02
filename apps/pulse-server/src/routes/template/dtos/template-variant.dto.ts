/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

import { schema } from '@modules/datastore';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class TemplateVariantResponse {
  @Field({ enum: schema.notificationChannel.enumValues })
  channel: string;

  @Field()
  locale: string;

  @Field({ optional: true })
  subject?: string | null;

  @Field()
  body: string;

  @Field()
  isActive: boolean;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}
