import { Module } from '@shadow-library/app';

import { CacheInterceptor } from './cache.interceptor';
import { CacheService } from './cache.service';
import { CatService } from './cat.service';
import { LoggerService } from './logger.service';

@Module({
  providers: [CatService, CacheService, CacheInterceptor, LoggerService],
  exports: [CatService],
})
export class AppModule {}
