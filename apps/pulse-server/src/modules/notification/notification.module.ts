import { Resend } from 'resend';
import { Module } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

import { ConfigurationModule } from '@modules/configuration';
import { TemplateModule } from '@modules/template';

import { ConsoleSendLimiter } from './console-send-limiter.service';
import { ConsoleSendService } from './console-send.service';
import { NotificationProviderService } from './notification-provider.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { DevNotificationProvider, RESEND_CLIENT, ResendNotificationProvider } from './providers';

@Module({
  imports: [DatabaseModule, FastifyModule, TemplateModule, ConfigurationModule],
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
    ConsoleSendLimiter,
    ConsoleSendService,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
