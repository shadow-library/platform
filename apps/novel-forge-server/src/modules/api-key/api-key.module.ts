import { Module } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { resolveAuthClientConfig } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

import { ApiKeyController, ApiKeySelfController } from './api-key.controller';
import { ApiKeyGuard } from './api-key.middleware';
import { ApiKeyService } from './api-key.service';

// The AuthClient is a module-owned provider built from the SDK's own config resolver, exactly as
// PublishingModule builds one: the guard's dynamic module is imported once and resolved eagerly, so
// re-exporting its instance would make this module's wiring order-dependent.
@Module({
  imports: [DatabaseModule, FastifyModule],
  controllers: [ApiKeyController, ApiKeySelfController, ApiKeyGuard],
  providers: [{ token: AuthClient, useFactory: () => new AuthClient(resolveAuthClientConfig()) }, ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
