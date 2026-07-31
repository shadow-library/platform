/**
 * Importing npm packages
 */
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * A deployment is production when EITHER signal says so: the operator-set deployment stage
 * (`APP_STAGE`/`app.stage`) or the runtime `NODE_ENV` (`Config.isProd`). Gating security
 * fail-fasts on only `NODE_ENV` lets an `APP_STAGE=prod` box with `NODE_ENV` unset silently fall
 * back to insecure development defaults, so every prod fail-fast and Secure-cookie gate keys on this.
 */
export const isProduction = (): boolean => Config.get('app.stage') === 'prod' || Config.isProd();
