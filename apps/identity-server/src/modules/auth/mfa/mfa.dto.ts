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
export class TotpEnrollResponse {
  /** Base32 seed for manual entry into an authenticator app; returned exactly once. */
  @Field()
  secret: string;

  /** otpauth:// provisioning URI, typically rendered as a QR code. */
  @Field()
  uri: string;
}

@Schema()
export class TotpCodeBody {
  @Field({ pattern: '^\\d{6}$' })
  code: string;
}

@Schema()
export class MfaEnrollmentItem {
  @Field(() => String, { enum: ['TOTP', 'WEBAUTHN', 'EMAIL_OTP'] })
  type: 'TOTP' | 'WEBAUTHN' | 'EMAIL_OTP';

  @Field()
  label: string;

  @Field()
  createdAt: string;

  @Field(() => String, { optional: true })
  lastUsedAt?: string;
}

@Schema()
export class MfaEnrollmentsResponse {
  @Field(() => [MfaEnrollmentItem])
  enrollments: MfaEnrollmentItem[];
}

@Schema()
export class StepUpResponse {
  @Field(() => String, { enum: ['AAL1', 'AAL2'] })
  aal: 'AAL1' | 'AAL2';

  @Field()
  elevatedUntil: string;
}

@Schema()
export class OperationSuccessResponse {
  @Field()
  success: boolean;
}
