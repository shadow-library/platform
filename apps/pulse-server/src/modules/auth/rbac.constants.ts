/**
 * The authoritative pulse RBAC catalog. Route decorators reference these strings and the identity
 * BootstrapService seeds the matching application permissions and roles — the two must stay in sync.
 * The service audience (`api://pulse`) is no longer restated here: the SDK derives it, the redirect
 * URIs, and the granted scopes from `GET {issuer}/api/v1/apps/me` at boot.
 */

export const PULSE_PERMISSIONS = {
  templatesRead: 'pulse:templates:read',
  templatesWrite: 'pulse:templates:write',
  /** The higher bar that gates draft → published transitions and rollbacks (a live-traffic change, unlike drafting) */
  templatesPublish: 'pulse:templates:publish',
  /** Governs the shared design-system assets (layouts + partials) every template renders through */
  layoutsWrite: 'pulse:layouts:write',
  sendersRead: 'pulse:senders:read',
  sendersWrite: 'pulse:senders:write',
  metricsRead: 'pulse:metrics:read',
  logsRead: 'pulse:logs:read',
  /** High-trust: the dev message log exposes recipient PII and rendered bodies (OTP codes, reset links), so it is admin-only, unlike the viewer-held logsRead */
  messagesRead: 'pulse:messages:read',
} as const;

export const PULSE_SCOPES = {
  notificationsSend: 'notifications:send',
} as const;
