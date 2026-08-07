import { ERROR_MESSAGES } from './messages.constants';

interface FieldPattern {
  pattern: string;
  errorMessage: { pattern: string };
}

export const REGEX = {
  USERNAME: /^[a-zA-Z0-9._-]{3,32}$/,
  EMAIL: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  PHONE: /^\+[1-9]\d{6,14}$/,
  ID: /^\d+$/,
  UUID: /^[0-9a-fA-F-]{36}$/,
  OTP: /^\d{6}$/,
  CLIENT_ID: /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/,
  SLUG: /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/,
  APPLICATION_NAME: /^[a-z0-9][a-z0-9-]{1,62}$/,
  SUBDOMAIN: /^[a-z0-9][a-z0-9-]{0,62}$/,
} as const satisfies Record<string, RegExp>;

const unanchored = (regex: RegExp): string => regex.source.slice(1, -1);

const shapedAs = (regex: RegExp, message: string): FieldPattern => ({ pattern: regex.source, errorMessage: { pattern: message } });

const identifier = new RegExp(`^(${[REGEX.EMAIL, REGEX.PHONE, REGEX.USERNAME].map(unanchored).join('|')})$`);

/**
 * Pattern rules for `@Field`, each paired with the message the caller should see. Spread one of
 * these instead of passing a bare `pattern`, whose default Ajv error exposes the raw expression.
 */
export const PATTERN = {
  ID: shapedAs(REGEX.ID, ERROR_MESSAGES.INVALID_ID),
  EMAIL: shapedAs(REGEX.EMAIL, ERROR_MESSAGES.INVALID_EMAIL),
  PHONE: shapedAs(REGEX.PHONE, ERROR_MESSAGES.INVALID_PHONE_NUMBER),
  UUID: shapedAs(REGEX.UUID, ERROR_MESSAGES.INVALID_UUID),
  OTP: shapedAs(REGEX.OTP, ERROR_MESSAGES.INVALID_OTP),
  /** Slug-shaped, and wide enough to still accept the UUID client ids issued before slugs. */
  CLIENT_ID: shapedAs(REGEX.CLIENT_ID, ERROR_MESSAGES.INVALID_CLIENT_ID),
  SLUG: shapedAs(REGEX.SLUG, ERROR_MESSAGES.INVALID_SLUG),
  APPLICATION_NAME: shapedAs(REGEX.APPLICATION_NAME, ERROR_MESSAGES.INVALID_APPLICATION_NAME),
  SUBDOMAIN: shapedAs(REGEX.SUBDOMAIN, ERROR_MESSAGES.INVALID_SUBDOMAIN),
  IDENTIFIER: shapedAs(identifier, ERROR_MESSAGES.INVALID_IDENTIFIER),
} as const satisfies Record<string, FieldPattern>;
