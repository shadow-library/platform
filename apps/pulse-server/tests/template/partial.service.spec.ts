import { describe, expect, it, mock } from 'bun:test';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { constraintErrorMap } from '@server/database/database.constants';
import { PartialService, type TemplateResolverService } from '@modules/template';

import { postgresError, rejectionCode, scriptedPostgres, step } from '../fixtures/scripted-postgres';

const PARTIAL = { id: 4n, partialKey: 'footer' };
const PARTIAL_DRAFT = { id: 40n, partialId: PARTIAL.id, version: 5, status: 'DRAFT', body: '<footer/>', notes: null, editedBy: null };

function createPartialService(results: unknown[]) {
  const postgres = scriptedPostgres(results);
  const resolver = { invalidatePartials: mock(() => undefined) };
  const service = new PartialService(new FakeDatabaseService({ postgres: postgres.db, constraintErrorMap }), resolver as unknown as TemplateResolverService);
  return { ...postgres, resolver, service };
}

describe('PartialService', () => {
  it('should publish the draft read under the lock', async () => {
    const { service, calls, resolver } = createPartialService([[PARTIAL], PARTIAL_DRAFT, [], [{ ...PARTIAL_DRAFT, status: 'PUBLISHED' }]]);

    await service.publishPartial(PARTIAL.id);

    expect(calls.every(call => call.inTransaction)).toBe(true);
    expect(step(calls[0], 'for')).toEqual(['no key update']);
    expect(calls.map(call => call.root)).toEqual(['select', 'query.partialVersions.findFirst', 'update', 'update']);
    expect(resolver.invalidatePartials).toHaveBeenCalledTimes(1);
  });

  it('should report TPL_PRT_001 when the lock finds no partial', async () => {
    const { service } = createPartialService([[]]);

    expect(await rejectionCode(service.publishPartial(PARTIAL.id))).toBe('TPL_PRT_001');
  });

  it('should map a published unique-index violation to TPL_PUB_005 instead of an internal error', async () => {
    const { service } = createPartialService([[PARTIAL], PARTIAL_DRAFT, [], postgresError('partial_versions_partial_id_published_unique')]);

    expect(await rejectionCode(service.publishPartial(PARTIAL.id))).toBe('TPL_PUB_005');
  });
});
