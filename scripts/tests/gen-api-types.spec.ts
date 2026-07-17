/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { type OpenApiDocument, buildTypeAliases, transformOpenApiDocument, validateOpenApiDocument } from '@lib/gen-api-types';
import { ShadowScriptsError } from '@lib/utils';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('gen-api-types', () => {
  describe('validateOpenApiDocument', () => {
    it('should accept a document with a paths object', () => {
      const document = { paths: {} };
      expect(validateOpenApiDocument(document, 'http://x')).toBe(document as unknown as OpenApiDocument);
    });

    it('should reject a non-object', () => {
      expect(() => validateOpenApiDocument('nope', 'http://x')).toThrow(ShadowScriptsError);
      expect(() => validateOpenApiDocument(null, 'http://x')).toThrow(ShadowScriptsError);
    });

    it('should reject an object without "paths"', () => {
      expect(() => validateOpenApiDocument({ openapi: '3.0.0' }, 'http://x')).toThrow(ShadowScriptsError);
    });
  });

  describe('transformOpenApiDocument', () => {
    it('should rewrite operationIds to method_path and never mutate the input', () => {
      const input: OpenApiDocument = {
        paths: {
          '/users/{id}': { get: { operationId: 'list', parameters: [] } },
        },
      };
      const output = transformOpenApiDocument(input);

      expect(output.paths?.['/users/{id}']?.get?.operationId).toBe('get_users_id');
      expect(input.paths?.['/users/{id}']?.get?.operationId).toBe('list');
    });

    it('should give every operation a distinct id even when source operationIds collide', () => {
      const input: OpenApiDocument = {
        paths: {
          '/a': { get: { operationId: 'list' } },
          '/b': { get: { operationId: 'list' } },
        },
      };
      const output = transformOpenApiDocument(input);
      expect(output.paths?.['/a']?.get?.operationId).not.toBe(output.paths?.['/b']?.get?.operationId);
    });

    it('should widen a non-string GET query param type to include string', () => {
      const input: OpenApiDocument = {
        paths: {
          '/items': {
            get: { parameters: [{ in: 'query', schema: { type: 'integer' } }] },
          },
        },
      };
      const output = transformOpenApiDocument(input);
      expect(output.paths?.['/items']?.get?.parameters?.[0]?.schema?.type).toStrictEqual(['integer', 'string']);
    });

    it('should not widen a path param or a POST query-shaped param', () => {
      const input: OpenApiDocument = {
        paths: {
          '/items/{id}': {
            get: { parameters: [{ in: 'path', schema: { type: 'integer' } }] },
          },
          '/items': {
            post: {
              parameters: [{ in: 'query', schema: { type: 'integer' } }],
            },
          },
        },
      };
      const output = transformOpenApiDocument(input);
      expect(output.paths?.['/items/{id}']?.get?.parameters?.[0]?.schema?.type).toBe('integer');
    });

    it('should not double-widen an already-string-inclusive type', () => {
      const input: OpenApiDocument = {
        paths: {
          '/items': {
            get: {
              parameters: [{ in: 'query', schema: { type: ['integer', 'string'] } }],
            },
          },
        },
      };
      const output = transformOpenApiDocument(input);
      expect(output.paths?.['/items']?.get?.parameters?.[0]?.schema?.type).toStrictEqual(['integer', 'string']);
    });
  });

  describe('buildTypeAliases', () => {
    it('should alias every named schema to a top-level type', () => {
      const document: OpenApiDocument = {
        paths: {},
        components: { schemas: { MeResponse: {}, Widget: {} } },
      };
      const output = buildTypeAliases(document);
      expect(output).toContain(`export type MeResponse = components['schemas']['MeResponse'];`);
      expect(output).toContain(`export type Widget = components['schemas']['Widget'];`);
    });

    it('should name QueryParams/PathParams from the operation summary when present', () => {
      const document: OpenApiDocument = {
        paths: {
          '/users/{id}': {
            get: {
              summary: 'List Users',
              parameters: [{ in: 'query' }, { in: 'path' }],
            },
          },
        },
      };
      const output = buildTypeAliases(document);
      expect(output).toContain(`export type ListUsersQueryParams = Exclude<paths['/users/{id}']['get']['parameters']['query'], undefined>;`);
      expect(output).toContain(`export type ListUsersPathParams = Exclude<paths['/users/{id}']['get']['parameters']['path'], undefined>;`);
    });

    it('should fall back to the operationId when summary is absent', () => {
      const document: OpenApiDocument = {
        paths: {
          '/users': {
            get: { operationId: 'get_users', parameters: [{ in: 'query' }] },
          },
        },
      };
      const output = buildTypeAliases(document);
      expect(output).toContain(`export type GetUsersQueryParams`);
    });

    it('should emit nothing for a GET operation with no parameters', () => {
      const document: OpenApiDocument = {
        paths: { '/users': { get: { operationId: 'list', parameters: [] } } },
      };
      expect(buildTypeAliases(document)).toBe('');
    });
  });
});
