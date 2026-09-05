export const IMAGE_REF_PATTERN = /^[0-9a-f]{64}\.[a-z0-9]+$/;

const REJECTED_EXTENSIONS = new Set(['svg']);

/**
 * A stored image ref must be a content address exactly as `@shadow-library/modules`' `StorageService`
 * mints them — `<sha256hex>.<ext>` — so a crafted ref cannot walk out of the bucket key space, and an
 * `svg` ref never resolves to a URL: an SVG served from the storage origin is stored XSS there.
 */
export function isImageRef(ref: string | null | undefined): ref is string {
  if (!ref || !IMAGE_REF_PATTERN.test(ref)) return false;
  const ext = ref.slice(ref.lastIndexOf('.') + 1);
  return !REJECTED_EXTENSIONS.has(ext);
}
