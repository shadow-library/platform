import DOMPurify from 'dompurify';

// Defense in depth: strip dangerous HTML from the Markdown source before it is persisted, so the stored
// manuscript stays clean regardless of where the prose came from.
export function sanitizeSource(md: string): string {
  return DOMPurify.sanitize(md);
}
