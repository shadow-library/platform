/**
 * Importing npm packages
 */
import { type FastifyRequest } from 'fastify';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, Req, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AuditService } from '@server/modules/infrastructure/audit';
import { WebhookDelivery, WebhookSubscription } from '@server/modules/infrastructure/datastore';
import { WebhookDeliveryService, WebhookService } from '@server/modules/infrastructure/webhook';

import { AdminAccessService, AdminActor } from './admin-access.service';
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
    private readonly access: AdminAccessService,
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
  @RespondFor(200, WebhookListResponse)
  async list(@Req() request: FastifyRequest): Promise<WebhookListResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.webhooksManage);
    const subscriptions = await this.webhookService.list();
    return { items: subscriptions.map(subscription => this.toItem(subscription)) };
  }

  @Post()
  @RespondFor(201, CreatedWebhookResponse)
  async create(@Body() body: CreateWebhookBody, @Req() request: FastifyRequest): Promise<CreatedWebhookResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.webhooksManage);
    const { subscription, secret } = await this.webhookService.create({ name: body.name, targetUrl: body.targetUrl, eventTypes: body.eventTypes });
    await this.record(actor, 'webhook.created', subscription.id.toString(), { targetUrl: body.targetUrl });
    return { webhook: this.toItem(subscription), secret };
  }

  @Get('/:webhookId')
  @RespondFor(200, WebhookItem)
  async get(@Params() params: WebhookIdParams, @Req() request: FastifyRequest): Promise<WebhookItem> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.webhooksManage);
    return this.toItem(await this.webhookService.getById(BigInt(params.webhookId)));
  }

  @Patch('/:webhookId')
  @RespondFor(200, WebhookItem)
  async update(@Params() params: WebhookIdParams, @Body() body: UpdateWebhookBody, @Req() request: FastifyRequest): Promise<WebhookItem> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.webhooksManage);
    const subscription = await this.webhookService.update(BigInt(params.webhookId), body);
    await this.record(actor, 'webhook.updated', params.webhookId);
    return this.toItem(subscription);
  }

  @Post('/:webhookId/rotate-secret')
  @HttpStatus(200)
  @RespondFor(200, RotatedWebhookSecretResponse)
  async rotateSecret(@Params() params: WebhookIdParams, @Req() request: FastifyRequest): Promise<RotatedWebhookSecretResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.webhooksManage);
    const { secret } = await this.webhookService.rotateSecret(BigInt(params.webhookId));
    await this.record(actor, 'webhook.secret_rotated', params.webhookId);
    return { secret };
  }

  @Delete('/:webhookId')
  @RespondFor(200, AdminActionResponse)
  async remove(@Params() params: WebhookIdParams, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.webhooksManage);
    await this.webhookService.remove(BigInt(params.webhookId));
    await this.record(actor, 'webhook.deleted', params.webhookId);
    return { success: true };
  }

  @Get('/:webhookId/deliveries')
  @RespondFor(200, WebhookDeliveriesResponse)
  async deliveries(@Params() params: WebhookIdParams, @Query() query: WebhookDeliveriesQuery, @Req() request: FastifyRequest): Promise<WebhookDeliveriesResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.webhooksManage);
    await this.webhookService.getById(BigInt(params.webhookId));
    const deliveries = await this.webhookDeliveryService.listForSubscription(BigInt(params.webhookId), query.status);
    return { items: deliveries.map(delivery => this.toDeliveryItem(delivery)) };
  }

  @Post('/:webhookId/deliveries/:deliveryId/redeliver')
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async redeliver(@Params() params: WebhookDeliveryParams, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.webhooksManage);
    await this.webhookDeliveryService.redeliver(BigInt(params.webhookId), BigInt(params.deliveryId));
    await this.record(actor, 'webhook.redelivery_requested', params.webhookId, { deliveryId: params.deliveryId });
    return { success: true };
  }
}
