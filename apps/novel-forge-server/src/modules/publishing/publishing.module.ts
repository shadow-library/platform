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

// JobsModule imports this module for the publish executor, so the controller lives in PublishingHttpModule to keep the graph acyclic.
// The AuthClient is module-owned rather than re-exported from the guard: re-exporting a dynamic module's instance is order-dependent.
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
