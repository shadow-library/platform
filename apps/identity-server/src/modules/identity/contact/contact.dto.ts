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

/**
 * Declaring the constants
 */

@Schema()
export class ContactItemDto {
  @Field()
  value: string;

  @Field()
  isPrimary: boolean;

  @Field(() => String, { optional: true })
  verifiedAt?: string;
}

@Schema()
export class ContactListResponse {
  @Field(() => [ContactItemDto])
  items: ContactItemDto[];
}

@Schema()
export class AddEmailBody {
  @Field({ pattern: '^[^@\\s]+@[^@\\s]+[.][^@\\s]+$' })
  email: string;
}

@Schema()
export class AddPhoneBody {
  /** E.164 including the leading `+`. */
  @Field({ pattern: '^\\+[1-9]\\d{6,14}$' })
  phone: string;
}

@Schema()
export class AddContactResponse {
  /** Opaque handle for the pending verification; pass it back with the OTP. */
  @Field()
  verificationId: string;
}

@Schema()
export class VerifyContactBody {
  @Field()
  verificationId: string;

  @Field({ pattern: '^\\d{6}$' })
  code: string;
}

@Schema()
export class RemoveEmailBody {
  @Field({ pattern: '^[^@\\s]+@[^@\\s]+[.][^@\\s]+$' })
  email: string;
}

@Schema()
export class RemovePhoneBody {
  @Field({ pattern: '^\\+[1-9]\\d{6,14}$' })
  phone: string;
}

@Schema()
export class ContactOperationResponse {
  @Field()
  success: boolean;
}
