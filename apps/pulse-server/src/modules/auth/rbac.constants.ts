/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export type PulsePermission = (typeof PULSE_PERMISSIONS)[keyof typeof PULSE_PERMISSIONS];
export type PulseScope = (typeof PULSE_SCOPES)[keyof typeof PULSE_SCOPES];
export type PulseRole = (typeof PULSE_ROLES)[keyof typeof PULSE_ROLES];

/**
 * Declaring the constants
 *
 * The authoritative pulse RBAC catalog. Route decorators reference these strings and the identity
 * BootstrapService seeds the matching application permissions and roles — the two must stay in sync.
 */

/** Ecosystem-standard API resource identifier for pulse — the audience of every token this service accepts or requests */
export const PULSE_AUDIENCE = 'pulse-server';

/** PDP-checked permissions, granted to operators through roles and evaluated in the platform organisation */
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

/** OAuth token scope carrying the machine-to-machine send capability, also delegated to the pulse-web client */
export const PULSE_SCOPES = {
  notificationsSend: 'notifications:send',
} as const;

/** Roles seeded in identity under the pulse application and assigned to operators in the platform organisation */
export const PULSE_ROLES = {
  admin: 'PulseAdmin',
  operator: 'PulseOperator',
  viewer: 'PulseViewer',
} as const;
