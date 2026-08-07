import { Module } from '@shadow-library/app';

import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { M2MRateLimitMiddleware } from './m2m-rate-limit.middleware';
import { RateLimitMiddleware } from './rate-limit.middleware';
import { RateLimiterService } from './rate-limiter.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RateLimitMiddleware, M2MRateLimitMiddleware],
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class SecurityModule {}
