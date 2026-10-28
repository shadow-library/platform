import { Marked, Renderer, type Token } from 'marked';
import { renderChapterMarkdown } from '@shadow-library/sdk';

const SYSTEM_FENCE = /^system(?:\s|$)/i;

export function isSystemPanel(token: { type: string; lang?: string }): boolean {
  return token.type === 'code' && SYSTEM_FENCE.test(token.lang ?? '');
}

/** Prose renders as plain `marked`, so the reader's `<del>`/`<ins>` marks pass through; panels and tables take the markup readers get from the shared renderer. */
const readerMarked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    code(token) {
      return isSystemPanel(token) ? renderChapterMarkdown(token.raw) : false;
    },
    table(token) {
      return `<div class="chapter-table">${Renderer.prototype.table.call(this, token)}</div>\n`;
    },
  },
});

export function lexChapter(markdown: string): Token[] {
  return readerMarked.lexer(markdown);
}

export function renderChapterTokens(tokens: Token[]): string {
  return readerMarked.parser(tokens);
}

export function containsTable(markdown: string): boolean {
  let found = false;
  readerMarked.walkTokens(lexChapter(markdown), token => {
    found ||= token.type === 'table';
  });
  return found;
}
