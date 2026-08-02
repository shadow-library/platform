/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { resolveAuthClientConfig } from '@shadow-library/auth/module';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { DirectoryClient } from './directory.client';
import { PublicationAccessService } from './publication-access.service';
import { PublishRunner } from './publish-runner';
import { PublishingService } from './publishing.service';
import { ReaderPushClient } from './reader-push.client';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// The reader-push client injects an AuthClient built from the SDK's own config resolver — the same
// `AUTH_ISSUER`/`AUTH_APP_ID`/credential the guard's client uses, so it discovers the same
// registration and authenticates as the same client, but as a module-owned provider rather than a
// cross-module re-export (the framework imports a dynamic module once and resolves dependencies
// eagerly, which makes re-exporting the guard's exact instance order-dependent). No JobsModule import
// here — JobsModule imports THIS module for the publish executor, and the publishing controller lives
// in PipelineModule (the HTTP-wiring seam), keeping the module graph acyclic.
@Module({
  imports: [DatabaseModule],
  providers: [
    PublishingService,
    { token: AuthClient, useFactory: () => new AuthClient(resolveAuthClientConfig()) },
    ReaderPushClient,
    /** Shares the module-owned AuthClient, so the directory lookup authenticates as the same client the reader push does. */
    DirectoryClient,
    PublicationAccessService,
    PublishRunner,
  ],
  exports: [PublishingService, PublishRunner, PublicationAccessService],
})
export class PublishingModule {}
