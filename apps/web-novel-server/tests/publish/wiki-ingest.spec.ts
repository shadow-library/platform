import { describe, expect, it } from 'bun:test';
import { type ContextService } from '@shadow-library/fastify';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { type PublishAuditService } from '@modules/publish/publish-audit.service';
import { type WikiEntryUpsertBody } from '@modules/publish/wiki-ingest.dto';
import { WikiIngestService } from '@modules/publish/wiki-ingest.service';

import { scriptedPostgres, type ScriptedPostgres, stepArgs } from '../scripted-postgres';

const NOVEL = { id: 7n, slug: 'novel', sourceClientId: 'forge' };
const IMAGE_REF = `${'a'.repeat(64)}.webp`;

const audit = { record: () => Promise.resolve(), markRecorded: () => undefined } as unknown as PublishAuditService;
const context = { getAuthPrincipalOrNull: () => ({ sub: 'forge-service', clientId: 'forge' }) } as unknown as ContextService;

function body(overrides: Partial<WikiEntryUpsertBody> = {}): WikiEntryUpsertBody {
  return { type: 'character', name: 'Amara', firstVisibleOrdinal: 1, contentHash: 'hash', revision: 1, facets: [], images: [], ...overrides };
}

async function upsert(postgres: ScriptedPostgres, input: WikiEntryUpsertBody): Promise<string> {
  const service = new WikiIngestService(new FakeDatabaseService({ postgres: postgres.client }), audit, context);
  const result = await service.upsertEntry('novel', 'amara', input);
  return result.outcome;
}

function insertedEntry(postgres: ScriptedPostgres): Record<string, unknown> {
  return stepArgs(
    postgres.calls.find(call => call.root === 'insert'),
    'values',
  ) as Record<string, unknown>;
}

describe('WikiIngestService', () => {
  describe('the headline gate', () => {
    it('should store a gated headline only in the gated column, leaving image_ref null', async () => {
      const postgres = scriptedPostgres([[NOVEL], [], [{ id: 1n }]]);
      await upsert(postgres, body({ imageRef: IMAGE_REF, imageVisibleFromOrdinal: 50 }));

      expect(insertedEntry(postgres)).toMatchObject({ imageRef: null, gatedImageRef: IMAGE_REF, imageVisibleFromOrdinal: 50 });
    });

    it('should show no portrait to reader code that predates the gate and reads only image_ref', async () => {
      const postgres = scriptedPostgres([[NOVEL], [], [{ id: 1n }]]);
      await upsert(postgres, body({ imageRef: IMAGE_REF, imageVisibleFromOrdinal: 50 }));
      const oldReaderRow = { imageRef: insertedEntry(postgres).imageRef as string | null };

      expect(oldReaderRow.imageRef ?? undefined).toBeUndefined();
    });

    it('should store an ungated headline in image_ref with a null gate', async () => {
      const postgres = scriptedPostgres([[NOVEL], [], [{ id: 1n }]]);
      await upsert(postgres, body({ imageRef: IMAGE_REF }));

      expect(insertedEntry(postgres)).toMatchObject({ imageRef: IMAGE_REF, gatedImageRef: null, imageVisibleFromOrdinal: null });
    });

    it('should drop a malformed headline but keep its gate, so the manifest echo never reads as drift', async () => {
      const postgres = scriptedPostgres([[NOVEL], [], [{ id: 1n }]]);
      await upsert(postgres, body({ imageRef: '../escape.webp', imageVisibleFromOrdinal: 50 }));

      expect(insertedEntry(postgres)).toMatchObject({ imageRef: null, gatedImageRef: null, imageVisibleFromOrdinal: 50 });
    });

    it('should no-op the re-push of an entry whose malformed headline was dropped', async () => {
      const stored = { id: 1n, revision: 1, contentHash: 'hash', imageVisibleFromOrdinal: 50 };
      const outcome = await upsert(scriptedPostgres([[NOVEL], [stored]]), body({ imageRef: '../escape.webp', imageVisibleFromOrdinal: 50 }));

      expect(outcome).toBe('noop');
    });

    it('should treat an identical revision, hash and gate as a no-op', async () => {
      const stored = { id: 1n, revision: 1, contentHash: 'hash', imageVisibleFromOrdinal: 50 };
      const postgres = scriptedPostgres([[NOVEL], [stored]]);
      const outcome = await upsert(postgres, body({ imageRef: IMAGE_REF, imageVisibleFromOrdinal: 50 }));

      expect(outcome).toBe('noop');
      expect(postgres.calls.some(call => call.root === 'update')).toBe(false);
    });

    it('should rewrite a stale stored gate under a matching revision and hash', async () => {
      const stored = { id: 1n, revision: 1, contentHash: 'hash', imageVisibleFromOrdinal: 50 };
      const postgres = scriptedPostgres([[NOVEL], [stored]]);
      const outcome = await upsert(postgres, body({ imageRef: IMAGE_REF }));

      expect(outcome).toBe('applied');
      expect(
        stepArgs(
          postgres.calls.find(call => call.root === 'update'),
          'set',
        ),
      ).toMatchObject({ imageVisibleFromOrdinal: null });
    });
  });

  describe('getManifest', () => {
    it('should echo a stored gate and omit an absent one', async () => {
      const rows = [
        { entryKey: 'amara', revision: 2, contentHash: 'a', imageVisibleFromOrdinal: 50 },
        { entryKey: 'boone', revision: 1, contentHash: 'b', imageVisibleFromOrdinal: null },
      ];
      const postgres = scriptedPostgres([[NOVEL], rows]);
      const manifest = await new WikiIngestService(new FakeDatabaseService({ postgres: postgres.client }), audit, context).getManifest('novel');

      expect(manifest).toEqual([
        { entryKey: 'amara', revision: 2, contentHash: 'a', imageVisibleFromOrdinal: 50 },
        { entryKey: 'boone', revision: 1, contentHash: 'b' },
      ]);
    });
  });
});
