import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class SamlSsoQuery {
  @Field({ description: 'SAML 2.0 binding wire parameter; the uppercase name is required by the protocol.' })
  SAMLRequest: string;

  @Field({ optional: true, maxLength: 512 })
  RelayState?: string;
}

@Schema()
export class SamlResumeQuery {
  @Field()
  rid: string;
}
