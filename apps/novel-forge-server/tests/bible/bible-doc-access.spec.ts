import { describe, expect, it } from 'bun:test';

import { bibleDocAccess } from '@modules/ai/context/bible-docs';
import { BibleDocumentService } from '@modules/bible/document/bible-document.service';

const doc = (section: string, slug: string) => ({ section, slug, frontmatter: null, body: 'Some prose here.', updatedAt: new Date(0) });

describe('bibleDocAccess', () => {
  it('should mark planner-only pages as writer-excluded too, the volume pages as writer-excluded alone, and every other page as neither', () => {
    expect(bibleDocAccess({ section: 'project', slug: 'timeline' })).toEqual({ writerExcluded: true, plannerOnly: true });
    expect(bibleDocAccess({ section: 'project', slug: 'open-questions' })).toEqual({ writerExcluded: true, plannerOnly: true });
    expect(bibleDocAccess({ section: 'story_state', slug: 'volume-plan' })).toEqual({ writerExcluded: true, plannerOnly: false });
    expect(bibleDocAccess({ section: 'plot', slug: 'escalation-map' })).toEqual({ writerExcluded: true, plannerOnly: false });
    expect(bibleDocAccess({ section: 'world', slug: 'lamps' })).toEqual({ writerExcluded: false, plannerOnly: false });
  });
});

describe('BibleDocumentService.list', () => {
  it('should carry each page’s writer and planner access on the list item', async () => {
    const rows = [doc('project', 'timeline'), doc('world', 'lamps')];
    const service = new BibleDocumentService({ getPostgresClient: () => ({ query: { bibleDocuments: { findMany: async () => rows } } }) } as never);

    const items = await service.list(7n);

    expect(items.map(item => [item.slug, item.writerExcluded, item.plannerOnly])).toEqual([
      ['timeline', true, true],
      ['lamps', false, false],
    ]);
  });
});
