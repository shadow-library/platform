/**
 * Importing npm packages
 */
import { Handler } from '@shadow-library/app';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
type PublicDecorator = ClassDecorator & MethodDecorator;

/**
 * Declaring the constants
 */

/** Route metadata key the sentinel reads as an explicit opt-out of the default-deny policy */
export const PUBLIC_ROUTE_METADATA = 'pulsePublic';

/** Marks a controller route as intentionally unauthenticated, exempting it from the default-deny sentinel */
export const Public = (): PublicDecorator => Handler({ [PUBLIC_ROUTE_METADATA]: true });
