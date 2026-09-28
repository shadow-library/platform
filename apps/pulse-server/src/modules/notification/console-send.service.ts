import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

import { TemplateResolverService } from '@modules/template';
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { ConsoleSendLimiter } from './console-send-limiter.service';
import { isConsoleSendable, maskRecipients, withoutRenderGlobals } from './console-send.policy';
import { NotificationService, type SendNotificationConfig, type SendNotificationResult } from './notification.service';

/** Pulse has no audit table, so the info line written per send is the console's audit trail. */
@Injectable()
export class ConsoleSendService {
  private readonly logger = Logger.getLogger(APP_NAME, ConsoleSendService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly templateResolver: TemplateResolverService,
    private readonly limiter: ConsoleSendLimiter,
    private readonly context: ContextService,
  ) {}

  async send(config: SendNotificationConfig): Promise<SendNotificationResult> {
    const actor = this.context.getAuthPrincipal();
    const attempt = { actor: actor.sub, organisation: actor.org, templateKey: config.templateKey, service: config.service, locale: config.locale };

    const admission = this.limiter.admit(actor.sub);
    if (!admission.admitted) {
      this.logger.warn('Refused a console send over the per-actor limit', { ...attempt, retryAfterSeconds: admission.retryAfterSeconds });
      this.context.getResponse().header('retry-after', String(admission.retryAfterSeconds));
      throw AppErrorCode.NTF_006.create();
    }

    const resolved = await this.templateResolver.resolveForSend(config.templateKey);
    if (!isConsoleSendable(resolved.template)) {
      this.logger.warn('Refused a console send of an identity, authentication or security template', attempt);
      throw AppErrorCode.NTF_005.create();
    }

    const { payload, strippedKeys } = withoutRenderGlobals(resolved.template.variableSchema, config.payload);
    const audit = {
      ...attempt,
      channels: resolved.enabledChannels,
      recipients: maskRecipients(config.recipients),
      strippedPayloadKeys: strippedKeys,
    };
    try {
      const result = await this.notificationService.sendResolved(resolved, { ...config, payload });
      const jobIds = result.channelResults.flatMap(channelResult => (channelResult.jobId ? [channelResult.jobId] : []));
      this.logger.info('Console notification sent', { ...audit, jobIds, status: result.status });
      return result;
    } catch (error) {
      /** A channel's job may already have fired when a sibling channel throws, so the attempt is audited even without its job ids. */
      const errorCode = error instanceof AppError ? error.code : 'UNKNOWN_ERROR';
      this.logger.info('Console notification send failed', { ...audit, jobIds: [], status: 'ERROR', errorCode });
      throw error;
    }
  }
}
