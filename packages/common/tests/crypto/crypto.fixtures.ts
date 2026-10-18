import { expect } from 'bun:test';

import { AppError } from '@lib/errors';

export const CONTEXT = 'synapse:provider_credentials:00000000-0000-4000-8000-000000000001:secret';

export const KEY_ONE = Buffer.alloc(32, 1).toString('base64url');
export const KEY_TWO = Buffer.alloc(32, 2).toString('base64url');

export const KAT_MASTER_KEY = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
export const KAT_DEK = Buffer.from(Array.from({ length: 32 }, (_, index) => 0xa0 + index));
export const KAT_WRAP_IV_BYTE = 0x11;
export const KAT_DATA_IV_BYTE = 0x22;
export const KAT_PLAINTEXT = 'sk-or-v1-known-answer';
export const KAT_ENVELOPE = {
  v: 1,
  alg: 'A256GCM',
  kid: 'k1',
  dek: 'ERERERERERERERERIME2HByliQnA1o-p7Yi-FVOuMhahhCbelWIhvZTefe2XoxqUNzXa5DXVwe0yovGC',
  iv: 'IiIiIiIiIiIiIiIi',
  ct: 'xtRhdHdbo3t5RYIgSQclswqNCKTt',
  tag: 'Vkjb831VPoNauZXAi-4hfQ',
} as const;

export function flipFirstByte(field: string): string {
  const bytes = Buffer.from(field, 'base64url');
  bytes[0] = (bytes[0] ?? 0) ^ 0x01;
  return bytes.toString('base64url');
}

export async function rejectionOf(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => expect.unreachable(),
    (reason: unknown) => reason,
  );
  if (!AppError.is(error)) return expect.unreachable();
  return error;
}

export function errorOf(fn: () => unknown): AppError {
  try {
    fn();
  } catch (error) {
    if (AppError.is(error)) return error;
  }
  return expect.unreachable();
}
