/**
 * Importing npm packages
 */
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { type ReactElement } from 'react';

/**
 * Defining types
 */
interface MarkdownProps {
  content: string | null | undefined;
  className?: string;
}

/**
 * Declaring the constants
 */

// One GitHub-flavored-Markdown renderer shared by every surface that shows model-authored text —
// chapter prose, chat replies, entity summaries, proposed change bodies — so `**bold**`, lists, and
// tables format the same way instead of leaking their raw marks.
marked.setOptions({ gfm: true, breaks: true });

/**
 * Renders Markdown to sanitized HTML. DOMPurify strips any `<script>`/handlers an imported or
 * AI-authored blob might carry, so it can never execute in the author's browser.
 */
export function Markdown({ content, className }: MarkdownProps): ReactElement {
  const html = DOMPurify.sanitize(marked.parse(content ?? '', { async: false }) as string);
  return <div className={`nf-md${className ? ` ${className}` : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
