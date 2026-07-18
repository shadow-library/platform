/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { KeyModule } from '@server/modules/auth/keys';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { NotificationTokenService } from './notification-token.service';
import { NotificationClient } from './notification.client';
import { NotificationService } from './notification.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  /** KeyModule signs the outbound service token; it is already part of the worker graph via TokenModule. */
  imports: [DatabaseModule, KeyModule],
  providers: [NotificationTokenService, NotificationClient, NotificationService],
  exports: [NotificationService, NotificationClient, NotificationTokenService],
})
export class NotificationModule {}
