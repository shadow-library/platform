import assert from 'node:assert';

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import validator from 'validator';
import { Injectable } from '@shadow-library/app';
import { type AppErrorObject, Logger, OffsetPagination, OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { DEFAULT_LOCALE, type ResolvedTemplate, resolvePayload, TemplateResolverService } from '@modules/template';
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { Notification, PrimaryDatabase, schema, Template } from '@server/database';

import { NotificationJobRunner } from './notification-job.runner';

export enum NotificationStatus {
  ACCEPTED = 'ACCEPTED',
  PARTIAL_ACCEPTED = 'PARTIAL_ACCEPTED',
  FAILED = 'FAILED',
}

export enum ChannelNotificationStatus {
  QUEUED = 'QUEUED',
  FAILED = 'FAILED',
}

export interface Recipients {
  email?: string;
  phone?: string;
  push?: string;
}

export interface SendNotificationConfig {
  templateKey: string;
  recipients: Recipients;
  payload?: Record<string, any>;
  locale?: string;
  service?: string;
}

export interface ChannelSendResult {
  channel: Notification.Channel;
  status: ChannelNotificationStatus;
  locale?: string;
  jobId?: string;
  /** Already the wire shape (`AppError.toResponse()`): the response-transform pipeline `structuredClone`s the payload, which strips custom properties off `Error` instances. */
  error?: AppErrorObject;
}

export interface SendNotificationResult {
  status: NotificationStatus;
  channelResults: ChannelSendResult[];
}

export interface ListMessagesQuery extends Partial<OffsetPagination> {
  channel?: Notification.Channel;
  recipient?: string;
}

export interface NotificationMessage {
  id: bigint;
  channel: Notification.Channel;
  /** Masked at the source: the log exposes delivery metadata only, never the raw recipient or rendered content (OTP codes, reset links). */
  recipient: string;
  locale: string;
  templateKey: string;
  messageType: Template.MessageType;
  createdAt: Date;
}

const RECIPIENT_VALIDATION_ERROR_CODES: Record<Notification.Channel, AppErrorCode> = {
  SMS: AppErrorCode.NTF_001,
  EMAIL: AppErrorCode.NTF_002,
  PUSH: AppErrorCode.NTF_003,
};

@Injectable()
export class NotificationService {
  private readonly logger = Logger.getLogger(APP_NAME, NotificationService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly templateResolver: TemplateResolverService,
    private readonly jobRunner: NotificationJobRunner,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  private getValidatedRecipient(channel: Notification.Channel, recipients: Recipients): string | null {
    switch (channel) {
      case 'SMS': {
        if (!recipients.phone) return null;
        if (!validator.isMobilePhone(recipients.phone)) return null;
        return recipients.phone;
      }

      case 'EMAIL': {
        if (!recipients.email) return null;
        if (!validator.isEmail(recipients.email)) return null;
        return recipients.email;
      }

      case 'PUSH': {
        if (!recipients.push) return null;
        return recipients.push;
      }

      default:
        return null;
    }
  }

  private async sendChannelNotification(
    channel: Notification.Channel,
    resolved: ResolvedTemplate,
    payload: Record<string, unknown>,
    config: SendNotificationConfig,
  ): Promise<ChannelSendResult> {
    const recipient = this.getValidatedRecipient(channel, config.recipients);
    if (!recipient) {
      const errorCode = RECIPIENT_VALIDATION_ERROR_CODES[channel];
      return { channel, status: ChannelNotificationStatus.FAILED, error: errorCode.create().toResponse() };
    }

    if (!resolved.publishedVersion) return { channel, status: ChannelNotificationStatus.FAILED, error: AppErrorCode.TPL_VER_003.create().toResponse() };

    const content = await this.templateResolver.findContent(resolved.publishedVersion.id, channel, config.locale ?? DEFAULT_LOCALE);
    if (!content) return { channel, status: ChannelNotificationStatus.FAILED, error: AppErrorCode.TPL_CNT_003.create().toResponse() };

    const admission = this.jobRunner.admit();
    const [notification] = await this.db
      .insert(schema.notificationJobs)
      .values({
        templateId: resolved.template.id,
        templateVersionId: resolved.publishedVersion.id,
        channel,
        service: config.service,
        locale: content.locale,
        priority: resolved.template.priority,
        recipient,
        payload,
        ...admission,
      })
      .returning();
    assert(notification, 'Failed to create notification job');

    const logData = { channel, recipient: utils.string.mask(recipient), templateKey: config.templateKey, locale: content.locale };
    this.logger.info(`Created notification job - ${notification.id}`, logData);
    this.logger.debug('Notification job details', { notification });
    this.jobRunner.start(notification, admission);
    return { jobId: notification.id, channel, status: ChannelNotificationStatus.QUEUED, locale: content.locale };
  }

  async send(config: SendNotificationConfig): Promise<SendNotificationResult> {
    const resolved = await this.templateResolver.resolveForSend(config.templateKey);
    return this.sendResolved(resolved, config);
  }

  async sendResolved(resolved: ResolvedTemplate, config: SendNotificationConfig): Promise<SendNotificationResult> {
    if (resolved.enabledChannels.length === 0) return { status: NotificationStatus.ACCEPTED, channelResults: [] };

    const payload = resolvePayload(resolved.template.variableSchema, config.payload ?? {});
    const promises = resolved.enabledChannels.map(channel => this.sendChannelNotification(channel, resolved, payload, config));
    const results = await Promise.all(promises);

    let status = NotificationStatus.FAILED;
    const successCount = results.reduce((count, r) => (r.status === ChannelNotificationStatus.QUEUED ? count + 1 : count), 0);
    if (successCount === results.length) status = NotificationStatus.ACCEPTED;
    else if (successCount > 0) status = NotificationStatus.PARTIAL_ACCEPTED;

    return { status, channelResults: results };
  }

  async listMessages(filter: ListMessagesQuery = {}): Promise<OffsetPaginationResult<NotificationMessage>> {
    const query = utils.pagination.normalise(filter, { mode: 'offset', defaults: { limit: 20, offset: 0, sortBy: 'createdAt', sortOrder: 'desc' } });
    const sortOrder = query.sortOrder === 'asc' ? asc : desc;

    const whereConditions: ReturnType<typeof eq>[] = [];
    if (filter.channel) whereConditions.push(eq(schema.notificationJobs.channel, filter.channel));
    if (filter.recipient) whereConditions.push(eq(schema.notificationJobs.recipient, filter.recipient));
    const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const baseQuery = this.db
      .select({
        id: schema.notificationMessages.id,
        createdAt: schema.notificationMessages.createdAt,
        recipient: schema.notificationJobs.recipient,
        channel: schema.notificationJobs.channel,
        locale: schema.notificationJobs.locale,
        templateKey: schema.templates.templateKey,
        messageType: schema.templates.messageType,
      })
      .from(schema.notificationMessages)
      .innerJoin(schema.notificationJobs, eq(schema.notificationMessages.notificationJobId, schema.notificationJobs.id))
      .innerJoin(schema.templates, eq(schema.notificationJobs.templateId, schema.templates.id))
      .where(where);

    const [countResult, rows] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(schema.notificationMessages)
        .innerJoin(schema.notificationJobs, eq(schema.notificationMessages.notificationJobId, schema.notificationJobs.id))
        .where(where),
      baseQuery.limit(query.limit).offset(query.offset).orderBy(sortOrder(schema.notificationMessages.createdAt)),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    const items = rows.map<NotificationMessage>(row => ({ ...row, recipient: utils.string.mask(row.recipient) }));
    return utils.pagination.createResult(query, items, total);
  }
}
