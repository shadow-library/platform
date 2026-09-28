import { describe, expect, it } from 'bun:test';
import { AppError } from '@shadow-library/common';
import { type ContextService } from '@shadow-library/fastify';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { AppErrorCode } from '@server/classes';
import { type PublishAuditService } from '@modules/publish/publish-audit.service';
import { type NovelUpsertBody } from '@modules/publish/publish.dto';
import { PublishService } from '@modules/publish/publish.service';

import { type ChainCall, scriptedPostgres, type ScriptedPostgres } from '../scripted-postgres';

const SLUG = 'the-novel';
const CALLER = { sub: 'forge-service', clientId: 'forge' };
const SLUG_TAKEN = { code: 'ERR_POSTGRES_SERVER_ERROR', constraint: 'novels_slug_unique' };

const audit = { record: () => Promise.resolve(), markRecorded: () => undefined } as unknown as PublishAuditService;
const context = { getAuthPrincipalOrNull: () => CALLER } as unknown as ContextService;

const BODY: NovelUpsertBody = { sourceRef: 'project-1', title: 'The Novel', visibility: 'PUBLIC', revision: 1 };

function novelRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7n,
    slug: SLUG,
    sourceClientId: CALLER.clientId,
    sourceRef: BODY.sourceRef,
    publishToken: null,
    title: BODY.title,
    originalAuthor: null,
    blurb: null,
    coverPath: null,
    genres: [],
    tags: [],
    sexualContent: null,
    violence: null,
    darkContent: null,
    status: 'live',
    visibility: BODY.visibility,
    revision: BODY.revision,
    ...overrides,
  };
}

/**
 * A concurrent first push of the same novel commits right after this push's first read: every later read sees the winner's row, and an
 * insert collides with it on the slug index, exactly as Postgres answers under READ COMMITTED.
 */
function racedByConcurrentFirstPush(winner: Record<string, unknown>): ScriptedPostgres {
  let committed = false;
  return scriptedPostgres((call: ChainCall) => {
    if (call.root === 'insert') throw Object.assign(new Error('duplicate key value violates unique constraint'), SLUG_TAKEN);
    if (call.root !== 'select') return [];
    const rows = committed ? [winner] : [];
    committed = true;
    return rows;
  });
}

function service(postgres: ScriptedPostgres): PublishService {
  const database = new FakeDatabaseService({ postgres: postgres.client, constraintErrorMap: { novels_slug_unique: AppErrorCode.WBN_010.create() } });
  return new PublishService(database, audit, context);
}

describe('PublishService', () => {
  describe('upsertNovel', () => {
    it("should resolve the loser of two concurrent first pushes to the winner's row, never WBN_010", async () => {
      const result = await service(racedByConcurrentFirstPush(novelRow())).upsertNovel(SLUG, BODY);

      expect(result).toMatchObject({ outcome: 'noop', novelId: 7n });
    });

    it('should refuse a slug held by another publisher with WBN_010', async () => {
      const error = await service(scriptedPostgres([[novelRow({ sourceClientId: 'other-publisher' })]]))
        .upsertNovel(SLUG, BODY)
        .catch((err: unknown) => err);

      expect(AppError.is(error, AppErrorCode.WBN_010)).toBe(true);
    });

    it('should refuse a slug held by another novel of the same publisher with WBN_010', async () => {
      const error = await service(scriptedPostgres([[novelRow({ sourceRef: 'project-2' })]]))
        .upsertNovel(SLUG, BODY)
        .catch((err: unknown) => err);

      expect(AppError.is(error, AppErrorCode.WBN_010)).toBe(true);
    });

    it('should rename its own novel when it arrives under a new slug', async () => {
      const postgres = scriptedPostgres([[novelRow({ slug: 'old-slug' })]]);
      const result = await service(postgres).upsertNovel(SLUG, BODY);

      expect(result.outcome).toBe('applied');
      expect(postgres.calls.some(call => call.root === 'update')).toBe(true);
    });
  });
});
