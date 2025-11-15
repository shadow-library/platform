/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { CreateUserBody } from './create-user-body.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class UserRaResponse extends CreateUserBody {
  @Field(() => Number, { description: 'ID of the user' })
  id: number;
}
