import { CryptoErrorCode } from './crypto.errors';
import { decodeBase64Url, KEY_LENGTH } from './crypto.utils';
import { type Keyring } from './keyring.types';
import { type KeyringEntry, LocalKeyring } from './local-keyring';

const KID_PATTERN = /^[a-z0-9-]{1,16}$/;

/** Parses `k2:<base64url 32 bytes>,k1:<…>`; the first entry encrypts and every entry decrypts. Errors name the entry by position and never echo the value. */
export function parseKeyring(value: string): Keyring {
  if (typeof value !== 'string' || value.trim() === '') return CryptoErrorCode.KEYRING_INVALID.throw({ reason: 'no entries' });
  const kids = new Set<string>();
  const entries = value.split(',').map((raw, index) => {
    const entry = parseEntry(raw.trim(), index + 1);
    if (kids.has(entry.kid)) CryptoErrorCode.KEYRING_INVALID.throw({ reason: `entry ${index + 1} repeats an earlier key id` });
    kids.add(entry.kid);
    return entry;
  });
  return new LocalKeyring(entries as [KeyringEntry, ...KeyringEntry[]]);
}

function parseEntry(entry: string, position: number): KeyringEntry {
  const separator = entry.indexOf(':');
  if (separator === -1) return CryptoErrorCode.KEYRING_INVALID.throw({ reason: `entry ${position} is not '<kid>:<key>'` });
  const kid = entry.slice(0, separator);
  if (!KID_PATTERN.test(kid)) return CryptoErrorCode.KEYRING_INVALID.throw({ reason: `entry ${position} has a key id outside [a-z0-9-]{1,16}` });
  const key = decodeBase64Url(entry.slice(separator + 1), KEY_LENGTH);
  if (!key) return CryptoErrorCode.KEYRING_INVALID.throw({ reason: `entry ${position} is not ${KEY_LENGTH} bytes of unpadded base64url` });
  return { kid, key };
}
