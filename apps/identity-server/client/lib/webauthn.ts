/**
 * Importing npm packages
 */
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 *
 * The server speaks @simplewebauthn's JSON wire format (base64url strings throughout), so the
 * matching browser package handles all encoding; these wrappers only pin the option shapes the
 * identity API produces and surface cancellation as a typed outcome instead of an exception.
 */

type PublicKeyOptions = Record<string, unknown>;

export type CeremonyResult = { outcome: 'COMPLETED'; response: Record<string, unknown> } | { outcome: 'CANCELLED' } | { outcome: 'UNSUPPORTED' };

/**
 * Declaring the constants
 */

export function isWebauthnSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}

const isAbort = (error: unknown): boolean => error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError');

/** Runs the registration ceremony for the options minted by POST /me/webauthn/register/options. */
export async function registerPasskey(options: PublicKeyOptions): Promise<CeremonyResult> {
  if (!isWebauthnSupported()) return { outcome: 'UNSUPPORTED' };
  try {
    const response = await startRegistration({ optionsJSON: options as never });
    return { outcome: 'COMPLETED', response: response as unknown as Record<string, unknown> };
  } catch (error) {
    if (isAbort(error)) return { outcome: 'CANCELLED' };
    throw error;
  }
}

/** Runs the assertion ceremony for the options minted by POST /auth/webauthn/options. */
export async function assertPasskey(options: PublicKeyOptions): Promise<CeremonyResult> {
  if (!isWebauthnSupported()) return { outcome: 'UNSUPPORTED' };
  try {
    const response = await startAuthentication({ optionsJSON: options as never });
    return { outcome: 'COMPLETED', response: response as unknown as Record<string, unknown> };
  } catch (error) {
    if (isAbort(error)) return { outcome: 'CANCELLED' };
    throw error;
  }
}
