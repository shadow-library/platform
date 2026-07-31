/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Deliveries are signed Stripe-style: `x-shadow-webhook-signature: t=<unix seconds>,v1=<hex>` where
 * the HMAC-SHA256 input is `<t>.<raw body>`. During secret rotation the header carries a second
 * `v1` computed with the outgoing secret, so receivers verify against any listed signature.
 * Receivers should reject timestamps older than the documented 5-minute tolerance window.
 */

export const WEBHOOK_SIGNATURE_HEADER = 'x-shadow-webhook-signature';
export const WEBHOOK_ID_HEADER = 'x-shadow-webhook-id';
export const WEBHOOK_EVENT_HEADER = 'x-shadow-webhook-event';

export const WEBHOOK_SECRET_PREFIX = 'whsec_';
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;
export const WEBHOOK_ROTATION_OVERLAP_HOURS = 24;
