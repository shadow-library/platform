import { describe, expect, it, mock } from 'bun:test';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { constraintErrorMap } from '@server/database/database.constants';
import { LayoutService, type TemplateEngineService, type TemplateResolverService } from '@modules/template';

import { postgresError, rejectionCode, scriptedPostgres, step } from '../fixtures/scripted-postgres';

const LAYOUT = { id: 3n, layoutKey: 'default' };
const LAYOUT_DRAFT = { id: 30n, layoutId: LAYOUT.id, version: 2, status: 'DRAFT', body: '<html>{{ content }}</html>', notes: null, editedBy: null };

function createLayoutService(results: unknown[]) {
  const postgres = scriptedPostgres(results);
  const resolver = { publishedPartials: () => Promise.resolve({}), invalidateLayouts: mock(() => undefined) };
  const engine = { render: () => Promise.resolve({ subject: null, body: '' }) } as unknown as TemplateEngineService;
  const service = new LayoutService(new FakeDatabaseService({ postgres: postgres.db, constraintErrorMap }), resolver as unknown as TemplateResolverService, engine);
  return { ...postgres, resolver, service };
}

describe('LayoutService', () => {
  it('should update the draft found under the lock instead of opening a second one', async () => {
    const { service, calls } = createLayoutService([[LAYOUT], LAYOUT_DRAFT, [LAYOUT_DRAFT]]);

    await service.saveDraft(LAYOUT.id, { body: '<html>{{ content }}</html>' });

    expect(calls.every(call => call.inTransaction)).toBe(true);
    expect(step(calls[0], 'for')).toEqual(['no key update']);
    expect(calls.map(call => call.root)).toEqual(['select', 'query.layoutVersions.findFirst', 'update']);
  });

  it('should map a draft unique-index violation to TPL_PUB_004 instead of an internal error', async () => {
    const { service } = createLayoutService([[LAYOUT], undefined, [{ value: 1 }], postgresError('layout_versions_layout_id_draft_unique')]);

    expect(await rejectionCode(service.saveDraft(LAYOUT.id, { body: '<html/>' }))).toBe('TPL_PUB_004');
  });

  it('should refuse with TPL_PUB_005 when the draft body changed after the render gate', async () => {
    const { service, calls } = createLayoutService([LAYOUT, LAYOUT_DRAFT, [LAYOUT], { ...LAYOUT_DRAFT, body: '<html>{{ broken </html>' }]);

    expect(await rejectionCode(service.publishLayout(LAYOUT.id))).toBe('TPL_PUB_005');
    expect(calls.some(call => call.root === 'update')).toBe(false);
  });

  it('should archive then promote under the lock and drop the layout cache', async () => {
    const { service, calls, resolver } = createLayoutService([LAYOUT, LAYOUT_DRAFT, [LAYOUT], LAYOUT_DRAFT, [], [{ ...LAYOUT_DRAFT, status: 'PUBLISHED' }]]);

    await service.publishLayout(LAYOUT.id);

    const updates = calls.filter(call => call.root === 'update');
    expect(updates.every(call => call.inTransaction)).toBe(true);
    expect(updates.map(call => (step(call, 'set')?.[0] as { status: string }).status)).toEqual(['ARCHIVED', 'PUBLISHED']);
    expect(resolver.invalidateLayouts).toHaveBeenCalledTimes(1);
  });
});
