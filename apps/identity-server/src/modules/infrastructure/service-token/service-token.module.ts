import { Module } from '@shadow-library/app';

import { KeyModule } from '@server/modules/auth/keys';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { ServiceTokenService } from './service-token.service';

@Module({
  imports: [DatabaseModule, KeyModule],
  providers: [ServiceTokenService],
  exports: [ServiceTokenService],
})
export class ServiceTokenModule {}
