/**
 * Importing npm packages
 */
import { Field, OmitType, Schema } from '@shadow-library/class-schema';

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
export class UserResponse extends OmitType(CreateUserBody, ['password']) {
  @Field(() => Number, { description: 'ID of the user' })
  id: number;
}
