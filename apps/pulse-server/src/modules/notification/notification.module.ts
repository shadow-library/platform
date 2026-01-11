/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { ConfigurationModule } from '@modules/configuration';
import { DatastoreModule } from '@modules/datastore';
import { TemplateModule } from '@modules/template';

import { NotificationProviderService } from './notification-provider.service';
import { NotificationService } from './notification.service';
import { DevNotificationProvider } from './providers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatastoreModule, TemplateModule, ConfigurationModule],
  providers: [DevNotificationProvider, NotificationService, NotificationProviderService],
  exports: [NotificationService],
})
export class NotificationModule {}
