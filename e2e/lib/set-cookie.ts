/**
 * Importing npm packages
 */
import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface SetCookie {
  readonly name: string;
  readonly value: string;
  /** Attribute names lower-cased; a flag attribute such as `HttpOnly` maps to `''`. */
  readonly attributes: ReadonlyMap<string, string>;
}

/**
 * Declaring the constants
 */

export function parseSetCookie(header: string): SetCookie {
  const [pair = '', ...rest] = header.split(';');
  const separator = pair.indexOf('=');
  const attributes = new Map<string, string>();
  for (const part of rest) {
    const [key = '', ...value] = part.split('=');
    attributes.set(key.trim().toLowerCase(), value.join('=').trim());
  }
  return { name: pair.slice(0, separator).trim(), value: pair.slice(separator + 1).trim(), attributes };
}

/** Every `Set-Cookie` header on `response`, parsed; Playwright's `headers()` would fold them into one comma-joined string. */
export function parseSetCookies(response: APIResponse): SetCookie[] {
  return response
    .headersArray()
    .filter(header => header.name.toLowerCase() === 'set-cookie')
    .map(header => parseSetCookie(header.value));
}

export function findSetCookie(response: APIResponse, name: string): SetCookie | undefined {
  return parseSetCookies(response).find(cookie => cookie.name === name);
}
