/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { WebauthnAssertion } from '@server/modules/auth/mfa';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class LoginInitBody {
  @Field()
  identifier: string;

  @Field({ optional: true })
  deviceId?: string;

  /** Post-login destination; must be a relative path or a URL on this origin (validated server-side). */
  @Field({ optional: true, maxLength: 2048 })
  returnTo?: string;
}

@Schema()
export class FederatedLoginOptionDto {
  @Field()
  authorizationUrl: string;

  /** True when the organisation mandates federated sign-in and local credential steps will refuse. */
  @Field()
  enforced: boolean;
}

@Schema()
export class LoginInitResponse {
  @Field()
  flowId: string;

  @Field()
  status: string;

  @Field()
  hasAlternativeMethods: boolean;

  @Field(() => FederatedLoginOptionDto, { optional: true })
  federated?: FederatedLoginOptionDto;
}

@Schema()
export class ChallengeVerifyBody {
  @Field()
  flowId: string;

  @Field({ optional: true })
  password?: string;

  @Field({ optional: true })
  code?: string;

  /** Single-use MFA bypass code; accepted wherever a second factor is awaited. */
  @Field({ optional: true })
  recoveryCode?: string;

  /** Passkey assertion, as either the first factor or the MFA step. */
  @Field(() => WebauthnAssertion, { optional: true })
  webauthn?: WebauthnAssertion;
}

@Schema()
export class WebauthnOptionsBody {
  /** Absent for a usernameless (discoverable credential) login; present for a flow's MFA step. */
  @Field({ optional: true })
  flowId?: string;

  @Field({ optional: true })
  deviceId?: string;
}

@Schema()
export class ChallengeVerifyResponse {
  @Field()
  flowId: string;

  @Field()
  status: string;

  @Field(() => Number, { optional: true })
  attemptsLeft?: number;
}

@Schema()
export class ChallengeMethodMetadata {
  @Field({ optional: true })
  maskedEmail?: string;

  @Field({ optional: true })
  maskedPhone?: string;
}

@Schema()
export class FlowStatusResponse {
  @Field()
  flowId: string;

  @Field()
  status: string;

  @Field(() => Number, { optional: true })
  resendsLeft?: number;

  @Field(() => ChallengeMethodMetadata, { optional: true })
  metadata?: ChallengeMethodMetadata;
}

@Schema()
export class ChallengeMethod {
  @Field(() => String, { enum: ['PASSWORD', 'WEBAUTHN', 'EMAIL_OTP', 'SMS_OTP'] })
  name: 'PASSWORD' | 'WEBAUTHN' | 'EMAIL_OTP' | 'SMS_OTP';

  @Field(() => ChallengeMethodMetadata, { optional: true })
  metadata?: ChallengeMethodMetadata;
}

@Schema()
export class ChallengeMethodsQuery {
  @Field()
  flowId: string;
}

@Schema()
export class ChallengeMethodsResponse {
  @Field()
  flowId: string;

  @Field(() => [ChallengeMethod])
  methods: ChallengeMethod[];
}

@Schema()
export class ChallengeChangeBody {
  @Field()
  flowId: string;

  @Field(() => String, { enum: ['PASSWORD', 'WEBAUTHN', 'EMAIL_OTP', 'SMS_OTP'] })
  method: 'PASSWORD' | 'WEBAUTHN' | 'EMAIL_OTP' | 'SMS_OTP';
}

@Schema()
export class ChallengeResendBody {
  @Field()
  flowId: string;

  @Field(() => String, { enum: ['EMAIL_OTP', 'SMS_OTP'] })
  method: 'EMAIL_OTP' | 'SMS_OTP';
}

@Schema()
export class ChallengeResendResponse {
  @Field(() => String, { enum: ['SENT', 'LIMITED'] })
  status: 'SENT' | 'LIMITED';

  @Field(() => Number, { optional: true })
  resendsLeft?: number;

  @Field(() => Number, { optional: true })
  retryAfterSeconds?: number;
}

@Schema()
export class CancelFlowBody {
  @Field()
  flowId: string;
}

@Schema()
export class RegisterInitBody {
  @Field()
  email: string;

  @Field({ optional: true })
  deviceId?: string;
}

@Schema()
export class DemographicsBody {
  @Field()
  flowId: string;

  @Field({ optional: true })
  dateOfBirth?: string;

  @Field(() => String, { optional: true, enum: ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'] })
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNSPECIFIED';
}

@Schema()
export class ProfileBody {
  @Field()
  flowId: string;

  @Field()
  firstName: string;

  @Field()
  lastName: string;
}

@Schema()
export class SetPasswordBody {
  @Field()
  flowId: string;

  @Field()
  password: string;
}

@Schema()
export class RecoverInitBody {
  @Field()
  identifier: string;

  @Field({ optional: true })
  deviceId?: string;
}

@Schema()
export class LoginResetPasswordBody {
  @Field()
  flowId: string;

  /** Re-proves the credential the password step already accepted before it is rotated. */
  @Field()
  currentPassword: string;

  @Field()
  newPassword: string;
}

@Schema()
export class ResetPasswordBody {
  @Field()
  flowId: string;

  @Field()
  newPassword: string;
}
