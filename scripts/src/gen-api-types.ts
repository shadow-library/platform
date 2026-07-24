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
import { loadConfig } from '@lib/config';
import { log, ShadowError } from '@lib/utils';

/**
 * Defining types
 */
export interface GenApiTypesOptions {
  /** Root directory of the consuming web repo. */
  cwd: string;
  /** URL to fetch the OpenAPI document from. */
  url: string;
  /** Output path, relative to `cwd`. Defaults to the ecosystem's established convention. */
  outputPath?: string;
}

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

/**
 * Applies both fixes to a cloned document, leaving `document` untouched — pure aside from allocating
 * the clone, so it's unit-testable without a network fetch.
 */
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
 * Pure string-building over an already-transformed document — no I/O.
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
 * Fetches an OpenAPI document and generates a single TypeScript types file from it — the one
 * implementation shared by every Shadow web repo. Ported from `identity-web`'s script (the most
 * complete: fixes operationId collisions and GET query param widening) merged with the
 * `<Name>QueryParams`/`<Name>PathParams` named-export generation from `novel-forge-web`/`pulse-web`,
 * which their generated API clients still depend on — dropping it would regress those repos on
 * migration. See README "Deviations from ../common" for details.
 */
export async function genApiTypes(options: GenApiTypesOptions): Promise<void> {
  const response = await fetch(options.url);
  if (!response.ok) throw new ShadowError(`Failed to fetch OpenAPI spec from ${options.url}: ${response.status} ${response.statusText}`);

  let rawDocument: unknown;
  try {
    rawDocument = await response.json();
  } catch (cause) {
    throw new ShadowError(`Malformed OpenAPI document fetched from ${options.url}: not valid JSON`, { cause });
  }

  const document = transformOpenApiDocument(validateOpenApiDocument(rawDocument, options.url));

  const ast = await openapiTS(document as any); // openapi-typescript's input type is narrower than our validated document shape
  const rawContents = `${astToString(ast)}${buildTypeAliases(document)}`;

  const config = loadConfig(options.cwd);
  const outputPath = path.join(options.cwd, options.outputPath ?? config.genApiTypes.outputPath);

  // Format the generated file with the repo's own `.prettierrc.json` (resolved by prettier), so it lands
  // formatted exactly as `shadow verify` and the editor expect — no separate ruleset to drift.
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
  log.success(`Generated API types at ${path.relative(options.cwd, outputPath)}`);
}
