export interface BibleDocTitleSource {
  slug: string;
  frontmatter?: Record<string, unknown> | null;
  body?: string | null;
}

const TOP_HEADING = /^#\s+(.+)$/m;

function humaniseSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function authoredTitle(frontmatter: Record<string, unknown> | null | undefined): string | null {
  const title = frontmatter?.['title'];
  return typeof title === 'string' && title.trim() !== '' ? title.trim() : null;
}

/** Frontmatter title first, then the document's first `# ` heading, else the slug read as words. */
export function deriveBibleDocTitle(doc: BibleDocTitleSource): string {
  return authoredTitle(doc.frontmatter) ?? TOP_HEADING.exec(doc.body ?? '')?.[1]?.trim() ?? humaniseSlug(doc.slug);
}

/**
 * The frontmatter to persist for a write: an already-authored title is kept exactly as written, and a
 * document written without one gets the derived title folded in so it stops being recomputed forever.
 */
export function ensureBibleDocTitle(doc: BibleDocTitleSource): Record<string, unknown> {
  if (authoredTitle(doc.frontmatter)) return doc.frontmatter as Record<string, unknown>;
  return { ...(doc.frontmatter ?? {}), title: deriveBibleDocTitle(doc) };
}
