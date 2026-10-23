/** Identity's BootstrapService seeds the matching permissions and roles; these strings must stay in sync with it. */
export const PULSE_PERMISSIONS = {
  templatesRead: 'pulse:templates:read',
  templatesWrite: 'pulse:templates:write',
  /** Gates publishes and rollbacks, which change live traffic, unlike drafting. */
  templatesPublish: 'pulse:templates:publish',
  layoutsWrite: 'pulse:layouts:write',
  sendersRead: 'pulse:senders:read',
  sendersWrite: 'pulse:senders:write',
  metricsRead: 'pulse:metrics:read',
  logsRead: 'pulse:logs:read',
  /** Admin-only: the message log exposes recipient PII and rendered bodies (OTP codes, reset links), unlike the viewer-held logsRead. */
  messagesRead: 'pulse:messages:read',
  /** Admin-only manual send from the console; the service-only producer route never admits it. */
  notificationsSend: 'pulse:notifications:send',
} as const;

export const PULSE_SCOPES = {
  notificationsSend: 'notifications:send',
} as const;
