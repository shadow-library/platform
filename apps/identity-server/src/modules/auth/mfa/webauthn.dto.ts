import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class WebauthnRpEntity {
  @Field()
  name: string;

  @Field({ optional: true })
  id?: string;
}

@Schema()
export class WebauthnUserEntity {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  displayName: string;
}

@Schema()
export class WebauthnCredParam {
  @Field()
  alg: number;

  @Field()
  type: string;
}

@Schema()
export class WebauthnCredentialDescriptor {
  @Field()
  id: string;

  @Field()
  type: string;

  @Field(() => [String], { optional: true })
  transports?: string[];
}

@Schema()
export class WebauthnAuthenticatorSelection {
  @Field({ optional: true })
  authenticatorAttachment?: string;

  @Field({ optional: true })
  residentKey?: string;

  @Field(() => Boolean, { optional: true })
  requireResidentKey?: boolean;

  @Field({ optional: true })
  userVerification?: string;
}

@Schema()
export class WebauthnExtensions {
  @Field(() => Boolean, { optional: true })
  credProps?: boolean;
}

@Schema()
export class WebauthnRegistrationOptionsResponse {
  @Field(() => WebauthnRpEntity)
  rp: WebauthnRpEntity;

  @Field(() => WebauthnUserEntity)
  user: WebauthnUserEntity;

  @Field()
  challenge: string;

  @Field(() => [WebauthnCredParam])
  pubKeyCredParams: WebauthnCredParam[];

  @Field(() => Number, { optional: true })
  timeout?: number;

  @Field(() => [WebauthnCredentialDescriptor], { optional: true })
  excludeCredentials?: WebauthnCredentialDescriptor[];

  @Field(() => WebauthnAuthenticatorSelection, { optional: true })
  authenticatorSelection?: WebauthnAuthenticatorSelection;

  @Field({ optional: true })
  attestation?: string;

  @Field(() => WebauthnExtensions, { optional: true })
  extensions?: WebauthnExtensions;
}

@Schema()
export class WebauthnAuthenticationOptions {
  @Field()
  challenge: string;

  @Field(() => Number, { optional: true })
  timeout?: number;

  @Field({ optional: true })
  rpId?: string;

  @Field(() => [WebauthnCredentialDescriptor], { optional: true })
  allowCredentials?: WebauthnCredentialDescriptor[];

  @Field({ optional: true })
  userVerification?: string;
}

@Schema()
export class WebauthnChallengeResponse {
  @Field()
  flowId: string;

  @Field(() => WebauthnAuthenticationOptions)
  options: WebauthnAuthenticationOptions;
}

@Schema()
export class WebauthnStepUpOptionsResponse {
  @Field(() => WebauthnAuthenticationOptions, { description: 'Assertion options for the session-scoped passkey step-up ceremony; no flow identifier is exposed.' })
  options: WebauthnAuthenticationOptions;
}

@Schema()
export class WebauthnAttestationData {
  @Field()
  clientDataJSON: string;

  @Field()
  attestationObject: string;

  @Field(() => [String], { optional: true })
  transports?: string[];
}

@Schema()
export class WebauthnRemoveParams {
  @Field()
  credentialId: string;
}

@Schema()
export class WebauthnRegisterVerifyBody {
  @Field()
  id: string;

  @Field()
  rawId: string;

  @Field(() => String, { enum: ['public-key'] })
  type: 'public-key';

  @Field(() => WebauthnAttestationData)
  response: WebauthnAttestationData;

  @Field({ optional: true })
  authenticatorAttachment?: string;

  @Field({ optional: true, maxLength: 64 })
  label?: string;
}

@Schema()
export class WebauthnAssertionData {
  @Field()
  clientDataJSON: string;

  @Field()
  authenticatorData: string;

  @Field()
  signature: string;

  @Field({ optional: true })
  userHandle?: string;
}

@Schema()
export class WebauthnAssertion {
  @Field()
  id: string;

  @Field()
  rawId: string;

  @Field(() => String, { enum: ['public-key'] })
  type: 'public-key';

  @Field(() => WebauthnAssertionData)
  response: WebauthnAssertionData;

  @Field({ optional: true })
  authenticatorAttachment?: string;
}

@Schema()
export class WebauthnStepUpBody extends WebauthnAssertion {
  @Field({ optional: true, maxLength: 64, description: 'Application client for which the step-up assertion is performed.' })
  clientId?: string;

  @Field({ optional: true, maxLength: 255, description: 'Target resource for which the step-up assertion is performed.' })
  resource?: string;
}

@Schema()
export class WebauthnRegisterResponse {
  @Field()
  success: boolean;

  @Field(() => [String], { optional: true, description: "Present only when registration creates the account's first recovery-code batch." })
  recoveryCodes?: string[];
}
