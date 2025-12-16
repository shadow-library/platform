/**
 * Importing npm packages
 */
import { Field, OmitType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

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
  @Field(() => String, { description: 'ID of the user' })
  @Transform({ input: 'int:parse', output: 'int:stringify' })
  id: number;
}
