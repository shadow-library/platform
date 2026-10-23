const IMAGE_REF_PATTERN = /^[0-9a-f]{64}\.[a-z0-9]+$/;

const REJECTED_EXTENSIONS = new Set(['svg']);

/** Must match the `<sha256hex>.<ext>` refs `StorageService` mints, so a crafted ref cannot escape the bucket; `svg` is refused as stored XSS from the storage origin. */
export function isImageRef(ref: string | null | undefined): ref is string {
  if (!ref || !IMAGE_REF_PATTERN.test(ref)) return false;
  const ext = ref.slice(ref.lastIndexOf('.') + 1);
  return !REJECTED_EXTENSIONS.has(ext);
}
