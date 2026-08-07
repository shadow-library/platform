import { Module } from '@shadow-library/app';

import { KeyModule } from '@server/modules/auth/keys';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookTargetGuard } from './webhook-target.guard';
import { WebhookService } from './webhook.service';

@Module({
  imports: [DatabaseModule, KeyModule],
  providers: [WebhookService, WebhookDeliveryService, WebhookTargetGuard],
  exports: [WebhookService, WebhookDeliveryService, WebhookTargetGuard],
})
export class WebhookModule {}
