/**
 * Importing npm packages
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { genApiTypes } from '@lib/gen-api-types';
import { run } from '@lib/utils';

import { createFixtureDir, removeFixtureDir, writeFixtureFiles } from './helpers/fixture';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const SAMPLE_SPEC = {
  openapi: '3.0.0',
  info: { title: 'Fixture API', version: '1.0.0' },
  paths: {
    '/widgets': {
      get: {
        summary: 'List Widgets',
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Widget' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Widget: { type: 'object', properties: { id: { type: 'string' } } },
    },
  },
};

describe('genApiTypes (integration)', () => {
  let fixtureDir: string | undefined;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify(SAMPLE_SPEC), { status: 200 })) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (fixtureDir) removeFixtureDir(fixtureDir);
    fixtureDir = undefined;
  });

  it('should fetch, transform, generate, and format types into the default output path', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-gen-api-types-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/web',
        devDependencies: { prettier: '^3.3.3' },
      }),
      'prettier.config.js': 'export default { singleQuote: true };\n',
    });
    const install = run('bun', ['install'], { cwd: fixtureDir, stream: false });
    if (install.status !== 0) throw new Error(`fixture bun install failed: ${install.stderr}`);

    await genApiTypes({
      cwd: fixtureDir,
      url: 'https://example.test/openapi.json',
    });

    const outputPath = path.join(fixtureDir, 'src/lib/apis/api-types.gen.ts');
    expect(fs.existsSync(outputPath)).toBe(true);
    const contents = fs.readFileSync(outputPath, 'utf-8');
    expect(contents).toContain("export type Widget = components['schemas']['Widget'];");
    expect(contents).toContain('ListWidgetsQueryParams');
    expect(fs.existsSync(`${outputPath}.tmp`)).toBe(false);
  });

  it('should respect a custom output path', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-gen-api-types-out-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/web',
        devDependencies: { prettier: '^3.3.3' },
      }),
    });
    const install = run('bun', ['install'], { cwd: fixtureDir, stream: false });
    if (install.status !== 0) throw new Error(`fixture bun install failed: ${install.stderr}`);

    await genApiTypes({
      cwd: fixtureDir,
      url: 'https://example.test/openapi.json',
      outputPath: 'generated/api.ts',
    });

    expect(fs.existsSync(path.join(fixtureDir, 'generated/api.ts'))).toBe(true);
  });

  it('should throw and leave no output file when the fetch fails', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-gen-api-types-http-fail-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/web' }),
    });
    globalThis.fetch = mock(async () => new Response('not found', { status: 404, statusText: 'Not Found' })) as unknown as typeof fetch;

    await expect(
      genApiTypes({
        cwd: fixtureDir,
        url: 'https://example.test/openapi.json',
      }),
    ).rejects.toThrow(/404/);
    expect(fs.existsSync(path.join(fixtureDir, 'src/lib/apis/api-types.gen.ts'))).toBe(false);
  });

  it('should throw on a malformed document without writing anything', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-gen-api-types-malformed-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/web' }),
    });
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ not: 'an openapi doc' }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;

    await expect(
      genApiTypes({
        cwd: fixtureDir,
        url: 'https://example.test/openapi.json',
      }),
    ).rejects.toThrow(/Malformed/);
    expect(fs.existsSync(path.join(fixtureDir, 'src/lib/apis/api-types.gen.ts'))).toBe(false);
  });
});
