/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';
import { AuditService } from '@server/modules/infrastructure/audit';
import { WebhookDelivery, WebhookSubscription } from '@server/modules/infrastructure/datastore';
import { WebhookDeliveryService, WebhookService } from '@server/modules/infrastructure/webhook';

import { AdminActor } from './admin-access.service';
import { AdminActionResponse } from './admin-user.dto';
import {
  CreatedWebhookResponse,
  CreateWebhookBody,
  RotatedWebhookSecretResponse,
  UpdateWebhookBody,
  WebhookDeliveriesQuery,
  WebhookDeliveriesResponse,
  WebhookDeliveryParams,
  WebhookIdParams,
  WebhookItem,
  WebhookListResponse,
} from './admin-webhook.dto';
import { ADMIN_PERMISSIONS } from './admin.constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Webhooks are platform-tier only (docs are silent on org-scoped subscriptions; recorded in
 * tasks.md): operators subscribe external systems to the audit event stream, so subscription
 * management sits behind `iam:webhooks:manage` with AAL2 on every mutation.
 */

@HttpController('/api/v1/admin/webhooks')
export class AdminWebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly webhookDeliveryService: WebhookDeliveryService,
    private readonly auditService: AuditService,
  ) {}

  private toItem(subscription: WebhookSubscription): WebhookItem {
    return {
      id: subscription.id.toString(),
      name: subscription.name,
      targetUrl: subscription.targetUrl,
      eventTypes: subscription.eventTypes,
      isActive: subscription.isActive,
      createdAt: subscription.createdAt.toISOString(),
    };
  }

  private toDeliveryItem(delivery: WebhookDelivery) {
    return {
      id: delivery.id.toString(),
      eventId: delivery.eventId,
      eventType: delivery.eventType,
      status: delivery.status,
      attemptCount: delivery.attemptCount,
      lastError: delivery.lastError ?? undefined,
      responseStatus: delivery.responseStatus ?? undefined,
      sentAt: delivery.sentAt?.toISOString(),
      createdAt: delivery.createdAt.toISOString(),
    };
  }

  private async record(actor: AdminActor, action: string, webhookId: string, detail?: Record<string, unknown>): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.session.userId.toString(),
      targetType: 'webhook_subscription',
      targetId: webhookId,
      detail: detail ?? null,
    });
  }

  @Get()
  @Auth({ permission: ADMIN_PERMISSIONS.webhooksManage })
  @RespondFor(200, WebhookListResponse)
  async listWebhooks(): Promise<WebhookListResponse> {
    const subscriptions = await this.webhookService.list();
    return { items: subscriptions.map(subscription => this.toItem(subscription)) };
  }

  @Post()
  @Auth({ permission: ADMIN_PERMISSIONS.webhooksManage, elevated: true })
  @RespondFor(201, CreatedWebhookResponse)
  async createWebhook(@Body() body: CreateWebhookBody): Promise<CreatedWebhookResponse> {
    const actor = Context.getActor();
    const { subscription, secret } = await this.webhookService.create({ name: body.name, targetUrl: body.targetUrl, eventTypes: body.eventTypes });
    await this.record(actor, 'webhook.created', subscription.id.toString(), { targetUrl: body.targetUrl });
    return { webhook: this.toItem(subscription), secret };
  }

  @Get('/:webhookId')
  @Auth({ permission: ADMIN_PERMISSIONS.webhooksManage })
  @RespondFor(200, WebhookItem)
  async getWebhook(@Params() params: WebhookIdParams): Promise<WebhookItem> {
    return this.toItem(await this.webhookService.getById(params.webhookId));
  }

  @Patch('/:webhookId')
  @Auth({ permission: ADMIN_PERMISSIONS.webhooksManage, elevated: true })
  @RespondFor(200, WebhookItem)
  async updateWebhook(@Params() params: WebhookIdParams, @Body() body: UpdateWebhookBody): Promise<WebhookItem> {
    const actor = Context.getActor();
    const subscription = await this.webhookService.update(params.webhookId, body);
    await this.record(actor, 'webhook.updated', params.webhookId.toString());
    return this.toItem(subscription);
  }

  @Post('/:webhookId/rotate-secret')
  @Auth({ permission: ADMIN_PERMISSIONS.webhooksManage, elevated: true })
  @HttpStatus(200)
  @RespondFor(200, RotatedWebhookSecretResponse)
  async rotateWebhookSecret(@Params() params: WebhookIdParams): Promise<RotatedWebhookSecretResponse> {
    const actor = Context.getActor();
    const { secret } = await this.webhookService.rotateSecret(params.webhookId);
    await this.record(actor, 'webhook.secret_rotated', params.webhookId.toString());
    return { secret };
  }

  @Delete('/:webhookId')
  @Auth({ permission: ADMIN_PERMISSIONS.webhooksManage, elevated: true })
  @RespondFor(200, AdminActionResponse)
  async deleteWebhook(@Params() params: WebhookIdParams): Promise<AdminActionResponse> {
    const actor = Context.getActor();
    await this.webhookService.remove(params.webhookId);
    await this.record(actor, 'webhook.deleted', params.webhookId.toString());
    return { success: true };
  }

  @Get('/:webhookId/deliveries')
  @Auth({ permission: ADMIN_PERMISSIONS.webhooksManage })
  @RespondFor(200, WebhookDeliveriesResponse)
  async listWebhookDeliveries(@Params() params: WebhookIdParams, @Query() query: WebhookDeliveriesQuery): Promise<WebhookDeliveriesResponse> {
    await this.webhookService.getById(params.webhookId);
    const deliveries = await this.webhookDeliveryService.listForSubscription(params.webhookId, query.status);
    return { items: deliveries.map(delivery => this.toDeliveryItem(delivery)) };
  }

  @Post('/:webhookId/deliveries/:deliveryId/redeliver')
  @Auth({ permission: ADMIN_PERMISSIONS.webhooksManage, elevated: true })
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async redeliverWebhookDelivery(@Params() params: WebhookDeliveryParams): Promise<AdminActionResponse> {
    const actor = Context.getActor();
    await this.webhookDeliveryService.redeliver(params.webhookId, params.deliveryId);
    await this.record(actor, 'webhook.redelivery_requested', params.webhookId.toString(), { deliveryId: params.deliveryId.toString() });
    return { success: true };
  }
}
