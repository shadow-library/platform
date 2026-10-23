import { describe, expect, it } from 'bun:test';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { constraintErrorMap } from '@server/database/database.constants';
import { type TemplateEngineService, type TemplateResolverService, type TemplateService, TemplateVersionService } from '@modules/template';

import { postgresError, rejectionCode, renderSql, type ScriptedPostgres, scriptedPostgres, step } from '../fixtures/scripted-postgres';

const TEMPLATE = { id: 7n, variableSchema: { variables: {} } };
const LOCKED = [{ id: TEMPLATE.id }];
const DRAFT = { id: 70n, templateId: TEMPLATE.id, version: 3, status: 'DRAFT', notes: null, editedBy: null };
const CONTENTS = [{ id: 700n, templateVersionId: DRAFT.id, channel: 'SMS', locale: 'en-ZZ', subject: null, body: 'Hello', layoutKey: null }];
const PUBLISHED = { ...DRAFT, status: 'PUBLISHED' };

function createService(results: unknown[]): ScriptedPostgres & { service: TemplateVersionService } {
  const postgres = scriptedPostgres(results);
  const templateService = { getTemplateOrThrow: () => Promise.resolve(TEMPLATE) } as unknown as TemplateService;
  const resolver = { publishedPartials: () => Promise.resolve({}), publishedLayoutBody: () => Promise.resolve(null) } as unknown as TemplateResolverService;
  const engine = { render: () => Promise.resolve({ subject: null, body: '' }) } as unknown as TemplateEngineService;
  const service = new TemplateVersionService(new FakeDatabaseService({ postgres: postgres.db, constraintErrorMap }), templateService, resolver, engine);
  return { ...postgres, service };
}

describe('TemplateVersionService', () => {
  describe('openDraft', () => {
    it('should lock the template row before reading or writing its versions', async () => {
      const { service, calls } = createService([LOCKED, undefined, [{ value: 2 }], [DRAFT], undefined]);

      await service.openDraft(TEMPLATE.id);

      expect(calls.every(call => call.inTransaction)).toBe(true);
      expect(calls[0]?.root).toBe('select');
      expect(step(calls[0], 'for')).toEqual(['no key update']);
      expect(
        step(
          calls.find(call => call.root === 'insert'),
          'values',
        ),
      ).toEqual([expect.objectContaining({ version: 3, status: 'DRAFT' })]);
    });

    it('should refuse a draft that already exists under the lock with TPL_PUB_004', async () => {
      const { service, calls } = createService([LOCKED, DRAFT]);

      expect(await rejectionCode(service.openDraft(TEMPLATE.id))).toBe('TPL_PUB_004');
      expect(calls.some(call => call.root === 'insert')).toBe(false);
    });

    it('should report a template the lock cannot find as TPL_001', async () => {
      const { service } = createService([[]]);

      expect(await rejectionCode(service.openDraft(TEMPLATE.id))).toBe('TPL_001');
    });

    it('should map a draft unique-index violation to TPL_PUB_004 instead of an internal error', async () => {
      const { service } = createService([LOCKED, undefined, [{ value: 2 }], postgresError('template_versions_template_id_draft_unique')]);

      expect(await rejectionCode(service.openDraft(TEMPLATE.id))).toBe('TPL_PUB_004');
    });
  });

  describe('upsertContent', () => {
    it('should write into the draft found under the lock', async () => {
      const { service, calls } = createService([LOCKED, DRAFT, CONTENTS, []]);

      await service.upsertContent(TEMPLATE.id, { channel: 'SMS', body: 'Hello' });

      expect(calls.every(call => call.inTransaction)).toBe(true);
      expect(step(calls[0], 'for')).toEqual(['no key update']);
      expect(
        step(
          calls.find(call => call.root === 'insert'),
          'values',
        ),
      ).toEqual([expect.objectContaining({ templateVersionId: DRAFT.id })]);
    });
  });

  describe('publishDraft', () => {
    it('should archive the published version and promote the draft only after re-reading both under the lock', async () => {
      const { service, calls } = createService([DRAFT, CONTENTS, LOCKED, DRAFT, CONTENTS, [], [PUBLISHED]]);

      const published = await service.publishDraft(TEMPLATE.id);

      const transactional = calls.filter(call => call.inTransaction);
      expect(published).toBe(PUBLISHED);
      expect(step(transactional[0], 'for')).toEqual(['no key update']);
      expect(transactional.map(call => call.root)).toEqual(['select', 'query.templateVersions.findFirst', 'select', 'update', 'update']);
      expect(transactional.slice(3).map(call => (step(call, 'set')?.[0] as { status: string }).status)).toEqual(['ARCHIVED', 'PUBLISHED']);
    });

    it('should report TPL_PUB_001 when a concurrent publish consumed the draft before the lock was taken', async () => {
      const { service, calls } = createService([DRAFT, CONTENTS, LOCKED, undefined]);

      expect(await rejectionCode(service.publishDraft(TEMPLATE.id))).toBe('TPL_PUB_001');
      expect(calls.some(call => call.root === 'update')).toBe(false);
    });

    it('should refuse with TPL_PUB_005 when the content changed after the render gate', async () => {
      const edited = [{ ...CONTENTS[0], body: 'Hello {{ unchecked }}' }];
      const { service, calls } = createService([DRAFT, CONTENTS, LOCKED, DRAFT, edited]);

      expect(await rejectionCode(service.publishDraft(TEMPLATE.id))).toBe('TPL_PUB_005');
      expect(calls.some(call => call.root === 'update')).toBe(false);
    });

    it('should map a published unique-index violation to TPL_PUB_005 instead of an internal error', async () => {
      const { service } = createService([DRAFT, CONTENTS, LOCKED, DRAFT, CONTENTS, [], postgresError('template_versions_template_id_published_unique')]);

      expect(await rejectionCode(service.publishDraft(TEMPLATE.id))).toBe('TPL_PUB_005');
    });
  });

  describe('rollback', () => {
    it('should take the template lock before computing the next version number', async () => {
      const target = { ...PUBLISHED, version: 1, status: 'ARCHIVED', contents: CONTENTS };
      const { service, calls } = createService([target, LOCKED, [{ value: 3 }], [], [{ ...PUBLISHED, version: 4 }], []]);

      await service.rollback(TEMPLATE.id, 1);

      const transactional = calls.filter(call => call.inTransaction);
      expect(step(transactional[0], 'for')).toEqual(['no key update']);
      expect(step(transactional[1], 'select')).toEqual([expect.objectContaining({ value: expect.anything() })]);
      expect(
        step(
          transactional.find(call => call.root === 'insert'),
          'values',
        ),
      ).toEqual([expect.objectContaining({ version: 4, status: 'PUBLISHED' })]);
    });
  });

  describe('getPublished', () => {
    it('should order PUBLISHED lookups by version descending', async () => {
      const { service, calls } = createService([PUBLISHED]);

      await service.getPublished(TEMPLATE.id);

      expect(renderSql((step(calls[0], calls[0]?.root ?? '')?.[0] as { orderBy: unknown }).orderBy)).toBe('"template_versions"."version" desc');
    });
  });
});
