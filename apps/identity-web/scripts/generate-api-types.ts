/**
 * Importing npm packages
 */
import { type SpawnSyncOptions, spawnSync } from 'node:child_process';
import path from 'node:path';

import openapiTS, { astToString } from 'openapi-typescript';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const rootDir = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(rootDir, 'src/lib/apis/api-types.gen.ts');
const openapiSpecUrl = process.env.OPENAPI_SPEC_URL || 'http://localhost:8080/dev/api-docs/openapi.json';

const response = await fetch(openapiSpecUrl);
if (!response.ok) throw new Error(`Failed to fetch OpenAPI spec from ${openapiSpecUrl}: ${response.status} ${response.statusText}`);
const openapiSpec = await response.json();

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
for (const pathKey of Object.keys(openapiSpec.paths ?? {})) {
  const pathItem = openapiSpec.paths[pathKey];
  for (const method of METHODS) {
    const operation = pathItem[method];
    if (!operation) continue;
    // The framework derives operationIds from controller method names (list/create/remove/…), which
    // collide across controllers; rewrite them to a unique, deterministic id so strict tools validate.
    operation.operationId = `${method}_${pathKey.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
    // Query parameters travel as strings on the wire, so widen non-string GET query params to also
    // accept `string` — the client serialises everything through URLSearchParams.
    if (method === 'get')
      for (const param of operation.parameters ?? [])
        if (param.in === 'query' && param.schema?.type && param.schema.type !== 'string') param.schema.type = [param.schema.type, 'string'];
  }
}

const ast = await openapiTS(openapiSpec);
let contents = astToString(ast);

// Surface every named schema as a top-level alias so the API layer imports `MeResponse` rather than
// `components['schemas']['MeResponse']`.
for (const key of Object.keys(openapiSpec.components?.schemas ?? {})) contents += `export type ${key} = components['schemas']['${key}'];\n`;

await Bun.write(outputPath, contents);

/** Format the generated file so it matches the repo's Prettier config. */
const options = { cwd: rootDir, stdio: 'inherit' } satisfies SpawnSyncOptions;
spawnSync('bunx', ['prettier', '--write', '--log-level', 'error', 'src/lib/apis/api-types.gen.ts'], options);

console.log('API types generated successfully'); // eslint-disable-line no-console
