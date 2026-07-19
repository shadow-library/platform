/**
 * Importing npm packages
 */
import { Handler } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { type AuthOptions } from './access.types';

/**
 * Defining types
 */

type AccessDecorator = ClassDecorator & MethodDecorator;

/**
 * Declaring the constants
 */
export const ACCESS_METADATA = 'access';

/**
 * Declares the access a route (or every route on a controller) requires. The central `AccessGuard`
 * reads this metadata and enforces authentication plus coarse authorization before the handler runs;
 * an undecorated route is unguarded, so use `@Auth({ public: true })` to state that intent
 * explicitly. Method-level metadata overrides class-level, matching the reference guard.
 */
export const Auth = (options: AuthOptions = {}): AccessDecorator => Handler({ [ACCESS_METADATA]: options });
