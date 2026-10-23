import { describe, expect, it } from 'bun:test';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { TemplateResolverService } from '@modules/template';

import { renderSql, scriptedPostgres, step } from '../fixtures/scripted-postgres';

interface VersionsRelation {
  with: { versions: { orderBy: unknown } };
}

function versionsOrder(results: unknown[], run: (resolver: TemplateResolverService) => Promise<unknown>): Promise<string> {
  const { db, calls } = scriptedPostgres(results);
  const resolver = new TemplateResolverService(new FakeDatabaseService({ postgres: db }));
  return run(resolver).then(() => renderSql((step(calls[0], calls[0]?.root ?? '')?.[0] as VersionsRelation).with.versions.orderBy));
}

describe('TemplateResolverService', () => {
  it('should resolve the highest PUBLISHED template version for a send', async () => {
    const template = { id: 1n, templateKey: 'welcome', isActive: true, channelSettings: [], versions: [] };

    expect(await versionsOrder([template], resolver => resolver.resolveForSend('welcome'))).toBe('"template_versions"."version" desc');
  });

  it('should load the highest PUBLISHED layout version', async () => {
    expect(await versionsOrder([undefined], resolver => resolver.publishedLayoutBody('default'))).toBe('"layout_versions"."version" desc');
  });

  it('should load the highest PUBLISHED version of each partial', async () => {
    expect(await versionsOrder([[]], resolver => resolver.publishedPartials())).toBe('"partial_versions"."version" desc');
  });
});
