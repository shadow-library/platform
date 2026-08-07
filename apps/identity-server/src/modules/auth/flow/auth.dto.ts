import { Field, Schema } from '@shadow-library/class-schema';

import { PATTERN } from '@server/constants';
import { WebauthnAssertion } from '@server/modules/auth/mfa';

@Schema()
export class LoginInitBody {
  @Field({ ...PATTERN.IDENTIFIER, maxLength: 320, description: 'Email address, E.164 phone number, or username.' })
  identifier: string;

  @Field({ optional: true })
  deviceId?: string;

  @Field({ optional: true, maxLength: 2048, description: 'Post-login destination; must be a relative path or a URL on this origin.' })
  returnTo?: string;
}

@Schema()
export class FederatedLoginOptionDto {
  @Field()
  authorizationUrl: string;

  @Field({ description: 'True when the organisation requires federated sign-in and local credential steps are unavailable.' })
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

  @Field({ optional: true, description: 'Single-use MFA bypass code accepted when a second factor is required.' })
  recoveryCode?: string;

  @Field(() => WebauthnAssertion, { optional: true, description: 'Passkey assertion used as either the first factor or the MFA step.' })
  webauthn?: WebauthnAssertion;
}

@Schema()
export class WebauthnOptionsBody {
  @Field({ optional: true, description: "Absent for a usernameless discoverable-credential login; present for a flow's MFA step." })
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
  @Field({ ...PATTERN.IDENTIFIER, maxLength: 320 })
  identifier: string;

  @Field({ optional: true })
  deviceId?: string;
}

@Schema()
export class LoginResetPasswordBody {
  @Field()
  flowId: string;

  @Field({ description: 'Re-proves the credential accepted by the password step before it is rotated.' })
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
