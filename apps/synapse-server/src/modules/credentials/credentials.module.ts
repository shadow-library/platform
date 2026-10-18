import { Module } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { type Keyring, parseKeyring, SecretBox } from '@shadow-library/common/crypto';
import { DatabaseModule } from '@shadow-library/modules';

import { CatalogModule, SYSTEM_TIMERS } from '@modules/catalog';

import { CREDENTIAL_BOX, CREDENTIAL_FETCH, CREDENTIAL_KEYRING, CREDENTIAL_TIMERS } from './credential.constants';
import { CredentialKeyringService } from './credential-keyring.service';
import { CredentialProber } from './credential-prober';
import { CredentialRepository } from './credential.repository';
import { CredentialResolver } from './credential-resolver.service';
import { CredentialService } from './credential.service';

@Module({
  imports: [DatabaseModule, CatalogModule],
  providers: [
    { token: CREDENTIAL_KEYRING, useFactory: (): Keyring => parseKeyring(Config.get('synapse.crypto.keys')) },
    { token: CREDENTIAL_BOX, useFactory: (keyring: Keyring) => new SecretBox(keyring), inject: [CREDENTIAL_KEYRING] },
    { token: CREDENTIAL_TIMERS, useValue: SYSTEM_TIMERS },
    { token: CREDENTIAL_FETCH, useValue: (url: string, init: RequestInit) => fetch(url, init) },
    CredentialRepository,
    CredentialResolver,
    CredentialKeyringService,
    CredentialProber,
    CredentialService,
  ],
  exports: [CredentialResolver, CredentialService],
})
export class CredentialsModule {}
