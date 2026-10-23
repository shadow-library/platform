import { decodeBase64Url, ENVELOPE_ALGORITHM, ENVELOPE_VERSION, IV_LENGTH, TAG_LENGTH } from './crypto.utils';

/** Stored as one JSON value; every binary field is unpadded base64url. */
export interface Envelope {
  v: 1;
  alg: 'A256GCM';
  kid: string;
  /** The data key as the keyring wrapped it; for the env keyring `iv(12) | ciphertext(32) | tag(16)` */
  dek: string;
  iv: string;
  ct: string;
  tag: string;
}

const ENVELOPE_FIELDS = ['alg', 'ct', 'dek', 'iv', 'kid', 'tag', 'v'];
/** Wider than the env keyring's kids so a KMS key id or ARN fits, yet bounded and free of control characters because errors and logs print it. */
const KID_PATTERN = /^[A-Za-z0-9._:/-]{1,128}$/;

export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.length !== ENVELOPE_FIELDS.length || keys.some((key, index) => key !== ENVELOPE_FIELDS[index])) return false;
  const { v, alg, kid, dek, iv, ct, tag } = value as Record<string, unknown>;
  if (v !== ENVELOPE_VERSION || alg !== ENVELOPE_ALGORITHM) return false;
  if (typeof kid !== 'string' || !KID_PATTERN.test(kid)) return false;
  if (typeof dek !== 'string' || dek.length === 0 || !decodeBase64Url(dek)) return false;
  if (typeof iv !== 'string' || !decodeBase64Url(iv, IV_LENGTH)) return false;
  if (typeof tag !== 'string' || !decodeBase64Url(tag, TAG_LENGTH)) return false;
  return typeof ct === 'string' && decodeBase64Url(ct) !== null;
}
