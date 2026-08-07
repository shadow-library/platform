import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

import { type JsonObject } from '@/types';

/**
 * The server speaks @simplewebauthn's JSON wire format (base64url throughout), so the matching browser
 * package handles all encoding; these wrappers only pin the option shapes and surface cancellation as
 * a typed outcome instead of an exception. The blobs are opaque JSON (`JsonObject`) so they round-trip
 * through the server functions that mint and verify them.
 */

type PublicKeyOptions = JsonObject;

export type CeremonyResult = { outcome: 'COMPLETED'; response: JsonObject } | { outcome: 'CANCELLED' } | { outcome: 'UNSUPPORTED' };

export function isWebauthnSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}

const isAbort = (error: unknown): boolean => error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError');

export async function registerPasskey(options: PublicKeyOptions): Promise<CeremonyResult> {
  if (!isWebauthnSupported()) return { outcome: 'UNSUPPORTED' };
  try {
    const response = await startRegistration({ optionsJSON: options as never });
    return { outcome: 'COMPLETED', response: response as unknown as JsonObject };
  } catch (error) {
    if (isAbort(error)) return { outcome: 'CANCELLED' };
    throw error;
  }
}

export async function assertPasskey(options: PublicKeyOptions): Promise<CeremonyResult> {
  if (!isWebauthnSupported()) return { outcome: 'UNSUPPORTED' };
  try {
    const response = await startAuthentication({ optionsJSON: options as never });
    return { outcome: 'COMPLETED', response: response as unknown as JsonObject };
  } catch (error) {
    if (isAbort(error)) return { outcome: 'CANCELLED' };
    throw error;
  }
}
