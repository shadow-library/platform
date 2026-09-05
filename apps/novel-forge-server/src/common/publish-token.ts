import { randomBytes } from 'node:crypto';

export const PUBLISH_TOKEN_BYTES = 32;

/** A 256-bit reader publish token as lowercase hex — matches the reader's `^[0-9a-f]{64}$` binding format. */
export function generatePublishToken(): string {
  return randomBytes(PUBLISH_TOKEN_BYTES).toString('hex');
}
