import { RENDER_GLOBAL_KEYS } from '@modules/template';
import { type Template } from '@server/database';
import { BASELINE_TEMPLATES } from '@server/database/seed/baseline.data';

import { type Recipients } from './notification.service';

export interface ConsolePayload {
  payload: Record<string, unknown>;
  strippedKeys: string[];
}

const IDENTITY_TEMPLATE_KEYS = new Set(BASELINE_TEMPLATES.filter(fixture => fixture.producer === 'identity').map(fixture => fixture.templateKey));
const REFUSED_KEY_FAMILIES = ['auth.', 'security.', 'user.'];
const REFUSED_KEYS = new Set(['password-reset']);
const REFUSED_CATEGORIES = new Set(['auth', 'security']);

const normalise = (value: string | null): string => (value ?? '').trim().toLowerCase();

/**
 * Everything identity sends, operator templates squatting on its account-security namespaces, the legacy reset link, any one-time code and
 * anything filed as auth or security: a console send of one reaches an arbitrary recipient with a caller-chosen payload under the platform's
 * brand, which is a phishing or spoofed-notice kit.
 */
export function isConsoleSendable(template: Pick<Template.Template, 'templateKey' | 'messageType' | 'category'>): boolean {
  const key = normalise(template.templateKey);
  if (IDENTITY_TEMPLATE_KEYS.has(key) || REFUSED_KEYS.has(key)) return false;
  if (REFUSED_KEY_FAMILIES.some(family => key.startsWith(family))) return false;
  if (template.messageType === 'OTP') return false;
  return !REFUSED_CATEGORIES.has(normalise(template.category));
}

export function withoutRenderGlobals(schema: Template.VariableSchema, payload: Record<string, unknown> = {}): ConsolePayload {
  const isGlobal = (key: string): boolean => RENDER_GLOBAL_KEYS.has(key) && !Object.hasOwn(schema.variables, key);
  const entries = Object.entries(payload);
  return {
    payload: Object.fromEntries(entries.filter(([key]) => !isGlobal(key))),
    strippedKeys: entries.filter(([key]) => isGlobal(key)).map(([key]) => key),
  };
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const labels = domain.split('.');
  const suffix = labels.length > 1 ? `.${labels.at(-1)}` : '';
  return `${local.slice(0, 1)}***@${domain.slice(0, 1)}***${suffix}`;
}

const maskTail = (value: string): string => `***${value.slice(-2)}`;

export function maskRecipients(recipients: Recipients): Recipients {
  const masked: Recipients = {};
  if (recipients.email) masked.email = maskEmail(recipients.email);
  if (recipients.phone) masked.phone = maskTail(recipients.phone);
  if (recipients.push) masked.push = maskTail(recipients.push);
  return masked;
}
