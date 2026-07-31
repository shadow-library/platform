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
export class JwkDto {
  @Field()
  kty: string;

  @Field()
  crv: string;

  @Field()
  x: string;

  @Field()
  kid: string;

  @Field()
  use: string;

  @Field()
  alg: string;
}

@Schema()
export class JwksResponse {
  @Field(() => [JwkDto])
  keys: JwkDto[];
}
