/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Injectable } from '@shadow-library/app';
import { AppError, Logger, OffsetPagination, OffsetPaginationResult, utils } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import parsePhoneNumber from 'libphonenumber-js';
import validator from 'validator';

/**
 * Importing user defined packages
 */
import { SenderEndpointService, SenderRoutingRuleService } from '@modules/configuration';
import { Configuration, Notification, PrimaryDatabase, Template, schema } from '@modules/database';
import { LinkedTemplateVariant, TemplateSettingsService, TemplateVariantService } from '@modules/template';
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { NotificationProviderService } from './notification-provider.service';
import { NotificationOpResult } from './providers';

/**
 * Defining types
 */

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

export interface TemplateConfig {
  channel: Notification.Channel;
  templateVariant: Template.Variant | null;
}

export interface ChannelSendResult {
  channel: Notification.Channel;
  status: ChannelNotificationStatus;
  locale?: string;
  jobId?: string;
  error?: ServerError;
}

export interface SendNotificationResult {
  status: NotificationStatus;
  channelResults: ChannelSendResult[];
}

export interface ListMessagesQuery extends Partial<OffsetPagination> {
  channel?: Notification.Channel;
  recipient?: string;
}

export type NotificationMessage = Notification.Message & {
  channel: Notification.Channel;
  recipient: string;
  locale: string;
  payload?: unknown;
  templateKey: string;
  messageType: Template.MessageType;
};

/**
 * Declaring the constants
 */
const MAX_ATTEMPTS = 5;
const DEFAULT_LOCALE = 'en-ZZ';
const BASE_DELAY_SECONDS: Record<Template.MessageType, number> = { OTP: 2, TRANSACTIONAL: 30, PROMOTIONAL: 5 * 60 };
const MAX_DELAY_SECONDS: Record<Template.MessageType, number> = { OTP: 30, TRANSACTIONAL: 30 * 60, PROMOTIONAL: 6 * 60 * 60 };
const PRIORITY_MODIFIER: Record<Notification.Priority, number> = { LOW: 2, MEDIUM: 1, HIGH: 0.5 };
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
    private readonly databaseService: DatabaseService,
    private readonly notificationProviderService: NotificationProviderService,

    private readonly templateVariantService: TemplateVariantService,
    private readonly templateSettingsService: TemplateSettingsService,
    private readonly senderRoutingRuleService: SenderRoutingRuleService,
    private readonly senderEndpointService: SenderEndpointService,
  ) {
    this.db = this.databaseService.getPostgresClient();
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

  private async resolveTemplateVariant(templateKey: string, channel: Notification.Channel, locale: string = DEFAULT_LOCALE): Promise<LinkedTemplateVariant | null> {
    const localTemplate = await this.templateVariantService.getTemplateVariantByKey(templateKey, channel, locale);
    if (localTemplate && localTemplate.isActive) return localTemplate;
    if (locale === DEFAULT_LOCALE) return null;

    const fallbackTemplateVariant = await this.templateVariantService.getTemplateVariantByKey(templateKey, channel, DEFAULT_LOCALE);
    if (fallbackTemplateVariant && fallbackTemplateVariant.isActive) return fallbackTemplateVariant;
    return null;
  }

  private getRegion(notificationJob: Notification.Job): string {
    if (notificationJob.channel !== 'SMS') return 'ZZ';
    const phoneNumber = parsePhoneNumber(notificationJob.recipient);
    return phoneNumber?.country ?? 'ZZ';
  }

  private getNextAttemptAt(messageType: Template.MessageType, priority: Notification.Priority, attempt: number): Date {
    const baseDelay = BASE_DELAY_SECONDS[messageType];
    const maxDelay = MAX_DELAY_SECONDS[messageType];
    const priorityModifier = PRIORITY_MODIFIER[priority];
    const delaySeconds = Math.min(baseDelay * Math.pow(2, attempt) * priorityModifier, maxDelay);
    const jitter = Math.floor(Math.random() * 0.25 * delaySeconds);
    const totalDelaySeconds = delaySeconds + jitter;
    return new Date(Date.now() + totalDelaySeconds * 1000);
  }

  private async executeNotificationJob(notificationJob: Notification.Job, templateVariant?: LinkedTemplateVariant): Promise<void> {
    const attempt = notificationJob.attempt + 1;
    const recipient = utils.string.mask(notificationJob.recipient);
    const jobLogData: Record<string, any> = { jobId: notificationJob.id, ...utils.object.pickKeys(notificationJob, ['channel', 'locale', 'createdAt']), recipient, attempt };
    try {
      if (!templateVariant) {
        const template = await this.templateVariantService.getTemplateVariant(notificationJob.templateGroupId, notificationJob.channel, notificationJob.locale);
        assert(template, 'Template variant not found for notification job');
        templateVariant = template;
      }
      this.logger.debug(`Template variant resolved for notification job - ${notificationJob.id}`, { templateVariantId: templateVariant.id });

      const region = this.getRegion(notificationJob);
      const service = notificationJob.service ?? 'default';
      const templateGroup = templateVariant.getParent();
      Object.assign(jobLogData, { templateKey: templateGroup.templateKey, service, region });
      this.logger.debug('Resolved service, region and messageType for notification job', jobLogData);

      const routingRule = await this.senderRoutingRuleService.resolveSenderRoutingRule(service, region, templateGroup.messageType);
      const senderEndpoints = await this.senderEndpointService.getSenderEndpointsByChannel(routingRule.senderProfileId, notificationJob.channel);
      if (senderEndpoints.length === 0) throw new ServerError(AppErrorCode.SND_EP_001);
      Object.assign(jobLogData, { routingRuleId: routingRule.id, senderProfileId: routingRule.senderProfileId, senderEndpointCount: senderEndpoints.length });
      this.logger.debug(`Resolved sender profile for notification job - ${notificationJob.id}`, jobLogData);

      const senderEndpointIndex = notificationJob.attempt % senderEndpoints.length;
      const senderEndpoint = senderEndpoints[senderEndpointIndex] as Configuration.SenderEndpoint;
      Object.assign(jobLogData, { senderEndpointId: senderEndpoint.id });
      this.logger.debug(`Resolved sender endpoint for notification job - ${notificationJob.id}`, jobLogData);

      let result: NotificationOpResult;
      if (notificationJob.channel === 'SMS') result = await this.notificationProviderService.sendSMS(notificationJob, senderEndpoint, templateVariant);
      else if (notificationJob.channel === 'EMAIL') result = await this.notificationProviderService.sendEmail(notificationJob, senderEndpoint, templateVariant);
      else result = await this.notificationProviderService.sendPushNotification(notificationJob, senderEndpoint, templateVariant);

      let status: Notification.Status = result.success ? 'SENT' : 'FAILED';
      if (!result.success && attempt >= MAX_ATTEMPTS) status = 'PERMANENTLY_FAILED';
      const updateResult = await this.db
        .update(schema.notificationJobs)
        .set({
          status,
          attempt: sql`${schema.notificationJobs.attempt} + 1`,
          lastAttemptedAt: new Date(),
          nextAttemptAt: result.success ? null : this.getNextAttemptAt(templateGroup.messageType, notificationJob.priority, notificationJob.attempt + 1),
        })
        .where(eq(schema.notificationJobs.id, notificationJob.id))
        .returning({ id: schema.notificationJobs.id, status: schema.notificationJobs.status });
      this.logger.info(`Executed notification job - ${notificationJob.id}`, { ...jobLogData, result, updateResult, status });
    } catch (error) {
      const result = await this.db
        .update(schema.notificationJobs)
        .set({
          status: 'PERMANENTLY_FAILED',
          attempt: sql`${schema.notificationJobs.attempt} + 1`,
          lastError: error instanceof AppError ? error.getCode() : 'UNKNOWN_ERROR',
          lastAttemptedAt: new Date(),
        })
        .where(eq(schema.notificationJobs.id, notificationJob.id))
        .returning({ id: schema.notificationJobs.id, status: schema.notificationJobs.status });
      this.logger.error(`Error executing notification job - ${notificationJob.id}`, error);
      this.logger.error(`Failed to execute notification job - ${notificationJob.id}`, { ...jobLogData, result });
    }
  }

  private async sendChannelNotification(channel: Notification.Channel, config: SendNotificationConfig): Promise<ChannelSendResult> {
    const recipient = this.getValidatedRecipient(channel, config.recipients);
    if (!recipient) {
      const errorCode = RECIPIENT_VALIDATION_ERROR_CODES[channel];
      return { channel, status: ChannelNotificationStatus.FAILED, error: new ServerError(errorCode) };
    }

    const templateVariant = await this.resolveTemplateVariant(config.templateKey, channel, config.locale);
    if (!templateVariant) return { channel, status: ChannelNotificationStatus.FAILED, error: new ServerError(AppErrorCode.TPL_VRT_003) };

    const templateGroup = templateVariant.getParent();
    const [notification] = await this.db
      .insert(schema.notificationJobs)
      .values({
        templateGroupId: templateVariant.templateGroupId,
        channel,
        service: config.service,
        locale: templateVariant.locale,
        priority: templateGroup.priority,
        recipient,
        payload: config.payload,
        status: 'PENDING',
      })
      .returning();
    assert(notification, 'Failed to create notification job');

    const logData = { channel, recipient: utils.string.mask(recipient), templateKey: config.templateKey, locale: templateVariant.locale };
    this.logger.info(`Created notification job - ${notification.id}`, logData);
    this.logger.debug('Notification job details', { notification });
    this.executeNotificationJob(notification, templateVariant);
    return { jobId: notification.id, channel, status: ChannelNotificationStatus.QUEUED, locale: templateVariant.locale };
  }

  async send(config: SendNotificationConfig): Promise<SendNotificationResult> {
    const templateSettings = await this.templateSettingsService.getEnabledChannels(config.templateKey);
    const promises = templateSettings.map(setting => this.sendChannelNotification(setting.channel, config));
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
      .select()
      .from(schema.notificationMessages)
      .innerJoin(schema.notificationJobs, eq(schema.notificationMessages.notificationJobId, schema.notificationJobs.id))
      .innerJoin(schema.templateGroups, eq(schema.notificationJobs.templateGroupId, schema.templateGroups.id))
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
    const items = rows.map(row => ({
      ...row.notification_messages,
      ...utils.object.pickKeys(row.notification_jobs, ['channel', 'recipient', 'locale', 'payload']),
      ...utils.object.pickKeys(row.template_groups, ['templateKey', 'messageType']),
    }));
    return utils.pagination.createResult(query, items, total);
  }
}
