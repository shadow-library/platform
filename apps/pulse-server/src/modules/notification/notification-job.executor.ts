import assert from 'node:assert';

import { and, eq, lt, type SQL, sql } from 'drizzle-orm';
import { type PgUpdateSetSource } from 'drizzle-orm/pg-core';
import parsePhoneNumber from 'libphonenumber-js';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { SenderEndpointService, SenderRoutingRuleService } from '@modules/configuration';
import { type RenderBundle, TemplateResolverService } from '@modules/template';
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { Configuration, Notification, PrimaryDatabase, schema, Template } from '@server/database';

import { NotificationProviderService } from './notification-provider.service';
import { NotificationOpResult } from './providers';

type JobOutcome = PgUpdateSetSource<typeof schema.notificationJobs>;

/** A claim must outlive the slowest execution, or a second replica re-sends a job that is still running: the provider bound plus database and render time. */
export const NOTIFICATION_JOB_LEASE_MS = 60_000;

const PROVIDER_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 5;
const BASE_DELAY_SECONDS: Record<Template.MessageType, number> = { OTP: 2, TRANSACTIONAL: 30, PROMOTIONAL: 5 * 60 };
const MAX_DELAY_SECONDS: Record<Template.MessageType, number> = { OTP: 30, TRANSACTIONAL: 30 * 60, PROMOTIONAL: 6 * 60 * 60 };
const PRIORITY_MODIFIER: Record<Notification.Priority, number> = { LOW: 2, MEDIUM: 1, HIGH: 0.5 };
/** Resend only dedupes a repeated idempotency key for 24 hours, and a late OTP is useless, so older jobs are expired instead of sent. */
const MAX_JOB_AGE_SECONDS: Record<Template.MessageType, number> = { OTP: 10 * 60, TRANSACTIONAL: 24 * 60 * 60, PROMOTIONAL: 24 * 60 * 60 };

@Injectable()
export class NotificationJobExecutor {
  private readonly logger = Logger.getLogger(APP_NAME, NotificationJobExecutor.name);
  private readonly db: PrimaryDatabase;
  private readonly providerTimeoutMs = PROVIDER_TIMEOUT_MS;

  constructor(
    databaseService: DatabaseService,
    private readonly notificationProviderService: NotificationProviderService,
    private readonly templateResolver: TemplateResolverService,
    private readonly senderRoutingRuleService: SenderRoutingRuleService,
    private readonly senderEndpointService: SenderEndpointService,
  ) {
    this.db = databaseService.getPostgresClient();
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

  private getJobStatus(result: NotificationOpResult, attempt: number): Notification.Status {
    if (result.success) return 'SENT';
    return !result.retriable || attempt >= MAX_ATTEMPTS ? 'PERMANENTLY_FAILED' : 'FAILED';
  }

  private dispatch(notificationJob: Notification.Job, senderEndpoint: Configuration.SenderEndpoint, bundle: RenderBundle): Promise<NotificationOpResult> {
    if (notificationJob.channel === 'SMS') return this.notificationProviderService.sendSMS(notificationJob, senderEndpoint, bundle);
    if (notificationJob.channel === 'EMAIL') return this.notificationProviderService.sendEmail(notificationJob, senderEndpoint, bundle);
    return this.notificationProviderService.sendPushNotification(notificationJob, senderEndpoint, bundle);
  }

  /** The provider SDKs take no abort signal, so a timed-out call keeps running and may still deliver; only Resend dedupes the retry, by job id. */
  private async deliver(notificationJob: Notification.Job, senderEndpoint: Configuration.SenderEndpoint, bundle: RenderBundle): Promise<NotificationOpResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<NotificationOpResult>(resolve => {
      timer = setTimeout(() => {
        const error = new Error(`Provider did not answer within ${this.providerTimeoutMs}ms`);
        error.name = 'PROVIDER_TIMEOUT';
        resolve({ success: false, retriable: true, error });
      }, this.providerTimeoutMs);
    });

    try {
      return await Promise.race([this.dispatch(notificationJob, senderEndpoint, bundle), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Fenced on the lease this process wrote: Bun SQL decodes zone-less timestamps in the process time zone, so a read-back lease only matches under TZ=UTC. */
  private heldBy(notificationJob: Notification.Job, lease: Date): SQL | undefined {
    const jobs = schema.notificationJobs;
    return and(eq(jobs.id, notificationJob.id), eq(jobs.status, 'PROCESSING'), eq(jobs.nextAttemptAt, lease));
  }

  private async settle(notificationJob: Notification.Job, lease: Date, outcome: JobOutcome): Promise<boolean> {
    const rows = await this.db.update(schema.notificationJobs).set(outcome).where(this.heldBy(notificationJob, lease)).returning({ id: schema.notificationJobs.id });
    if (rows.length === 0) this.logger.warn(`Notification job lease was lost before its outcome was recorded - ${notificationJob.id}`, { jobId: notificationJob.id, outcome });
    return rows.length > 0;
  }

  /** `created_at` is written by the database's `now()`, so its age is judged there rather than from a decoded, time-zone-shifted value. */
  private async expireIfStale(notificationJob: Notification.Job, lease: Date, messageType: Template.MessageType): Promise<boolean> {
    const jobs = schema.notificationJobs;
    const stale = lt(jobs.createdAt, sql`now() - make_interval(secs => ${MAX_JOB_AGE_SECONDS[messageType]})`);
    const rows = await this.db
      .update(jobs)
      .set({ status: 'PERMANENTLY_FAILED', lastError: 'JOB_EXPIRED', nextAttemptAt: null })
      .where(and(this.heldBy(notificationJob, lease), stale))
      .returning({ id: jobs.id });
    return rows.length > 0;
  }

  /** A retry renders the pinned version with the current layout and partials and may rotate to another sender endpoint, so it can differ from the first send. */
  async execute(notificationJob: Notification.Job, lease: Date): Promise<void> {
    assert(notificationJob.status === 'PROCESSING', 'Notification job executed without a claim');
    const attempt = notificationJob.attempt + 1;
    const recipient = utils.string.mask(notificationJob.recipient);
    const jobLogData: Record<string, any> = { jobId: notificationJob.id, ...utils.object.pickKeys(notificationJob, ['channel', 'locale', 'createdAt']), recipient, attempt };
    try {
      const template = await this.db.query.templates.findFirst({ where: eq(schema.templates.id, notificationJob.templateId) });
      assert(template, 'Template not found for notification job');
      if (await this.expireIfStale(notificationJob, lease, template.messageType)) {
        this.logger.warn(`Expired notification job without sending - ${notificationJob.id}`, { ...jobLogData, templateKey: template.templateKey });
        return;
      }

      const bundle = await this.templateResolver.loadRenderBundle(notificationJob.templateVersionId, notificationJob.channel, notificationJob.locale);
      assert(bundle, 'Render bundle not found for notification job');

      const region = this.getRegion(notificationJob);
      const service = notificationJob.service ?? 'default';
      Object.assign(jobLogData, { templateKey: template.templateKey, service, region });
      this.logger.debug('Resolved service, region and messageType for notification job', jobLogData);

      const routingRule = await this.senderRoutingRuleService.resolveSenderRoutingRule(service, region, template.messageType);
      const senderEndpoints = await this.senderEndpointService.getSenderEndpointsByChannel(routingRule.senderProfileId, notificationJob.channel);
      if (senderEndpoints.length === 0) throw AppErrorCode.SND_EP_001.create();
      Object.assign(jobLogData, { routingRuleId: routingRule.id, senderProfileId: routingRule.senderProfileId, senderEndpointCount: senderEndpoints.length });
      this.logger.debug(`Resolved sender profile for notification job - ${notificationJob.id}`, jobLogData);

      const senderEndpointIndex = notificationJob.attempt % senderEndpoints.length;
      const senderEndpoint = senderEndpoints[senderEndpointIndex] as Configuration.SenderEndpoint;
      Object.assign(jobLogData, { senderEndpointId: senderEndpoint.id });
      this.logger.debug(`Resolved sender endpoint for notification job - ${notificationJob.id}`, jobLogData);

      const result = await this.deliver(notificationJob, senderEndpoint, bundle);
      const status = this.getJobStatus(result, attempt);
      const settled = await this.settle(notificationJob, lease, {
        status,
        attempt: sql`${schema.notificationJobs.attempt} + 1`,
        lastError: result.success ? null : result.error.name,
        lastAttemptedAt: new Date(),
        nextAttemptAt: status === 'FAILED' ? this.getNextAttemptAt(template.messageType, notificationJob.priority, attempt) : null,
      });
      this.logger.info(`Executed notification job - ${notificationJob.id}`, { ...jobLogData, result, status, settled });
    } catch (error) {
      this.logger.error(`Error executing notification job - ${notificationJob.id}`, error);
      const settled = await this.settle(notificationJob, lease, {
        status: 'PERMANENTLY_FAILED',
        attempt: sql`${schema.notificationJobs.attempt} + 1`,
        lastError: error instanceof AppError ? error.code : 'UNKNOWN_ERROR',
        lastAttemptedAt: new Date(),
        nextAttemptAt: null,
      });
      this.logger.error(`Failed to execute notification job - ${notificationJob.id}`, { ...jobLogData, settled });
    }
  }
}
