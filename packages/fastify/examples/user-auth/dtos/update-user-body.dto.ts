/**
 * Importing npm packages
 */
import { PartialType, Schema } from '@shadow-library/class-schema';

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
export class UpdateUserBody extends PartialType(CreateUserBody) {}
