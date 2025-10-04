/**
 * Importing npm packages
 */
import { PickType, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { UserResponse } from './user-response.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class UserParams extends PickType(UserResponse, ['id'] as const) {}
