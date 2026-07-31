/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { ConfigurationModule } from '@modules/configuration';
import { TemplateModule } from '@modules/template';

import { NotificationProviderService } from './notification-provider.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { DevNotificationProvider } from './providers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, TemplateModule, ConfigurationModule],
  controllers: [NotificationController],
  providers: [DevNotificationProvider, NotificationService, NotificationProviderService],
  exports: [NotificationService],
})
export class NotificationModule {}
