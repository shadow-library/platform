import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { PATTERN } from '@server/constants';

@Schema()
export class TotpEnrollResponse {
  @Field({ description: 'Base32 seed for manual entry into an authenticator app; returned exactly once.' })
  secret: string;

  @Field({ description: 'otpauth:// provisioning URI, typically rendered as a QR code.' })
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

  @Field(() => String, { optional: true, description: 'Present for WEBAUTHN entries; use this value when deleting the credential.' })
  credentialId?: string;
}

@Schema()
export class MfaEnrollmentsResponse {
  @Field(() => [MfaEnrollmentItem])
  enrollments: MfaEnrollmentItem[];

  @Field(() => Number, { description: 'Unused single-use recovery codes remaining in the current batch.' })
  recoveryCodesRemaining: number;
}

@Schema()
export class StepUpResponse {
  @Field(() => String, { enum: ['AAL1', 'AAL2'] })
  aal: 'AAL1' | 'AAL2';

  @Field()
  elevatedUntil: string;
}

@Schema()
export class ElevationIntentFields {
  @Field({
    optional: true,
    maxLength: 64,
    description: 'Application client for which the step-up is performed; only a claim naming the same client and resource may spend the window.',
  })
  clientId?: string;

  @Field({
    optional: true,
    maxLength: 255,
    description: 'Target resource for which the step-up is performed; omitting the client and resource opens a window usable only by the identity console.',
  })
  resource?: string;
}

@Schema()
export class StepUpBody extends ElevationIntentFields {
  @Field({ ...PATTERN.OTP, optional: true, description: 'Six-digit TOTP code required when the account has a second factor.' })
  code?: string;

  @Field({ optional: true, minLength: 1, description: 'Account password, accepted only when no second factor is enrolled.' })
  password?: string;
}

@Schema()
export class StepUpIntentQuery {
  @Field({ maxLength: 64 })
  clientId: string;
}

@Schema()
export class StepUpIntentResponse {
  @Field({
    optional: true,
    description: 'Application label for a hosted step-up prompt; absent for an unknown or inactive client to avoid exposing a probe result.',
  })
  applicationName?: string;
}

@Schema()
export class StepUpMethodsResponse {
  @Field(() => [String], { description: 'Methods available for elevation; an empty array means the account must enroll a factor first.' })
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

  @Field(() => [String], { optional: true, description: "Present only when activation creates the account's first recovery-code batch." })
  recoveryCodes?: string[];
}

@Schema()
export class RecoveryCodesResponse {
  @Field(() => [String], { description: 'Recovery codes shown exactly once; only hashes are retained server-side.' })
  recoveryCodes: string[];
}
