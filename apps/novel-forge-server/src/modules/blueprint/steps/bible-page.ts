import { and, eq } from 'drizzle-orm';

import { type Bible, type DbExecutor, schema } from '@server/database';

export interface PageSection {
  heading: string;
  body: string;
}

export interface PageRef {
  section: Bible.Section;
  slug: string;
}

const HEADING = /^##\s+(.+?)\s*$/;

const normalise = (heading: string): string => heading.trim().toLowerCase();

function splitPage(body: string): { lead: string; sections: PageSection[] } {
  const sections: PageSection[] = [];
  const lead: string[] = [];
  let open: PageSection | null = null;
  for (const line of body.split('\n')) {
    const match = HEADING.exec(line);
    if (match) {
      open = { heading: match[1] as string, body: '' };
      sections.push(open);
      continue;
    }
    if (open) open.body = open.body ? `${open.body}\n${line}` : line;
    else lead.push(line);
  }
  return { lead: lead.join('\n').trim(), sections: sections.map(section => ({ ...section, body: section.body.trim() })) };
}

function render(lead: string, sections: PageSection[]): string {
  return [lead, ...sections.filter(section => section.body).map(section => `## ${section.heading}\n\n${section.body}`)].filter(Boolean).join('\n\n');
}

/**
 * One Story Bible page written by more than one step. The step that owns the page writes its title and lead; every other step owns
 * its own `##` sections, and merging by heading rather than rewriting the body is what stops a later lock erasing a section it never
 * asked about. A `null` lead keeps whatever lead the page has, and a section handed an empty body is removed.
 */
export function upsertPageSections(current: string | null, title: string, lead: string | null, sections: PageSection[]): string {
  const parsed = splitPage(current ?? '');
  const merged = [...parsed.sections];
  for (const section of sections) {
    const at = merged.findIndex(existing => normalise(existing.heading) === normalise(section.heading));
    if (at === -1) merged.push(section);
    else merged[at] = section;
  }
  const head = lead === null ? parsed.lead || `# ${title}` : [`# ${title}`, lead].filter(Boolean).join('\n\n');
  return render(head, merged);
}

export async function loadPageBody(executor: Pick<DbExecutor, 'select'>, projectId: bigint, page: PageRef): Promise<string | null> {
  const [row] = await executor
    .select({ body: schema.bibleDocuments.body })
    .from(schema.bibleDocuments)
    .where(and(eq(schema.bibleDocuments.projectId, projectId), eq(schema.bibleDocuments.section, page.section), eq(schema.bibleDocuments.slug, page.slug)))
    .limit(1);
  return row?.body ?? null;
}
