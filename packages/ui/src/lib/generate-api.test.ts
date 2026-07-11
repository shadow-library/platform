/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { generateApi } from './generate-api';

/**
 * Declaring the constants
 */
const SPEC = {
  paths: {
    '/users/{id}': {
      get: {
        summary: 'Get user',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } },
      },
    },
    '/users': {
      get: {
        summary: 'List users',
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } } },
      },
      post: {
        summary: 'Create user',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } } },
        responses: { '201': { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } },
      },
    },
  },
  components: {
    schemas: {
      User: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } }, required: ['id'] },
      Metadata: { type: 'object' },
    },
  },
};

function mockSpec(spec: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ json: () => Promise.resolve(spec) } as Response)),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateApi', () => {
  it('emits the shared APIRequest import, adding JsonObject when the output references it', async () => {
    mockSpec(SPEC);
    const output = await generateApi('https://api.test/openapi.json');
    expect(output).toContain("import { APIRequest, type JsonObject } from '@shadow-library/ui';");
  });

  it('renders component schemas as exported types with optional/required members', async () => {
    mockSpec(SPEC);
    const output = await generateApi('https://api.test/openapi.json');
    expect(output).toContain('export type User = {');
    expect(output).toContain('id: string;');
    expect(output).toContain('name?: string;');
    // A propertyless object schema falls back to JsonObject.
    expect(output).toContain('export type Metadata = JsonObject;');
  });

  it('generates a path-parameterised function with an interpolated URL', async () => {
    mockSpec(SPEC);
    const output = await generateApi('https://api.test/openapi.json');
    expect(output).toContain('export async function getUser(id: string): Promise<User>');
    // The path param is interpolated into a template-literal URL (asserted without a literal `${` token).
    expect(output).toContain('return APIRequest.get(`/users/');
    expect(output).toContain('`).execute<User>();');
  });

  it('generates a body-carrying function chaining .body().execute()', async () => {
    mockSpec(SPEC);
    const output = await generateApi('https://api.test/openapi.json');
    expect(output).toContain('export async function createUser(body: CreateUserBody): Promise<User>');
    expect(output).toContain("return APIRequest.post('/users').body(body).execute<User>();");
    expect(output).toContain('export type CreateUserBody = {');
  });

  it('maps query parameters onto a generated query type and chains .query()', async () => {
    mockSpec(SPEC);
    const output = await generateApi('https://api.test/openapi.json');
    expect(output).toContain('export type ListUsersQuery = {');
    expect(output).toContain('.query(query)');
  });

  it('returns the generated response type for an inline (non-$ref) response schema', async () => {
    mockSpec(SPEC);
    const output = await generateApi('https://api.test/openapi.json');
    expect(output).toContain('export type ListUsersResponse = Array<User>;');
    expect(output).toContain('export async function listUsers(query: ListUsersQuery): Promise<ListUsersResponse>');
    expect(output).toContain('.execute<ListUsersResponse>()');
  });
});
