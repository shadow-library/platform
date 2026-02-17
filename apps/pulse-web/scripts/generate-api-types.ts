/**
 * Importing npm packages
 */
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
const openapiSpecUrl = process.env.OPENAPI_SPEC_URL || 'https://pulse.shadow-apps.com/dev/api-docs/openapi.json';
const rootDir = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(rootDir, 'src/lib/apis/api-types.gen.ts');

const response = await fetch(`${openapiSpecUrl}?schemaMode=api`);
const openapiSpec = await response.json();
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
console.log('API types generated successfully'); // eslint-disable-line no-console
