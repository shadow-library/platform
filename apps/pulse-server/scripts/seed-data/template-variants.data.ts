/**
 * Importing npm packages
 */
import { InferInsertModel } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import * as schema from '@server/database/schemas';

/**
 * Defining types
 */
type TemplateVariantInsertModel = InferInsertModel<typeof schema.templateVariants>;

/**
 * Declaring the constants
 *
 * EMAIL bodies are semantic HTML *fragments* — the branded, theme-aware shell (header, footer,
 * design tokens) is applied at render time by `renderEmailDocument`, so each fragment only carries
 * the message. SMS/PUSH bodies stay plain text. Mustache `{{var}}` tags are interpolated (and
 * HTML-escaped) per request; the helpers below keep the recurring OTP/security shapes consistent.
 */

/** One-time-code email: a heading, a line of context, the code block, and an expiry/ignore note. */
const otpEmail = (heading: string, intro: string): string =>
  `<h1 class="email-h1">${heading}</h1>
<p class="email-text">${intro}</p>
<div class="email-code">{{code}}</div>
<p class="email-muted">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>`;

/** Security-alert email: a heading, the alert body, and a warning panel prompting action if unexpected. */
const securityEmail = (heading: string, body: string, action = 'If this wasn’t you, secure your account and change your password right away.'): string =>
  `<h1 class="email-h1">${heading}</h1>
<p class="email-text">${body}</p>
<div class="email-panel email-panel--warn">${action}</div>`;

export const templateVariants: TemplateVariantInsertModel[] = [
  {
    id: 1n,
    templateGroupId: 1n,
    channel: 'EMAIL',
    locale: 'en-US',
    subject: 'Welcome to Shadow',
    body: `<h1 class="email-h1">Welcome to Shadow, {{name}}</h1>
<p class="email-text">Your account is ready. You now have a single secure identity across every Shadow app.</p>
<p class="email-muted">We're glad to have you on board.</p>`,
    isActive: true,
  },
  {
    id: 2n,
    templateGroupId: 1n,
    channel: 'SMS',
    locale: 'en-US',
    body: 'Welcome {{name}}, your account is ready.',
    isActive: true,
  },
  {
    id: 3n,
    templateGroupId: 2n,
    channel: 'EMAIL',
    locale: 'en-US',
    subject: 'Reset your password',
    body: `<h1 class="email-h1">Reset your password</h1>
<p class="email-text">We received a request to reset your Shadow password. Click the button below to choose a new one.</p>
<p><a class="email-btn" href="{{resetLink}}">Reset password</a></p>
<p class="email-muted">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
    isActive: true,
  },
  {
    id: 4n,
    templateGroupId: 3n,
    channel: 'EMAIL',
    locale: 'en-US',
    subject: 'Your weekly newsletter',
    body: `<h1 class="email-h1">This week at Shadow</h1>
<p class="email-text">Here are the latest updates, improvements, and news from across the Shadow ecosystem.</p>`,
    isActive: true,
  },
  {
    id: 5n,
    templateGroupId: 4n,
    channel: 'PUSH',
    locale: 'en-US',
    subject: 'Account alert',
    body: 'Unusual activity detected on your account.',
    isActive: true,
  },
  {
    id: 6n,
    templateGroupId: 1n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Welcome to Shadow',
    body: `<h1 class="email-h1">Welcome to Shadow, {{name}}</h1>
<p class="email-text">Your account is ready. You now have a single secure identity across every Shadow app.</p>
<p class="email-muted">We're glad to have you on board.</p>`,
    isActive: true,
  },
  {
    id: 7n,
    templateGroupId: 1n,
    channel: 'SMS',
    locale: 'en-ZZ',
    body: 'Welcome {{name}}, your account is ready.',
    isActive: true,
  },
  {
    id: 8n,
    templateGroupId: 2n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Reset your password',
    body: `<h1 class="email-h1">Reset your password</h1>
<p class="email-text">We received a request to reset your Shadow password. Click the button below to choose a new one.</p>
<p><a class="email-btn" href="{{resetLink}}">Reset password</a></p>
<p class="email-muted">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
    isActive: true,
  },
  {
    id: 9n,
    templateGroupId: 3n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Your weekly newsletter',
    body: `<h1 class="email-h1">This week at Shadow</h1>
<p class="email-text">Here are the latest updates, improvements, and news from across the Shadow ecosystem.</p>`,
    isActive: true,
  },
  {
    id: 10n,
    templateGroupId: 4n,
    channel: 'PUSH',
    locale: 'en-ZZ',
    subject: 'Account alert',
    body: 'Unusual activity detected on your account.',
    isActive: true,
  },

  /** Identity-server notification catalog: identity sends no locale, so pulse resolves the en-ZZ default variant */
  {
    id: 11n,
    templateGroupId: 6n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Your registration code',
    body: otpEmail('Confirm your registration', 'Enter this code to finish creating your Shadow account:'),
    isActive: true,
  },
  {
    id: 12n,
    templateGroupId: 6n,
    channel: 'SMS',
    locale: 'en-ZZ',
    body: '{{code}} is your Shadow registration code. It expires in 10 minutes.',
    isActive: true,
  },
  {
    id: 13n,
    templateGroupId: 7n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Your sign-in code',
    body: otpEmail('Your sign-in code', 'Enter this code to finish signing in to your Shadow account:'),
    isActive: true,
  },
  {
    id: 14n,
    templateGroupId: 7n,
    channel: 'SMS',
    locale: 'en-ZZ',
    body: '{{code}} is your Shadow sign-in code. It expires in 10 minutes.',
    isActive: true,
  },
  {
    id: 15n,
    templateGroupId: 8n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Your account recovery code',
    body: otpEmail('Recover your account', 'Enter this code to continue recovering access to your Shadow account:'),
    isActive: true,
  },
  {
    id: 16n,
    templateGroupId: 9n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Your password was changed',
    body: securityEmail('Your password was changed', 'The password for your Shadow account was just changed from IP address <span class="email-strong">{{ipAddress}}</span>.'),
    isActive: true,
  },
  {
    id: 17n,
    templateGroupId: 10n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Two-factor authentication enabled',
    body: `<h1 class="email-h1">Two-factor authentication enabled</h1>
<p class="email-text">Two-factor authentication using <span class="email-strong">{{method}}</span> was added to your Shadow account. Your account is now better protected.</p>
<div class="email-panel">If you didn't enable this, review your account security and change your password immediately.</div>`,
    isActive: true,
  },
  {
    id: 18n,
    templateGroupId: 11n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Two-factor authentication disabled',
    body: securityEmail(
      'Two-factor authentication disabled',
      'Two-factor authentication using <span class="email-strong">{{method}}</span> was removed from your Shadow account. Your account is now less protected.',
      'If you didn’t make this change, re-enable two-factor authentication and change your password right away.',
    ),
    isActive: true,
  },
  {
    id: 19n,
    templateGroupId: 12n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'A recovery code was used',
    body: `<h1 class="email-h1">A recovery code was used</h1>
<p class="email-text">One of your Shadow recovery codes was just used to access your account. You have <span class="email-strong">{{remaining}}</span> recovery codes remaining.</p>
<div class="email-panel">Running low? Generate a fresh set of recovery codes from your security settings. If this wasn't you, secure your account immediately.</div>`,
    isActive: true,
  },
  {
    id: 20n,
    templateGroupId: 13n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'New sign-in to your account',
    body: `<h1 class="email-h1">New sign-in to your account</h1>
<p class="email-text">We noticed a sign-in to your Shadow account from a device or location we haven't seen before.</p>
<table class="email-meta" role="presentation" cellpadding="0" cellspacing="0">
<tr><td class="email-meta-label">When</td><td>{{time}}</td></tr>
<tr><td class="email-meta-label">IP address</td><td>{{ipAddress}}</td></tr>
<tr><td class="email-meta-label">Device</td><td>{{userAgent}}</td></tr>
</table>
<div class="email-panel email-panel--warn">If this was you, no action is needed. If not, change your password and review your active sessions right away.</div>`,
    isActive: true,
  },
  {
    id: 21n,
    templateGroupId: 14n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Verify your email address',
    body: otpEmail('Verify your email address', 'Enter this code to confirm this email address on your Shadow account:'),
    isActive: true,
  },
  {
    id: 22n,
    templateGroupId: 15n,
    channel: 'SMS',
    locale: 'en-ZZ',
    body: '{{code}} is your Shadow phone verification code. It expires in 10 minutes.',
    isActive: true,
  },
  {
    id: 23n,
    templateGroupId: 16n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Your contact details were updated',
    body: securityEmail(
      'Your contact details were updated',
      'A change was made to the <span class="email-strong">{{type}}</span> contact on your Shadow account ({{action}}).',
      'If you didn’t make this change, secure your account and review your contact details right away.',
    ),
    isActive: true,
  },
  {
    id: 24n,
    templateGroupId: 17n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'You have been invited to join {{organisationName}}',
    body: `<h1 class="email-h1">You've been invited to {{organisationName}}</h1>
<p class="email-text">You've been invited to join <span class="email-strong">{{organisationName}}</span> on Shadow as <span class="email-strong">{{role}}</span>. Use the invitation code below to accept:</p>
<div class="email-code">{{token}}</div>
<p class="email-muted">Enter this code when prompted to accept the invitation. If you weren't expecting this, you can ignore this email.</p>`,
    isActive: true,
  },
  {
    id: 25n,
    templateGroupId: 18n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Your organisation role was changed',
    body: `<h1 class="email-h1">Your role was updated</h1>
<p class="email-text">Your role in your organisation has been changed to <span class="email-strong">{{role}}</span>. This may change what you can see and do.</p>
<p class="email-muted">If you have questions about this change, contact your organisation administrator.</p>`,
    isActive: true,
  },
  {
    id: 26n,
    templateGroupId: 19n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'You were removed from an organisation',
    body: `<h1 class="email-h1">You were removed from an organisation</h1>
<p class="email-text">Your membership in the organisation has been removed. You'll no longer have access to its resources on Shadow.</p>
<p class="email-muted">If you believe this was a mistake, contact the organisation administrator.</p>`,
    isActive: true,
  },
];
