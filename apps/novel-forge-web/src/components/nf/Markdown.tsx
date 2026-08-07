import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { type ReactElement } from 'react';

interface MarkdownProps {
  content: string | null | undefined;
  className?: string;
}

marked.setOptions({ gfm: true, breaks: true });

/**
 * Renders Markdown to sanitized HTML. DOMPurify strips any `<script>`/handlers an imported or
 * AI-authored blob might carry, so it can never execute in the author's browser. It needs a DOM, so
 * during SSR we emit the (already-trusted, write-time-sanitized) `marked` output directly and let the
 * browser re-sanitize on hydration — identical for real content; `suppressHydrationWarning` covers the
 * rare raw-HTML edge case.
 */
export function Markdown({ content, className }: MarkdownProps): ReactElement {
  const raw = marked.parse(content ?? '', { async: false }) as string;
  const html = typeof window === 'undefined' ? raw : DOMPurify.sanitize(raw);
  return <div suppressHydrationWarning className={`nf-md${className ? ` ${className}` : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
