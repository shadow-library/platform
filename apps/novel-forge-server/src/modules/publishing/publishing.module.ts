import { Module } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { resolveAuthClientConfig } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

import { PublicationAccessService } from './publication-access.service';
import { PublishRunner } from './publish-runner';
import { PublishingService } from './publishing.service';
import { ReaderPushClient } from './reader-push.client';
import { WikiPublishingService } from './wiki-publishing.service';

// The reader-push client injects an AuthClient built from the SDK's own config resolver — the same
// `AUTH_ISSUER`/`AUTH_APP_ID`/credential the guard's client uses, so it discovers the same
// registration and authenticates as the same client, but as a module-owned provider rather than a
// cross-module re-export (the framework imports a dynamic module once and resolves dependencies
// eagerly, which makes re-exporting the guard's exact instance order-dependent). No JobsModule import
// here — JobsModule imports THIS module for the publish executor, and the publishing controller lives
// in PipelineModule (the HTTP-wiring seam), keeping the module graph acyclic.
@Module({
  // FastifyModule supplies the ContextService the attribution gate reads the request principal from.
  imports: [DatabaseModule, FastifyModule],
  providers: [
    PublishingService,
    WikiPublishingService,
    { token: AuthClient, useFactory: () => new AuthClient(resolveAuthClientConfig()) },
    ReaderPushClient,
    PublicationAccessService,
    PublishRunner,
  ],
  exports: [PublishingService, WikiPublishingService, PublishRunner, PublicationAccessService],
})
export class PublishingModule {}
