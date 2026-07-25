/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { M2MRateLimitMiddleware } from './m2m-rate-limit.middleware';
import { RateLimitMiddleware } from './rate-limit.middleware';
import { RateLimiterService } from './rate-limiter.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  controllers: [RateLimitMiddleware, M2MRateLimitMiddleware],
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class SecurityModule {}
