import { marked } from 'marked';
import { type ReactElement, useMemo } from 'react';

import { sanitizeHtml } from './sanitize-html';

interface MarkdownProps {
  content: string | null | undefined;
  className?: string;
}

marked.setOptions({ gfm: true, breaks: true });

export function Markdown({ content, className }: MarkdownProps): ReactElement {
  const html = useMemo(() => sanitizeHtml(marked.parse(content ?? '', { async: false }) as string), [content]);
  return <div className={`nf-md${className ? ` ${className}` : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
