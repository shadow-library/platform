import DOMPurify, { type WindowLike } from 'dompurify';

export function createHtmlSanitizer(windowRef: WindowLike): (dirty: string) => string {
  const purify = DOMPurify(windowRef);
  return dirty => purify.sanitize(dirty);
}

async function serverWindow(): Promise<WindowLike> {
  const { JSDOM } = await import('jsdom');
  return new JSDOM('').window as unknown as WindowLike;
}

// bun test leaves import.meta.env.SSR undefined; `!== false` keeps jsdom out of the client bundle while still loading it there
const sanitize = createHtmlSanitizer(import.meta.env.SSR !== false ? await serverWindow() : (globalThis.window as unknown as WindowLike));

export function sanitizeHtml(dirty: string): string {
  return sanitize(dirty);
}
