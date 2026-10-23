import { RequireScope } from '@shadow-library/auth/module';
import { Body, Headers, HttpController, Params, Post, RawBody, RespondFor } from '@shadow-library/fastify';

import { CheckoutDto, CheckoutResponseDto, WebhookParamsDto, WebhookResponseDto } from './billing.dto';
import { BillingWebhookService, type WebhookOutcome } from './billing-webhook.service';
import { type CheckoutResult, EntitlementService } from './entitlement.service';

/**
 * Two routes with deliberately different principals. Checkout is an ordinary user route. The webhook is the only unauthenticated write path
 * and carries no `@Authenticated()` on purpose:
 * the adapter's signature verification stands in (see `BillingWebhookService`). No route lets a user token write an entitlement, and that absence is the point.
 */
@HttpController('/api/v1/billing')
export class BillingController {
  constructor(
    private readonly webhookService: BillingWebhookService,
    private readonly entitlementService: EntitlementService,
  ) {}

  @Post('/checkout')
  @RequireScope('memoir:account')
  @RespondFor(200, CheckoutResponseDto)
  checkout(@Body() body: CheckoutDto): Promise<CheckoutResult> {
    return this.entitlementService.createCheckout(body.plan);
  }

  @Post('/webhooks/:provider')
  @RespondFor(200, WebhookResponseDto)
  webhook(@Params() params: WebhookParamsDto, @Headers() headers: Record<string, string | string[] | undefined>, @RawBody() rawBody: Buffer): Promise<WebhookOutcome> {
    return this.webhookService.handle(params.provider, { headers, rawBody });
  }
}
