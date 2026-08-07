export type PulsePermission = (typeof PULSE_PERMISSIONS)[keyof typeof PULSE_PERMISSIONS];
export type PulseScope = (typeof PULSE_SCOPES)[keyof typeof PULSE_SCOPES];
export type PulseRole = (typeof PULSE_ROLES)[keyof typeof PULSE_ROLES];

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
} as const;

export const PULSE_SCOPES = {
  notificationsSend: 'notifications:send',
} as const;

export const PULSE_ROLES = {
  admin: 'PulseAdmin',
  operator: 'PulseOperator',
  viewer: 'PulseViewer',
} as const;
