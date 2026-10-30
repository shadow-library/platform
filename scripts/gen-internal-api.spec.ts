import { describe, expect, it } from 'bun:test';

import { type OpenApiDocument } from './gen-api-types.ts';
import { cutContract } from './gen-internal-api.ts';

const ref = (name: string): { $ref: string } => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown): unknown => ({ content: { 'application/json': { schema } } });

const DOCUMENT: OpenApiDocument = {
  openapi: '3.0.3',
  info: { title: 'reader', version: '1' },
  paths: {
    '/internal/novels/{slug}': { put: { requestBody: json(ref('NovelBody')), responses: { 200: json(ref('Result')) } } as never },
    '/internal/novels/{slug}/manifest': { get: { responses: { 200: json(ref('Manifest')) } } as never },
    '/api/v1/novels': { get: { responses: { 200: json(ref('PublicNovel')) } } as never },
  },
  components: {
    schemas: {
      NovelBody: { type: 'object', properties: { genre: ref('Genre') } },
      Genre: { type: 'string', enum: ['Action'] },
      Result: { type: 'object' },
      Manifest: { type: 'array', items: ref('ManifestItem') },
      ManifestItem: { type: 'object' },
      PublicNovel: { type: 'object', properties: { genre: ref('Genre') } },
    },
  },
};

describe('cutContract', () => {
  it('should keep the prefixed paths and every schema they reach, transitively', () => {
    const cut = cutContract(DOCUMENT, { name: 'web-novel', server: 'apps/web-novel-server', paths: ['/internal/novels/*'] });

    expect(Object.keys(cut.paths ?? {})).toEqual(['/internal/novels/{slug}', '/internal/novels/{slug}/manifest']);
    expect(Object.keys(cut.components?.schemas ?? {})).toEqual(['Genre', 'Manifest', 'ManifestItem', 'NovelBody', 'Result']);
  });

  it('should match a path without a wildcard exactly', () => {
    const cut = cutContract(DOCUMENT, { name: 'web-novel', server: 'apps/web-novel-server', paths: ['/internal/novels/{slug}'] });
    expect(Object.keys(cut.paths ?? {})).toEqual(['/internal/novels/{slug}']);
  });

  it('should fail when a contract path no longer exists on the server', () => {
    expect(() => cutContract(DOCUMENT, { name: 'web-novel', server: 'apps/web-novel-server', paths: ['/internal/gone'] })).toThrow('matches no path');
  });

  it('should fail when a kept path reaches an undefined schema', () => {
    const broken = { ...DOCUMENT, components: { schemas: { NovelBody: { type: 'object' } } } };
    expect(() => cutContract(broken, { name: 'web-novel', server: 'apps/web-novel-server', paths: ['/internal/novels/{slug}'] })).toThrow('does not define');
  });
});
