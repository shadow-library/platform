import { marked } from 'marked';
import { type ReactElement, useMemo } from 'react';
import { renderChapterMarkdown } from '@shadow-library/sdk';

import { sanitizeHtml } from './sanitize-html';

interface MarkdownProps {
  content: string | null | undefined;
  className?: string;
}

marked.setOptions({ gfm: true, breaks: true });

function MarkdownHtml({ html, className }: { html: string; className?: string }): ReactElement {
  return <div className={`nf-md${className ? ` ${className}` : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Markdown({ content, className }: MarkdownProps): ReactElement {
  const html = useMemo(() => sanitizeHtml(marked.parse(content ?? '', { async: false }) as string), [content]);
  return <MarkdownHtml html={html} className={className} />;
}

export function ChapterMarkdown({ content, className }: MarkdownProps): ReactElement {
  const html = useMemo(() => sanitizeHtml(renderChapterMarkdown(content ?? '')), [content]);
  return <MarkdownHtml html={html} className={className} />;
}
