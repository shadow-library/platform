/**
 * A short fingerprint of a text, computed the same way by the server and the browser: 32-bit FNV-1a over UTF-16 code units, as eight hex
 * digits. It tells a changed text from an unchanged one without shipping the text; it is not a security hash.
 */
export function textDigest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
