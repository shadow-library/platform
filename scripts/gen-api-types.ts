/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

import openapiTS, { astToString } from 'openapi-typescript';
import prettier from 'prettier';

/**
 * Importing user defined packages
 */
import { log, reportError, ShadowError } from './utils/index.ts';
import { API_TYPES_PATH, findWorkspace, type Workspace } from './workspaces.ts';

/**
 * Defining types
 */
interface OpenApiParameter {
  in: string;
  schema?: { type?: string | string[] };
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  parameters?: OpenApiParameter[];
}

export interface OpenApiDocument {
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, unknown> };
  [key: string]: unknown;
}

/**
 * Declaring the constants
 */
/** The running server every web app generates against during development. */
const DEFAULT_URL = 'http://localhost:8080/dev/api-docs/openapi.json';

const USAGE = `Usage: bun scripts/gen-api-types.ts <workspace> [url]

  workspace   repo-relative directory (apps/pulse-web) or package name
  url         OpenAPI document to generate from (default ${DEFAULT_URL})`;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

/** Narrows an unknown parsed JSON value to an OpenAPI document, rejecting anything without a `paths` object. */
export function validateOpenApiDocument(value: unknown, sourceUrl: string): OpenApiDocument {
  if (typeof value !== 'object' || value === null) throw new ShadowError(`Malformed OpenAPI document fetched from ${sourceUrl}: not a JSON object`);
  const document = value as OpenApiDocument;
  if (typeof document.paths !== 'object' || document.paths === null) throw new ShadowError(`Malformed OpenAPI document fetched from ${sourceUrl}: missing "paths"`);
  return document;
}

/**
 * Rewrites every operationId to `${method}_${normalizedPath}`. The framework this ecosystem's servers
 * are built on (`@shadow-library/fastify`) derives operationIds from controller method names
 * (list/create/remove/…), which collide across controllers; deriving instead from method + path is
 * unique by construction, so there is nothing left to detect — every operation gets a fresh id.
 */
function rewriteOperationIds(document: OpenApiDocument): void {
  for (const [pathKey, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      operation.operationId = `${method}_${pathKey.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
    }
  }
}

/**
 * Query parameters travel as strings on the wire (the client serialises everything through
 * `URLSearchParams`), so widen non-string GET query param schema types to also accept `string`.
 */
function widenGetQueryParams(document: OpenApiDocument): void {
  for (const pathItem of Object.values(document.paths ?? {})) {
    const operation = pathItem.get;
    if (!operation) continue;
    for (const param of operation.parameters ?? []) {
      const type = param.schema?.type;
      if (param.in === 'query' && param.schema && type && type !== 'string' && !(Array.isArray(type) && type.includes('string'))) {
        param.schema.type = Array.isArray(type) ? [...type, 'string'] : [type, 'string'];
      }
    }
  }
}

/** A deterministic PascalCase-ish identifier derived from an operationId, used when a param-name source has no `summary`. */
function toIdentifier(operationId: string): string {
  return operationId.replace(/(^|[^a-zA-Z0-9])([a-zA-Z0-9])/g, (_match, _sep, char: string) => char.toUpperCase());
}

/** Applies both fixes to a cloned document, leaving `document` untouched. */
export function transformOpenApiDocument(document: OpenApiDocument): OpenApiDocument {
  const clone = structuredClone(document);
  rewriteOperationIds(clone);
  widenGetQueryParams(clone);
  return clone;
}

/**
 * Builds the hand-written type aliases appended after the `openapi-typescript` output:
 *  - every named schema surfaced as a top-level alias (`MeResponse` instead of `components['schemas']['MeResponse']`)
 *  - a `<Name>QueryParams`/`<Name>PathParams` alias per GET operation that has query/path params, named
 *    from the operation's `summary` when present (falling back to its operationId so generation never
 *    breaks on a spec that omits summaries).
 */
export function buildTypeAliases(document: OpenApiDocument): string {
  let output = '';

  for (const key of Object.keys(document.components?.schemas ?? {})) output += `export type ${key} = components['schemas']['${key}'];\n`;

  for (const [pathKey, pathItem] of Object.entries(document.paths ?? {})) {
    const operation = pathItem.get;
    if (!operation?.parameters?.length) continue;

    const baseName = operation.summary ? operation.summary.replace(/[^a-zA-Z0-9]/g, '') : toIdentifier(operation.operationId ?? pathKey);
    const hasQueryParams = operation.parameters.some(param => param.in === 'query');
    const hasPathParams = operation.parameters.some(param => param.in === 'path');
    if (hasQueryParams) output += `export type ${baseName}QueryParams = Exclude<paths['${pathKey}']['get']['parameters']['query'], undefined>;\n`;
    if (hasPathParams) output += `export type ${baseName}PathParams = Exclude<paths['${pathKey}']['get']['parameters']['path'], undefined>;\n`;
  }

  return output;
}

/**
 * Fetches an OpenAPI document from a running server and generates the workspace's single API types file —
 * the one implementation every Shadow web app shares. The server↔web contract is not atomic, so this is
 * run deliberately as part of a coordinated server change, never as a build step.
 */
export async function genApiTypes(workspace: Workspace, url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new ShadowError(`Failed to fetch OpenAPI spec from ${url}: ${response.status} ${response.statusText}`);

  let rawDocument: unknown;
  try {
    rawDocument = await response.json();
  } catch (cause) {
    throw new ShadowError(`Malformed OpenAPI document fetched from ${url}: not valid JSON`, { cause });
  }

  const document = transformOpenApiDocument(validateOpenApiDocument(rawDocument, url));

  const ast = await openapiTS(document as any); // openapi-typescript's input type is narrower than our validated document shape
  const rawContents = `${astToString(ast)}${buildTypeAliases(document)}`;
  const outputPath = path.join(workspace.path, API_TYPES_PATH);

  // Format the generated file with the repo's own `.prettierrc.json` (resolved by prettier), so it lands
  // formatted exactly as `verify` and the editor expect — no separate ruleset to drift.
  const prettierOptions = await prettier.resolveConfig(outputPath);
  let contents: string;
  try {
    contents = await prettier.format(rawContents, { ...prettierOptions, parser: 'typescript' });
  } catch (cause) {
    throw new ShadowError(`Generated API types failed formatting — left ${outputPath} untouched`, { cause });
  }

  // Write atomically via a temp file so a failure mid-write never leaves a truncated types file behind.
  const tempPath = `${outputPath}.tmp`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(tempPath, contents);
  fs.renameSync(tempPath, outputPath);
  log.success(`Generated API types at ${workspace.dir}/${API_TYPES_PATH}`);
}

/** Parses argv and generates the target workspace's API types. */
async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    log.info(USAGE);
    return 0;
  }

  const [target, url] = args.filter(arg => !arg.startsWith('-'));
  if (!target) throw new ShadowError(`A workspace is required.\n\n${USAGE}`);

  await genApiTypes(findWorkspace(target), url ?? DEFAULT_URL);
  return 0;
}

process.exitCode = await main().catch(reportError);
