import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
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
    const attempt = { actor: actor.sub, organisation: actor.org, templateKey: config.templateKey };

    const admission = this.limiter.admit(actor.sub);
    if (!admission.admitted) {
      this.logger.warn('Refused a console send over the per-actor limit', { ...attempt, retryAfterSeconds: admission.retryAfterSeconds });
      this.context.getResponse().header('retry-after', String(admission.retryAfterSeconds));
      throw AppErrorCode.NTF_006.create();
    }

    const resolved = await this.templateResolver.resolveForSend(config.templateKey);
    if (!isConsoleSendable(resolved.template)) {
      this.logger.warn('Refused a console send of an authentication or security template', attempt);
      throw AppErrorCode.NTF_005.create();
    }

    const { payload, strippedKeys } = withoutRenderGlobals(resolved.template.variableSchema, config.payload);
    const result = await this.notificationService.sendResolved(resolved, { ...config, payload });
    this.logger.info('Console notification sent', {
      ...attempt,
      channels: result.channelResults.map(channelResult => channelResult.channel),
      recipients: maskRecipients(config.recipients),
      jobIds: result.channelResults.flatMap(channelResult => (channelResult.jobId ? [channelResult.jobId] : [])),
      status: result.status,
      strippedPayloadKeys: strippedKeys,
    });
    return result;
  }
}
