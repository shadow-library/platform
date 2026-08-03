/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type Notification, type Template } from '@server/database';

/**
 * Defining types
 */

export interface PartialFixture {
  partialKey: string;
  name: string;
  description: string;
  body: string;
}

export interface LayoutFixture {
  layoutKey: string;
  name: string;
  description: string;
  body: string;
}

export interface ChannelContent {
  channel: Notification.Channel;
  subject?: string;
  body: string;
  layoutKey?: string;
}

export interface TemplateFixture {
  templateKey: string;
  name: string;
  description: string;
  messageType: Template.MessageType;
  priority: Notification.Priority;
  category?: string;
  /** Defaults to true; an inactive template resolves to zero enabled channels and sends nothing. */
  isActive?: boolean;
  variables: Record<string, Template.VariableDefinition>;
  channels: ChannelContent[];
}

/**
 * Declaring the constants
 *
 * The baseline design system + notification catalogue that pulse bootstraps into an empty datastore. It is authored
 * here purely as data — no message content lives in application code. The bootstrap seeds each item only when absent,
 * so an operator can fully customise (or replace) any template through the CMS and a later boot will not clobber it.
 */

const DEFAULT_LAYOUT_KEY = 'default';

/** A declared variable in a template's contract. `example` doubles as the value used to gate the template at publish. */
function variable(type: Template.VariableDefinition['type'], required: boolean, example?: string): Template.VariableDefinition {
  return example === undefined ? { type, required } : { type, required, example };
}

/** One-time-code email: heading, a line of context, the shared OTP block, and an expiry note. */
function otpEmail(heading: string, intro: string): string {
  return `<h1 class="email-h1">${heading}</h1>
<p class="email-text">${intro}</p>
{% render 'otp-code', code: code %}
<p class="email-muted">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>`;
}

/** Security-alert email: heading, the alert body, and a warning panel prompting action if unexpected. */
function securityEmail(heading: string, body: string, action = 'If this wasn’t you, secure your account and change your password right away.'): string {
  return `<h1 class="email-h1">${heading}</h1>
<p class="email-text">${body}</p>
<div class="email-panel email-panel--warn">${action}</div>`;
}

/**
 * The branded, theme-aware Shadow email shell — the ported `@shadow-library/ui` design system, now a first-class CMS
 * layout. `{{ content | raw }}` receives the already-rendered fragment; brand + year come from the render globals.
 * Self-contained (no external assets) and CSS-inlined by juice at render, with the dark-mode block preserved.
 */
export const DEFAULT_LAYOUT_BODY = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<style>
  body { margin: 0; padding: 0; width: 100%; background: #f4f5f7; -webkit-text-size-adjust: 100%; }
  .email-wrap { width: 100%; background: #f4f5f7; padding: 32px 12px; }
  .email-card { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e4e7ec; border-radius: 14px; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  .email-header { padding: 24px 32px; border-bottom: 1px solid #eef0f4; }
  .email-brand { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; color: #101828; }
  .email-brand-dot { color: {{ brand.accent }}; }
  .email-tagline { display: inline-block; margin-left: 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #98a2b3; }
  .email-body { padding: 32px; }
  .email-h1 { margin: 0 0 16px; font-size: 22px; line-height: 1.3; font-weight: 700; color: #101828; letter-spacing: -0.01em; }
  .email-text { margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #475467; }
  .email-muted { margin: 16px 0 0; font-size: 13px; line-height: 1.6; color: #98a2b3; }
  .email-strong { color: #101828; font-weight: 600; }
  .email-code { margin: 24px 0; padding: 20px; text-align: center; background: #f8f9fc; border: 1px solid #e4e7ec; border-radius: 12px;
    font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace; font-size: 32px; font-weight: 700; letter-spacing: 0.35em; color: {{ brand.accent }}; }
  .email-btn { display: inline-block; margin: 8px 0 4px; padding: 12px 28px; background: {{ brand.accent }}; color: #ffffff !important;
    font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 10px; }
  .email-panel { margin: 24px 0; padding: 16px 18px; background: #f8f9fc; border: 1px solid #e4e7ec; border-left: 3px solid {{ brand.accent }}; border-radius: 8px;
    font-size: 14px; line-height: 1.6; color: #475467; }
  .email-panel--warn { background: #fff8eb; border-color: #f2d18b; border-left-color: #dc9a1e; color: #7a4d00; }
  .email-meta { width: 100%; margin: 20px 0; border-collapse: collapse; font-size: 14px; }
  .email-meta td { padding: 8px 0; border-bottom: 1px solid #eef0f4; color: #475467; vertical-align: top; }
  .email-meta .email-meta-label { color: #98a2b3; width: 40%; }
  .email-footer { padding: 20px 32px 28px; border-top: 1px solid #eef0f4; }
  .email-footer-note { margin: 0 0 8px; font-size: 12px; line-height: 1.5; color: #98a2b3; }
  .email-footer-legal { margin: 0; font-size: 12px; color: #b6bdc9; }
  @media (prefers-color-scheme: dark) {
    body, .email-wrap { background: #0b0d12 !important; }
    .email-card { background: #14171f !important; border-color: #262b36 !important; }
    .email-header, .email-footer { border-color: #222732 !important; }
    .email-brand, .email-h1, .email-strong { color: #f5f7fa !important; }
    .email-brand-dot { color: {{ brand.accentDark }} !important; }
    .email-text, .email-panel, .email-meta td { color: #c3c9d4 !important; }
    .email-muted, .email-tagline, .email-footer-note, .email-meta .email-meta-label { color: #8b93a4 !important; }
    .email-footer-legal { color: #6b7280 !important; }
    .email-code, .email-panel { background: #1b1f29 !important; border-color: #2b313d !important; }
    .email-code { color: {{ brand.accentDark }} !important; }
    .email-panel { border-left-color: {{ brand.accentDark }} !important; }
    .email-panel--warn { background: #2a2213 !important; border-color: #5c4a1c !important; border-left-color: #d8a63b !important; color: #f2c879 !important; }
    .email-btn { background: {{ brand.accentDark }} !important; color: #0b0d12 !important; }
    .email-meta td { border-color: #222732 !important; }
  }
</style>
</head>
<body>
<div class="email-wrap">
  <div class="email-card">
    <div class="email-header">
      <span class="email-brand">{{ brand.name }}<span class="email-brand-dot">.</span></span>
      <span class="email-tagline">{{ brand.tagline }}</span>
    </div>
    <div class="email-body">
{{ content | raw }}
    </div>
    <div class="email-footer">
      <p class="email-footer-note">This is an automated message from {{ brand.name }}. For your security, we never ask for your password or codes by email.</p>
      <p class="email-footer-legal">&copy; {{ year }} {{ brand.name }}. All rights reserved.</p>
    </div>
  </div>
</div>
</body>
</html>`;

export const BASELINE_LAYOUTS: LayoutFixture[] = [
  { layoutKey: DEFAULT_LAYOUT_KEY, name: 'Shadow default', description: 'The branded, theme-aware transactional email shell.', body: DEFAULT_LAYOUT_BODY },
];

export const BASELINE_PARTIALS: PartialFixture[] = [
  { partialKey: 'otp-code', name: 'One-time code block', description: 'The centred, monospaced code panel for OTP emails.', body: '<div class="email-code">{{ code }}</div>' },
  { partialKey: 'button', name: 'Primary button', description: 'A branded call-to-action button.', body: '<a class="email-btn" href="{{ href }}">{{ label }}</a>' },
];

export const BASELINE_TEMPLATES: TemplateFixture[] = [
  {
    templateKey: 'sign-up',
    name: 'Sign-up welcome',
    description: 'Templates for user sign-up notifications',
    messageType: 'TRANSACTIONAL',
    priority: 'MEDIUM',
    category: 'onboarding',
    variables: { name: variable('string', false, 'Alex') },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'Welcome to Shadow',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: `<h1 class="email-h1">Welcome to Shadow, {{ name }}</h1>
<p class="email-text">Your account is ready. You now have a single secure identity across every Shadow app.</p>
<p class="email-muted">We're glad to have you on board.</p>`,
      },
      { channel: 'SMS', body: 'Welcome {{ name }}, your account is ready.' },
    ],
  },
  {
    templateKey: 'password-reset',
    name: 'Password reset',
    description: 'Templates for password reset notifications',
    messageType: 'TRANSACTIONAL',
    priority: 'HIGH',
    category: 'account',
    variables: { resetLink: variable('string', true, 'https://shadow.app/reset/abc123') },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'Reset your password',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: `<h1 class="email-h1">Reset your password</h1>
<p class="email-text">We received a request to reset your Shadow password. Use the button below to choose a new one.</p>
<p>{% render 'button', href: resetLink, label: 'Reset password' %}</p>
<p class="email-muted">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
      },
    ],
  },
  {
    templateKey: 'weekly-newsletter',
    name: 'Weekly newsletter',
    description: 'Templates for weekly marketing newsletters',
    messageType: 'PROMOTIONAL',
    priority: 'LOW',
    category: 'marketing',
    variables: {},
    channels: [
      {
        channel: 'EMAIL',
        subject: 'Your weekly newsletter',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: `<h1 class="email-h1">This week at Shadow</h1>
<p class="email-text">Here are the latest updates, improvements, and news from across the Shadow ecosystem.</p>`,
      },
    ],
  },
  {
    templateKey: 'account-alerts',
    name: 'Account alert',
    description: 'Templates for account activity alerts',
    messageType: 'TRANSACTIONAL',
    priority: 'HIGH',
    category: 'security',
    variables: {},
    channels: [{ channel: 'PUSH', subject: 'Account alert', body: 'Unusual activity detected on your account.' }],
  },
  {
    templateKey: 'spring-promo',
    name: 'Spring promotion',
    description: 'Templates for seasonal promotional campaigns',
    messageType: 'PROMOTIONAL',
    priority: 'MEDIUM',
    category: 'marketing',
    isActive: false,
    variables: { offer: variable('string', false, 'SPRING50') },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'Spring promo',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: `<h1 class="email-h1">Spring is here</h1>
<p class="email-text">Use code <span class="email-strong">{{ offer }}</span> for 50% off.</p>`,
      },
      { channel: 'SMS', body: 'Use code {{ offer }} for 50% off.' },
    ],
  },

  /** Identity-server notification catalogue: every key identity sends resolves to an en-ZZ published version on a fresh boot. */
  {
    templateKey: 'auth.register.otp',
    name: 'Registration OTP',
    description: 'OTP delivered during new account registration',
    messageType: 'OTP',
    priority: 'HIGH',
    category: 'auth',
    variables: { code: variable('string', true, '482913') },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'Your registration code',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: otpEmail('Confirm your registration', 'Enter this code to finish creating your Shadow account:'),
      },
      { channel: 'SMS', body: '{{ code }} is your Shadow registration code. It expires in 10 minutes.' },
    ],
  },
  {
    templateKey: 'auth.login.otp',
    name: 'Sign-in OTP',
    description: 'OTP delivered during sign-in and account linking',
    messageType: 'OTP',
    priority: 'HIGH',
    category: 'auth',
    variables: { code: variable('string', true, '175306') },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'Your sign-in code',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: otpEmail('Your sign-in code', 'Enter this code to finish signing in to your Shadow account:'),
      },
      { channel: 'SMS', body: '{{ code }} is your Shadow sign-in code. It expires in 10 minutes.' },
    ],
  },
  {
    templateKey: 'auth.recovery.otp',
    name: 'Account recovery OTP',
    description: 'OTP delivered during account recovery',
    messageType: 'OTP',
    priority: 'HIGH',
    category: 'auth',
    variables: { code: variable('string', true, '930127') },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'Your account recovery code',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: otpEmail('Recover your account', 'Enter this code to continue recovering access to your Shadow account:'),
      },
    ],
  },
  {
    templateKey: 'auth.password.changed',
    name: 'Password changed alert',
    description: 'Alert sent after an account password change',
    messageType: 'TRANSACTIONAL',
    priority: 'HIGH',
    category: 'security',
    variables: { ipAddress: variable('string', true, '203.0.113.7') },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'Your password was changed',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: securityEmail(
          'Your password was changed',
          'The password for your Shadow account was just changed from IP address <span class="email-strong">{{ ipAddress }}</span>.',
        ),
      },
    ],
  },
  {
    templateKey: 'auth.mfa.enrolled',
    name: 'MFA enrolled alert',
    description: 'Alert sent when a multi-factor authentication method is enrolled',
    messageType: 'TRANSACTIONAL',
    priority: 'HIGH',
    category: 'security',
    variables: { method: variable('string', true, 'TOTP') },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'Two-factor authentication enabled',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: `<h1 class="email-h1">Two-factor authentication enabled</h1>
<p class="email-text">Two-factor authentication using <span class="email-strong">{{ method }}</span> was added to your Shadow account. Your account is now better protected.</p>
<div class="email-panel">If you didn't enable this, review your account security and change your password immediately.</div>`,
      },
    ],
  },
  {
    templateKey: 'auth.mfa.disabled',
    name: 'MFA disabled alert',
    description: 'Alert sent when a multi-factor authentication method is disabled',
    messageType: 'TRANSACTIONAL',
    priority: 'HIGH',
    category: 'security',
    variables: { method: variable('string', true, 'WEBAUTHN') },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'Two-factor authentication disabled',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: securityEmail(
          'Two-factor authentication disabled',
          'Two-factor authentication using <span class="email-strong">{{ method }}</span> was removed from your Shadow account. Your account is now less protected.',
          'If you didn’t make this change, re-enable two-factor authentication and change your password right away.',
        ),
      },
    ],
  },
  {
    templateKey: 'auth.mfa.recovery-code-used',
    name: 'Recovery code used alert',
    description: 'Alert sent when an MFA recovery code is used',
    messageType: 'TRANSACTIONAL',
    priority: 'HIGH',
    category: 'security',
    variables: { remaining: variable('number', true, '4') },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'A recovery code was used',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: `<h1 class="email-h1">A recovery code was used</h1>
<p class="email-text">One of your Shadow recovery codes was just used to access your account. You have <span class="email-strong">{{ remaining }}</span> recovery codes remaining.</p>
<div class="email-panel">Running low? Generate a fresh set of recovery codes from your security settings. If this wasn't you, secure your account immediately.</div>`,
      },
    ],
  },
  {
    templateKey: 'security.new-signin',
    name: 'New sign-in alert',
    description: 'Alert sent for a sign-in from an unseen device or IP address',
    messageType: 'TRANSACTIONAL',
    priority: 'HIGH',
    category: 'security',
    variables: {
      time: variable('string', true, '2026-07-18T10:15:00.000Z'),
      ipAddress: variable('string', true, '203.0.113.7'),
      userAgent: variable('string', true, 'Chrome on macOS'),
    },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'New sign-in to your account',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: `<h1 class="email-h1">New sign-in to your account</h1>
<p class="email-text">We noticed a sign-in to your Shadow account from a device or location we haven't seen before.</p>
<table class="email-meta" role="presentation" cellpadding="0" cellspacing="0">
<tr><td class="email-meta-label">When</td><td>{{ time }}</td></tr>
<tr><td class="email-meta-label">IP address</td><td>{{ ipAddress }}</td></tr>
<tr><td class="email-meta-label">Device</td><td>{{ userAgent }}</td></tr>
</table>
<div class="email-panel email-panel--warn">If this was you, no action is needed. If not, change your password and review your active sessions right away.</div>`,
      },
    ],
  },
  {
    templateKey: 'user.email.verification',
    name: 'Email verification OTP',
    description: 'OTP delivered to verify a newly added email address',
    messageType: 'OTP',
    priority: 'HIGH',
    category: 'auth',
    variables: { code: variable('string', true, '648201') },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'Verify your email address',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: otpEmail('Verify your email address', 'Enter this code to confirm this email address on your Shadow account:'),
      },
    ],
  },
  {
    templateKey: 'user.phone.verification',
    name: 'Phone verification OTP',
    description: 'OTP delivered to verify a newly added phone number',
    messageType: 'OTP',
    priority: 'HIGH',
    category: 'auth',
    variables: { code: variable('string', true, '507934') },
    channels: [{ channel: 'SMS', body: '{{ code }} is your Shadow phone verification code. It expires in 10 minutes.' }],
  },
  {
    templateKey: 'user.contact.changed',
    name: 'Contact details changed alert',
    description: 'Alert sent when account contact details change',
    messageType: 'TRANSACTIONAL',
    priority: 'HIGH',
    category: 'security',
    variables: { type: variable('string', true, 'email'), action: variable('string', true, 'primary-changed') },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'Your contact details were updated',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: securityEmail(
          'Your contact details were updated',
          'A change was made to the <span class="email-strong">{{ type }}</span> contact on your Shadow account ({{ action }}).',
          'If you didn’t make this change, secure your account and review your contact details right away.',
        ),
      },
    ],
  },
  {
    templateKey: 'organisation-invitation',
    name: 'Organisation invitation',
    description: 'Invitation to join an organisation',
    messageType: 'TRANSACTIONAL',
    priority: 'MEDIUM',
    category: 'organisation',
    variables: { organisationName: variable('string', true, 'Acme Corp'), role: variable('string', true, 'ADMIN'), token: variable('string', true, 'inv-4f9d8a7b2c31') },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'You have been invited to join {{ organisationName }}',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: `<h1 class="email-h1">You've been invited to {{ organisationName }}</h1>
<p class="email-text">You've been invited to join <span class="email-strong">{{ organisationName }}</span> on Shadow as <span class="email-strong">{{ role }}</span>. Use the invitation code below to accept:</p>
{% render 'otp-code', code: token %}
<p class="email-muted">Enter this code when prompted to accept the invitation. If you weren't expecting this, you can ignore this email.</p>`,
      },
    ],
  },
  {
    templateKey: 'organisation-role-changed',
    name: 'Organisation role changed',
    description: 'Notice that an organisation member role changed',
    messageType: 'TRANSACTIONAL',
    priority: 'MEDIUM',
    category: 'organisation',
    variables: { role: variable('string', true, 'MEMBER') },
    channels: [
      {
        channel: 'EMAIL',
        subject: 'Your organisation role was changed',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: `<h1 class="email-h1">Your role was updated</h1>
<p class="email-text">Your role in your organisation has been changed to <span class="email-strong">{{ role }}</span>. This may change what you can see and do.</p>
<p class="email-muted">If you have questions about this change, contact your organisation administrator.</p>`,
      },
    ],
  },
  {
    templateKey: 'organisation-member-removed',
    name: 'Organisation member removed',
    description: 'Notice that a member was removed from an organisation',
    messageType: 'TRANSACTIONAL',
    priority: 'MEDIUM',
    category: 'organisation',
    variables: {},
    channels: [
      {
        channel: 'EMAIL',
        subject: 'You were removed from an organisation',
        layoutKey: DEFAULT_LAYOUT_KEY,
        body: `<h1 class="email-h1">You were removed from an organisation</h1>
<p class="email-text">Your membership in the organisation has been removed. You'll no longer have access to its resources on Shadow.</p>
<p class="email-muted">If you believe this was a mistake, contact the organisation administrator.</p>`,
      },
    ],
  },
];
