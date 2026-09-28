import { Module } from '@shadow-library/app';

import { KeyModule } from '@server/modules/auth/keys/key.module';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { M2MRateLimitMiddleware } from './m2m-rate-limit.middleware';
import { RateLimitMiddleware } from './rate-limit.middleware';
import { RateLimiterService } from './rate-limiter.service';
import { ServiceCallerService } from './service-caller.service';

@Module({
  imports: [DatabaseModule, KeyModule],
  controllers: [RateLimitMiddleware, M2MRateLimitMiddleware],
  providers: [RateLimiterService, ServiceCallerService],
  exports: [RateLimiterService],
})
export class SecurityModule {}
