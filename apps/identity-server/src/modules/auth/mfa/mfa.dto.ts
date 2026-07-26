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
  @Field({ ...PATTERN.OTP })
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
  @Transform('strip:null')
  lastUsedAt?: string;

  /** Present on WEBAUTHN entries — the id `DELETE /me/webauthn/{credentialId}` expects. */
  @Field(() => String, { optional: true })
  credentialId?: string;
}

@Schema()
export class MfaEnrollmentsResponse {
  @Field(() => [MfaEnrollmentItem])
  enrollments: MfaEnrollmentItem[];

  /** Unused single-use recovery codes remaining in the current batch. */
  @Field(() => Number)
  recoveryCodesRemaining: number;
}

@Schema()
export class StepUpResponse {
  @Field(() => String, { enum: ['AAL1', 'AAL2'] })
  aal: 'AAL1' | 'AAL2';

  @Field()
  elevatedUntil: string;
}

/**
 * The application a step-up is being performed *for* (D-19, T-801). Only a claim naming the same
 * pair can spend the window; omitting them opens a window for the identity console alone, which no
 * application may claim.
 */
@Schema()
export class ElevationIntentFields {
  @Field({ optional: true, maxLength: 64 })
  clientId?: string;

  @Field({ optional: true, maxLength: 255 })
  resource?: string;
}

@Schema()
export class StepUpBody extends ElevationIntentFields {
  /** A 6-digit TOTP code — required to elevate when the account holds a second factor. */
  @Field({ ...PATTERN.OTP, optional: true })
  code?: string;

  /** The account password — accepted only when the account has no second factor enrolled. */
  @Field({ optional: true, minLength: 1 })
  password?: string;
}

@Schema()
export class StepUpIntentQuery {
  @Field({ maxLength: 64 })
  clientId: string;
}

/**
 * The label a hosted step-up prompt renders for an app-initiated ceremony (D-19, T-801).
 * `applicationName` is absent for an unknown or inactive client id, which the prompt shows as a
 * neutral failure rather than a probe result.
 */
@Schema()
export class StepUpIntentResponse {
  @Field({ optional: true })
  applicationName?: string;
}

@Schema()
export class StepUpMethodsResponse {
  /** Methods the account may use to elevate; empty means it must enrol a factor first. */
  @Field(() => [String])
  methods: ('TOTP' | 'WEBAUTHN' | 'PASSWORD')[];
}

@Schema()
export class OperationSuccessResponse {
  @Field()
  success: boolean;
}

@Schema()
export class TotpActivateResponse {
  @Field()
  success: boolean;

  /** Present only when this activation produced the account's first recovery-code batch. */
  @Field(() => [String], { optional: true })
  recoveryCodes?: string[];
}

@Schema()
export class RecoveryCodesResponse {
  /** Shown exactly once; only hashes are retained server-side. */
  @Field(() => [String])
  recoveryCodes: string[];
}
