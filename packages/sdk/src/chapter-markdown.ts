import { Marked, type MarkedExtension, Renderer, type Tokens } from 'marked';

const SAFE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:']);
const SYSTEM_FENCE = /^system(?:\s+(.*))?$/i;
const TABLE_CLASS = 'chapter-table';
const DEFAULT_PANEL_TITLE = 'System';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => HTML_ESCAPES[char] as string);
}

function safeHref(href: string): string | undefined {
  try {
    const url = new URL(href);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Author prose is untrusted: HTML is never a construct, so `<tag>` stays literal text, and only allow-listed links and no images reach the reader. */
const SAFE_CHAPTER_MARKDOWN: MarkedExtension = {
  gfm: true,
  breaks: true,
  tokenizer: {
    html: () => undefined,
    tag: () => undefined,
  },
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      const safe = safeHref(href);
      if (!safe) return label;
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${escapeHtml(safe)}"${titleAttribute} target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
    },
    image({ text, tokens }) {
      return escapeHtml(tokens ? this.parser.parseInline(tokens, this.parser.textRenderer) : text);
    },
    table(token) {
      return `<div class="${TABLE_CLASS}">${Renderer.prototype.table.call(this, token)}</div>\n`;
    },
  },
};

const panelBodyMarked = new Marked(SAFE_CHAPTER_MARKDOWN);

function renderSystemPanel(token: Tokens.Code): string | false {
  const fence = SYSTEM_FENCE.exec(token.lang ?? '');
  if (!fence) return false;
  const title = escapeHtml(fence[1]?.trim() || DEFAULT_PANEL_TITLE);
  const body = panelBodyMarked.parse(token.text, { async: false });
  return `<aside class="chapter-system" aria-label="${title}"><div class="chapter-system__title">${title}</div><div class="chapter-system__body">${body}</div></aside>\n`;
}

const chapterMarked = new Marked(SAFE_CHAPTER_MARKDOWN, { renderer: { code: renderSystemPanel } });

/** Chapter GFM as HTML safe to inject without a DOM sanitizer; ```` ```system <Title> ```` fences become panels and tables are wrapped for scrolling. */
export function renderChapterMarkdown(markdown: string): string {
  return chapterMarked.parse(markdown, { async: false });
}
