import { describe, expect, it } from 'bun:test';

import { type Publishing } from '@server/database';

import { type WikiEntryProjection } from '@modules/publishing/wiki-projection';
import { WikiPublishingService } from '@modules/publishing/wiki-publishing.service';

import { recordingDb } from '../recording-db';

function ledgerRow(entryKey: string, overrides: Partial<Publishing.WikiPublication> = {}): Publishing.WikiPublication {
  return {
    id: BigInt(entryKey.length),
    projectId: 1n,
    entryKey,
    revision: 1,
    contentHash: `hash-${entryKey}`,
    state: 'pushed',
    error: null,
    attempts: 0,
    ...overrides,
  } as Publishing.WikiPublication;
}

function projection(entryKey: string): WikiEntryProjection {
  return { entryKey, contentHash: `hash-${entryKey}`, payload: {} as never };
}

describe('WikiPublishingService.reconcileLedger', () => {
  it('should tombstone every withdrawn entry in one write', async () => {
    const withdrawn = Array.from({ length: 30 }, (_, index) => ledgerRow(`gone-${'x'.repeat(index)}`));
    const kept = ledgerRow('kept');
    const { db, queries } = recordingDb(() => [], { wikiPublications: { findMany: [kept, ...withdrawn, ledgerRow('already-gone', { state: 'deleted' })] } });
    const service = new WikiPublishingService({ getPostgresClient: () => db } as never);

    await service.reconcileLedger(1n, [projection('kept')]);

    expect(queries).toHaveLength(1);
    expect(queries[0]?.sql).toStartWith('update "wiki_publications" set "state" = $1');
    expect(queries[0]?.params).toEqual(expect.arrayContaining(withdrawn.map(row => row.id)));
    expect(queries[0]?.params).not.toContain(kept.id);
  });

  it('should write nothing when the projection still covers every live entry', async () => {
    const { db, queries } = recordingDb(() => [], { wikiPublications: { findMany: [ledgerRow('kept')] } });
    const service = new WikiPublishingService({ getPostgresClient: () => db } as never);

    await service.reconcileLedger(1n, [projection('kept')]);

    expect(queries).toEqual([]);
  });
});

describe('WikiPublishingService.computeProjections', () => {
  it('should read the bible and the chapter ledger concurrently, outside any transaction', async () => {
    let inFlight = 0;
    let peak = 0;
    const read = async (): Promise<unknown[]> => {
      peak = Math.max(peak, ++inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return [];
    };
    const db = { query: { entities: { findMany: read }, canonFacts: { findMany: read }, chapterPublications: { findMany: read } } };
    const service = new WikiPublishingService({ getPostgresClient: () => db } as never);

    expect(await service.computeProjections(1n, false)).toEqual([]);
    expect(peak).toBe(3);
  });
});
