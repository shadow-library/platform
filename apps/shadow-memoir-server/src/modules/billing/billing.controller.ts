/**
 * Importing npm packages
 */
import { RequireScope } from '@shadow-library/auth/module';
import { Body, Headers, HttpController, Params, Post, RawBody, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { CheckoutDto, CheckoutResponseDto, WebhookParamsDto, WebhookResponseDto } from './billing.dto';
import { BillingWebhookService, type WebhookOutcome } from './billing-webhook.service';
import { type CheckoutResult, EntitlementService } from './entitlement.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * Two routes with deliberately different principals (ARCHITECTURE §25). Checkout is an ordinary user
 * route. The webhook is the platform's only unauthenticated write path, and it carries no
 * `@Authenticated()` on purpose: a payment provider has no identity token to present, so the adapter's
 * signature verification is what stands in its place — see `BillingWebhookService`.
 *
 * There is no route here through which a user token could write an entitlement. That absence is the
 * point, and the `memoir_api` grant (SELECT only) is what holds if one is ever added by mistake.
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
