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

export type SamlNameIdFormatValue = 'EMAIL' | 'PERSISTENT';

/**
 * Declaring the constants
 */

@Schema()
export class ServiceProviderIdParams {
  @Field()
  serviceProviderId: string;
}

@Schema()
export class CreateServiceProviderBody {
  @Field({ minLength: 1, maxLength: 512 })
  entityId: string;

  @Field({ minLength: 1, maxLength: 255 })
  name: string;

  @Field({ maxLength: 2048 })
  acsUrl: string;

  /** Links the SP to an application; a linked SP enforces the access gate before asserting (T-902). */
  @Field(() => Number, { optional: true })
  applicationId?: number;

  @Field(() => String, { optional: true, enum: ['EMAIL', 'PERSISTENT'] })
  nameIdFormat?: SamlNameIdFormatValue;

  @Field(() => [String], { optional: true })
  releasedAttributes?: string[];

  @Field({ optional: true, maxLength: 8192 })
  spCertificatePem?: string;
}

@Schema()
export class UpdateServiceProviderBody {
  @Field({ optional: true, minLength: 1, maxLength: 255 })
  name?: string;

  @Field({ optional: true, maxLength: 2048 })
  acsUrl?: string;

  /** Links (or, as `null`, unlinks) the application whose access gate the SP enforces (T-902). */
  @Field(() => Number, { optional: true, nullable: true })
  applicationId?: number | null;

  @Field(() => String, { optional: true, enum: ['EMAIL', 'PERSISTENT'] })
  nameIdFormat?: SamlNameIdFormatValue;

  @Field(() => [String], { optional: true })
  releasedAttributes?: string[];

  @Field({ optional: true })
  isActive?: boolean;
}

@Schema()
export class ServiceProviderItem {
  @Field()
  id: string;

  @Field()
  entityId: string;

  @Field()
  name: string;

  @Field()
  acsUrl: string;

  @Field(() => Number, { optional: true })
  applicationId?: number;

  @Field(() => String, { enum: ['EMAIL', 'PERSISTENT'] })
  nameIdFormat: SamlNameIdFormatValue;

  @Field(() => [String])
  releasedAttributes: string[];

  @Field()
  isActive: boolean;

  @Field()
  createdAt: string;
}

@Schema()
export class ServiceProviderListResponse {
  @Field(() => [ServiceProviderItem])
  items: ServiceProviderItem[];
}
