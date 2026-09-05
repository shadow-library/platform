import { marked, type Token, type Tokens } from 'marked';

const DANGEROUS_URL_SCHEME = /^(?:javascript|vbscript|data):/;

const NAMED_ENTITIES: Record<string, string> = { colon: ':', tab: '\t', newline: '\n', sol: '/', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// The browser decodes entities in an `href`/`src` attribute, so `javascript&colon;` and `java&#115;cript:`
// reach execution unless the scheme test runs against the decoded URL.
function decodeEntities(input: string): string {
  return input.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);?/g, (match, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function isDangerousUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const stripped = Array.from(decodeEntities(url), ch => ((ch.codePointAt(0) ?? 0) <= 0x20 ? '' : ch)).join('');
  return DANGEROUS_URL_SCHEME.test(stripped.toLowerCase());
}

function escapeHtml(raw: string): string {
  return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function childrenOf(token: Token): Token[] | null {
  if (token.type === 'list') return (token as Tokens.List).items;
  if (token.type === 'table') {
    const table = token as Tokens.Table;
    return [...table.header, ...table.rows.flat()].flatMap(cell => cell.tokens);
  }
  return (token as Tokens.Generic).tokens ?? null;
}

function renderToken(token: Token): string {
  if (token.type === 'html') return escapeHtml(token.raw);
  const linkish = token as Tokens.Link | Tokens.Image;
  if ((token.type === 'link' || token.type === 'image') && isDangerousUrl(linkish.href)) return escapeHtml(linkish.text ?? '');
  const children = childrenOf(token);
  if (children && children.length > 0) return rebuild(token.raw, children);
  return token.raw;
}

// marked strips syntax markers off some containers (blockquote `>`, nested-list indent), so a child's
// `raw` is not always a substring of its parent's; a child that cannot be located returns the segment
// untouched rather than corrupted, leaving its embedded HTML to the render-time sanitizer.
function rebuild(segment: string, tokens: Token[]): string {
  let out = '';
  let cursor = 0;
  for (const token of tokens) {
    const at = segment.indexOf(token.raw, cursor);
    if (at === -1) return segment;
    out += segment.slice(cursor, at) + renderToken(token);
    cursor = at + token.raw.length;
  }
  return out + segment.slice(cursor);
}

export function sanitizeMarkdown(content: string): string;
export function sanitizeMarkdown(content: string | null | undefined): string | null | undefined;
export function sanitizeMarkdown(content: string | null | undefined): string | null | undefined {
  if (!content) return content;
  return rebuild(content, marked.lexer(content, { gfm: true, breaks: true }));
}
