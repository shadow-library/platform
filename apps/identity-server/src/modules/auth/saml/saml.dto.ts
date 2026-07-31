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
 *
 * Parameter names follow the SAML 2.0 bindings specification (`SAMLRequest`, `RelayState`), not
 * the platform's camelCase convention — they are wire-format identifiers.
 */

@Schema()
export class SamlSsoQuery {
  @Field()
  SAMLRequest: string;

  @Field({ optional: true, maxLength: 512 })
  RelayState?: string;
}

@Schema()
export class SamlResumeQuery {
  @Field()
  rid: string;
}
