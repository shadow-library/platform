import { Module } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { type Keyring, parseKeyring, SecretBox } from '@shadow-library/common/crypto';

import { DatabaseModule, DatabaseService } from '@server/modules/infrastructure/datastore';

import { IdentityKeyringService } from './identity-keyring.service';
import { JwksController } from './jwks.controller';
import { KeyService } from './key.service';
import { LegacyKeyProvider } from './legacy-key-provider';
import { IDENTITY_KEYRING, IDENTITY_SECRET_BOX, KEYRING_RETRY_DELAY } from './sealed-secret.constants';
import { SealedSecretRepository } from './sealed-secret.repository';
import { SecretSealer } from './secret-sealer.service';

@Module({
  imports: [DatabaseModule],
  controllers: [JwksController],
  providers: [
    { token: IDENTITY_KEYRING, useFactory: (): Keyring => parseKeyring(Config.get('identity.crypto.keys')) },
    { token: IDENTITY_SECRET_BOX, useFactory: (keyring: Keyring) => new SecretBox(keyring), inject: [IDENTITY_KEYRING] },
    { token: LegacyKeyProvider, useFactory: () => new LegacyKeyProvider(Config.get('identity.hmac-key')) },
    { token: KEYRING_RETRY_DELAY, useValue: (ms: number) => Bun.sleep(ms) },
    { token: SealedSecretRepository, useFactory: (databaseService: DatabaseService) => new SealedSecretRepository(databaseService.getPostgresClient()), inject: [DatabaseService] },
    SecretSealer,
    IdentityKeyringService,
    KeyService,
  ],
  exports: [KeyService, SecretSealer],
})
export class KeyModule {}
