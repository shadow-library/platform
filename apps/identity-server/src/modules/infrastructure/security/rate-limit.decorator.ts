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

export interface RateLimitPolicy {
  /** Counter bucket name; keep it stable — it is part of the Redis key */
  name: string;
  /** Maximum hits per window per client IP */
  limit: number;
  /** Window length in seconds */
  windowSeconds: number;
}

type RateLimitDecorator = ClassDecorator & MethodDecorator;

/**
 * Declaring the constants
 */

/** Route metadata key the decorator writes and the rate-limit middleware reads */
export const RATE_LIMIT_METADATA = 'rateLimit';

/**
 * Applies a per-IP budget to the route (Tier-1, architecture §13.2). Decorated routes are the
 * authentication surface, so a Redis outage fails closed for them; undecorated routes only get the
 * general per-IP limit and fail open.
 */
export const RateLimit = (policy: RateLimitPolicy): RateLimitDecorator => Handler({ [RATE_LIMIT_METADATA]: policy });
