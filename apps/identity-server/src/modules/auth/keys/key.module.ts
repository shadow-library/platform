/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { JwksController } from './jwks.controller';
import { EnvKeyProvider, KeyProvider } from './key-provider';
import { KeyService } from './key.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  controllers: [JwksController],
  providers: [KeyService, { token: KeyProvider, useClass: EnvKeyProvider }],
  exports: [KeyService, KeyProvider],
})
export class KeyModule {}
