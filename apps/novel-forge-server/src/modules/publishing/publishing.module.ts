/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { PublishRunner } from './publish-runner';
import { PublishingService } from './publishing.service';
import { ReaderPushClient } from './reader-push.client';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// No JobsModule import here — JobsModule imports THIS module for the publish executor, and the
// publishing controller lives in PipelineModule (the HTTP-wiring seam), keeping the module graph acyclic.
@Module({
  imports: [DatabaseModule],
  providers: [PublishingService, ReaderPushClient, PublishRunner],
  exports: [PublishingService, PublishRunner],
})
export class PublishingModule {}
