/**
 * Importing npm packages
 */
import { SpawnSyncOptions, spawnSync } from 'node:child_process';
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
const openapiSpecUrl = process.env.OPENAPI_SPEC_URL || 'https://novel-forge.shadow-apps.com/dev/api-docs/openapi.json';

const response = await fetch(openapiSpecUrl);
const openapiSpec = await response.json();
for (const path of Object.keys(openapiSpec.paths)) {
  const pathItem = openapiSpec.paths[path].get;
  if (!pathItem?.parameters?.length) continue;
  for (const param of pathItem.parameters) {
    param.schema.type = [param.schema.type, 'string'];
  }
}
const ast = await openapiTS(openapiSpec);

let contents = astToString(ast);
for (const key of Object.keys(openapiSpec.components?.schemas ?? {})) contents += `export type ${key} = components['schemas']['${key}']\n`;
for (const path of Object.keys(openapiSpec.paths)) {
  const pathItem = openapiSpec.paths[path].get;
  if (!pathItem?.parameters?.length) continue;

  const baseName = pathItem.summary.replaceAll(' ', '');
  const hasQueryParams = pathItem.parameters.some((param: any) => param.in === 'query');
  if (hasQueryParams) contents += `export type ${baseName}QueryParams = Exclude<paths['${path}']['get']['parameters']['query'], undefined>;\n`;
  const hasPathParams = pathItem.parameters.some((param: any) => param.in === 'path');
  if (hasPathParams) contents += `export type ${baseName}PathParams = Exclude<paths['${path}']['get']['parameters']['path'], undefined>;\n`;
}
await Bun.write(outputPath, contents);

/** Formatting the generated file */
const cwd = path.join(import.meta.dirname, '..');
const options = { cwd, stdio: 'inherit' } satisfies SpawnSyncOptions;
spawnSync('bunx', ['prettier', '--write', 'src/lib/apis/api-types.gen.ts'], options);

console.log('API types generated successfully'); // eslint-disable-line no-console
