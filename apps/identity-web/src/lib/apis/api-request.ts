/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 *
 * The identity API's error and result surface now comes from `@shadow-library/web`, so one error
 * contract flows backend → server function → UI. This module re-exports that surface under the paths the
 * app's `*.api.ts` files already import, keeping `ApiError`/`call` in one place.
 */
export { ApiError, call, isApiError } from '@shadow-library/web';
export type { ApiFailure, ApiResult, ErrorField, ErrorResponse } from '@shadow-library/web';

/**
 * Declaring the constants
 */
