import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

import { type JsonObject } from '@/types';

/** The server speaks @simplewebauthn's base64url JSON format, so the browser package does all encoding; cancellation is a typed outcome, not an exception. */

type PublicKeyOptions = JsonObject;

export type CeremonyResult = { outcome: 'COMPLETED'; response: JsonObject } | { outcome: 'CANCELLED' } | { outcome: 'UNSUPPORTED' };

function isWebauthnSupported(): boolean {
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
