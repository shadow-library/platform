import { Module } from '@shadow-library/app';

import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { JwksController } from './jwks.controller';
import { EnvKeyProvider, KeyProvider } from './key-provider';
import { KeyService } from './key.service';

@Module({
  imports: [DatabaseModule],
  controllers: [JwksController],
  providers: [KeyService, { token: KeyProvider, useClass: EnvKeyProvider }],
  exports: [KeyService, KeyProvider],
})
export class KeyModule {}
