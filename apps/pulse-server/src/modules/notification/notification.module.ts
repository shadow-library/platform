import { Resend } from 'resend';
import { Module } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { DatabaseModule } from '@shadow-library/modules';

import { ConfigurationModule } from '@modules/configuration';
import { TemplateModule } from '@modules/template';

import { NotificationProviderService } from './notification-provider.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { DevNotificationProvider, RESEND_CLIENT, ResendNotificationProvider } from './providers';

@Module({
  imports: [DatabaseModule, TemplateModule, ConfigurationModule],
  controllers: [NotificationController],
  providers: [
    DevNotificationProvider,
    ResendNotificationProvider,
    {
      token: RESEND_CLIENT,
      useFactory: () => {
        const apiKey = Config.get('resend.api.key');
        return { client: apiKey ? new Resend(apiKey) : null };
      },
    },
    NotificationService,
    NotificationProviderService,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
