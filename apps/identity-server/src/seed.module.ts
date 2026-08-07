import './bootstrap';

import { Module } from '@shadow-library/app';

import { KeyModule } from './modules/auth/keys';
import { SamlKeyService } from './modules/auth/saml';
import { BootstrapModule } from './modules/bootstrap';
import { DatastoreModule } from './modules/infrastructure/datastore';

@Module({
  imports: [DatastoreModule, KeyModule, BootstrapModule],
  providers: [SamlKeyService],
})
export class SeedModule {}
