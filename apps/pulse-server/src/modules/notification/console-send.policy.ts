import { RENDER_GLOBAL_KEYS } from '@modules/template';
import { type Template } from '@server/database';

import { type Recipients } from './notification.service';

export interface ConsolePayload {
  payload: Record<string, unknown>;
  strippedKeys: string[];
}

const REFUSED_KEY_FAMILIES = ['auth.', 'security.', 'user.'];
const REFUSED_KEYS = new Set(['password-reset']);
const REFUSED_CATEGORIES = new Set(['auth', 'security']);

/**
 * Identity's account-security families, the legacy reset link, any one-time code and anything filed as auth or security: a console send of one
 * reaches an arbitrary recipient with a caller-chosen payload under the platform's brand, which is a phishing or spoofed-alert kit.
 */
export function isConsoleSendable(template: Pick<Template.Template, 'templateKey' | 'messageType' | 'category'>): boolean {
  if (REFUSED_KEY_FAMILIES.some(family => template.templateKey.startsWith(family))) return false;
  if (REFUSED_KEYS.has(template.templateKey)) return false;
  if (template.messageType === 'OTP') return false;
  return !REFUSED_CATEGORIES.has(template.category ?? '');
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
