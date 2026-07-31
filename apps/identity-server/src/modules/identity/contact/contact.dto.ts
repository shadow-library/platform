/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { PATTERN } from '@server/constants';

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
  @Transform('strip:null')
  verifiedAt?: string;
}

@Schema()
export class ContactListResponse {
  @Field(() => [ContactItemDto])
  items: ContactItemDto[];
}

@Schema()
export class AddEmailBody {
  @Field({ ...PATTERN.EMAIL })
  email: string;
}

@Schema()
export class AddPhoneBody {
  /** E.164 including the leading `+`. */
  @Field({ ...PATTERN.PHONE })
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

  @Field({ ...PATTERN.OTP })
  code: string;
}

@Schema()
export class RemoveEmailBody {
  @Field({ ...PATTERN.EMAIL })
  email: string;
}

@Schema()
export class RemovePhoneBody {
  @Field({ ...PATTERN.PHONE })
  phone: string;
}

@Schema()
export class ContactOperationResponse {
  @Field()
  success: boolean;
}
