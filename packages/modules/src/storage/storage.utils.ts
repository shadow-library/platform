/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/json': 'json',
  'text/plain': 'txt',
};

const EXT_TO_CONTENT_TYPE: Record<string, string> = Object.entries(CONTENT_TYPE_TO_EXT).reduce<Record<string, string>>(
  (map, [ct, ext]) => {
    map[ext] = ct;
    return map;
  },
  { jpeg: 'image/jpeg' },
);

/** Lowercase hex SHA-256 of the bytes — the content address a ref is built from. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Maps a MIME type to a bare ref extension (no dot); unknown types degrade to their sanitized subtype, then `bin`. */
export function extFromContentType(contentType: string): string {
  const normalized = (contentType.split(';', 1)[0] ?? '').trim().toLowerCase();
  const known = CONTENT_TYPE_TO_EXT[normalized];
  if (known) return known;
  const subtype = normalized.split('/')[1]?.replace(/[^a-z0-9]/g, '') ?? '';
  return subtype || 'bin';
}

/** Best-effort MIME type for a ref, read from its extension; unknown extensions degrade to `application/octet-stream`. */
export function contentTypeFromRef(ref: string): string {
  const ext = ref.slice(ref.lastIndexOf('.') + 1).toLowerCase();
  return EXT_TO_CONTENT_TYPE[ext] ?? 'application/octet-stream';
}
