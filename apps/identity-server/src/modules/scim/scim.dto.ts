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
 * Only the fixed-shape query and path inputs go through class-schema; SCIM bodies are runtime
 * validated in scim.types.ts because RFC 7644 PATCH values are polymorphic (recorded deviation).
 */

@Schema()
export class ScimIdParams {
  @Field()
  id: string;
}

@Schema()
export class ScimListQuery {
  @Field({ optional: true, maxLength: 512 })
  filter?: string;

  @Field({ optional: true })
  startIndex?: string;

  @Field({ optional: true })
  count?: string;
}
