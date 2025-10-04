/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Sensitive } from '@shadow-library/fastify';

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
export class CreateUserBody {
  @Field(() => String, { minLength: 3, maxLength: 36, description: 'Name of the person to greet' })
  @Sensitive('words')
  name: string;

  @Sensitive('email')
  @Field(() => String, { description: 'Email of the user' })
  email: string;

  @Field(() => Integer, { minimum: 1, maximum: 10, description: 'Access level of the user' })
  accessLevel: number;

  @Sensitive()
  @Field()
  password: string;
}
