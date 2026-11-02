import { describe, expect, it } from 'bun:test';

import { drizzle } from 'drizzle-orm/bun-sql';

import { schema } from '@server/database';

import { loadArtifactStates } from '@modules/refinement/artifact-state';
import { loadBaselineTexts } from '@modules/refinement/proposal-warnings';

interface RenderedRead {
  toSQL(): { sql: string };
}

type Reads = Record<string, { findFirst(config: unknown): RenderedRead; findMany(config: unknown): RenderedRead }>;

/** Renders every relational read as the SQL it would send, keyed by table, and answers it from `rows`. */
function renderingDb(rows: Record<string, Record<string, unknown>[]> = {}) {
  const reads = drizzle.mock({ schema }).query as unknown as Reads;
  const sent = new Map<string, string>();
  const query = new Proxy({} as Record<string, unknown>, {
    get: (_target, table: string) => ({
      findFirst: async (config: unknown) => {
        sent.set(table, reads[table]?.findFirst(config).toSQL().sql ?? '');
        return rows[table]?.[0];
      },
      findMany: async (config: unknown) => {
        sent.set(table, reads[table]?.findMany(config).toSQL().sql ?? '');
        return rows[table] ?? [];
      },
    }),
  });
  return { db: { query } as never, sent };
}

describe('loadArtifactStates', () => {
  const REFS = ['premise', 'doc:characters/mara', 'volume:v1', 'chapter:3', 'draft:3'];

  it('should read only the versioning columns of documents, volumes and plans, never their bodies', async () => {
    const { db, sent } = renderingDb();

    await loadArtifactStates(db, 1n, REFS);

    for (const table of ['bibleDocuments', 'volumes', 'briefs']) expect(sent.get(table)).not.toContain('"body"');
    expect(sent.get('briefs')).not.toContain('"scenes"');
    expect(sent.get('drafts')).toContain('"body"');
    expect(sent.get('drafts')).not.toContain('"state"');
    expect(sent.get('projects')).toContain('"premise"');
    expect(sent.get('projects')).not.toContain('"config"');
  });

  it('should state each record from the columns it reads', async () => {
    const { db } = renderingDb({
      bibleDocuments: [{ section: 'characters', slug: 'mara', revision: 4, contentHash: 'doc-hash' }],
      volumes: [{ volumeKey: 'v1', revision: 2, contentHash: 'volume-hash' }],
      briefs: [{ chapter: 3, revision: 7, contentHash: 'brief-hash' }],
    });

    const states = await loadArtifactStates(db, 1n, REFS);

    expect(states).toMatchObject({
      'doc:characters/mara': { exists: true, revision: 4, contentHash: 'doc-hash' },
      'volume:v1': { exists: true, revision: 2, contentHash: 'volume-hash' },
      'chapter:3': { exists: true, revision: 7, contentHash: 'brief-hash' },
      'draft:3': { exists: false },
    });
  });
});

describe('loadBaselineTexts', () => {
  it('should read only the text a negation check compares, leaving a plan’s scenes and a draft’s state unread', async () => {
    const { db, sent } = renderingDb();
    const ops = [
      { op: 'brief.update', chapter: 3, body: 'New plan.' },
      { op: 'draft.update', chapter: 3, body: 'New prose.' },
    ] as never;

    await loadBaselineTexts(db, 1n, ops);

    expect(sent.get('briefs')).toContain('"body"');
    expect(sent.get('briefs')).not.toContain('"scenes"');
    expect(sent.get('drafts')).not.toContain('"state"');
  });
});
