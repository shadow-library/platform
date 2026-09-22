/**
 * Importing npm packages
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import openapiTS, { astToString } from 'openapi-typescript';
import prettier from 'prettier';

/**
 * Importing user defined packages
 */
import { log, reportError, ShadowError, stripGitEnv } from './utils/index.ts';
import { API_TYPES_PATH, findWorkspace, findWorkspaces, type Workspace } from './workspaces.ts';

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
/** The running server every web app generates against during development, in non-`--check` single-target mode. */
const DEFAULT_URL = 'http://localhost:8080/dev/api-docs/openapi.json';

/**
 * Each backend's own entry for writing its OpenAPI document: it boots `AppModule` in-process over fakes
 * for Postgres, Redis, storage and identity, which only that server knows how to assemble. It lives in
 * the server so Bun resolves the workspace's own path aliases and `@shadow-library/*` copies.
 */
const DUMP_ENTRY_RELATIVE_PATH = 'src/dump-openapi.ts';

/** Booting takes about a second; anything near this long means a provider is waiting on a connection it should never open. */
const DUMP_TIMEOUT_MS = 60_000;

const USAGE = `Usage: bun scripts/gen-api-types.ts <web-app>|--all [url] [--check]

  web-app   repo-relative directory (apps/pulse-web) or package name — must have a paired apps/*-server
  --all     every apps/*-web workspace with a paired apps/*-server
  url       OpenAPI document to generate from (default ${DEFAULT_URL}); only meaningful for a single
            web-app target without --check — --all and --check always boot the paired server themselves
  --check   don't write api-types.gen.ts — render it to memory instead and diff against the committed
            file, booting the paired server in-process and failing with a nonzero exit and an
            actionable message on drift. The server↔web contract drift gate.

--all and --check boot each paired server through its ${DUMP_ENTRY_RELATIVE_PATH}, over fakes: no dev
server, Postgres, Redis or identity provider is needed, and nothing connects to one.

Without --check, writes the committed src/lib/apis/api-types.gen.ts (against a running server, or
in-process for --all). With --check, nothing is ever written.`;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

/** Narrows an unknown parsed JSON value to an OpenAPI document, rejecting anything without a `paths` object. */
export function validateOpenApiDocument(value: unknown, sourceUrl: string): OpenApiDocument {
  if (typeof value !== 'object' || value === null) throw new ShadowError(`Malformed OpenAPI document fetched from ${sourceUrl}: not a JSON object`);
  const document = value as OpenApiDocument;
  if (typeof document.paths !== 'object' || document.paths === null) throw new ShadowError(`Malformed OpenAPI document fetched from ${sourceUrl}: missing "paths"`);
  return document;
}

/**
 * Collapses every run of non-alphanumeric characters (`/`, `{`, `}`, `-`, …) in a path to a single `_` and
 * trims leading/trailing ones — e.g. `/internal/novels/{slug}/manifest` → `internal_novels_slug_manifest`.
 * Collapsing runs (not just replacing each character) matters: a raw path has adjacent separators
 * (`/{slug}` is `/` then `{`), and replacing them one-for-one would leave stray `_` behind.
 */
function normalizePath(pathKey: string): string {
  return pathKey.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
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
      operation.operationId = `${method}_${normalizePath(pathKey)}`;
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

/** One GET operation's alias inputs, ahead of the collision check `buildTypeAliases` runs before naming anything. */
interface AliasCandidate {
  pathKey: string;
  baseName: string;
  hasQueryParams: boolean;
  hasPathParams: boolean;
}

/**
 * Builds the hand-written type aliases appended after the `openapi-typescript` output:
 *  - every named schema surfaced as a top-level alias (`MeResponse` instead of `components['schemas']['MeResponse']`)
 *  - a `<Name>QueryParams`/`<Name>PathParams` alias per GET operation that has query/path params, named
 *    from the operation's `summary` when present (falling back to its operationId so generation never
 *    breaks on a spec that omits summaries).
 *
 * `summary` comes from `@shadow-library/fastify`'s `@HttpRoute` decorator, which derives it from the
 * *controller method name* alone (`http-route.decorator.ts`) — not the path. Two controllers with same-named
 * handlers (`getManifest` on both the chapter-publish and wiki-publish controllers, say) produce identical
 * summaries and therefore identical `<Name>PathParams`/`<Name>QueryParams` aliases, even though their paths
 * differ. Since an OpenAPI document's path keys are themselves unique by construction, any alias name whose
 * summary-derived form collides with another route's is deterministically replaced — for every route sharing
 * that name, not just the newcomer, so the rule never depends on object-iteration order — with one derived
 * from the *full path* instead, which can't collide. Non-colliding routes keep their existing, already-committed
 * names untouched, so this never churns a web app's `api-types.gen.ts` beyond the routes that actually collide.
 */
export function buildTypeAliases(document: OpenApiDocument): string {
  let output = '';

  for (const key of Object.keys(document.components?.schemas ?? {})) output += `export type ${key} = components['schemas']['${key}'];\n`;

  const candidates: AliasCandidate[] = [];
  for (const [pathKey, pathItem] of Object.entries(document.paths ?? {})) {
    const operation = pathItem.get;
    if (!operation?.parameters?.length) continue;

    const baseName = operation.summary ? operation.summary.replace(/[^a-zA-Z0-9]/g, '') : toIdentifier(operation.operationId ?? pathKey);
    candidates.push({
      pathKey,
      baseName,
      hasQueryParams: operation.parameters.some(param => param.in === 'query'),
      hasPathParams: operation.parameters.some(param => param.in === 'path'),
    });
  }

  // Tally how many routes would land on the same summary-derived name for each suffix, independently —
  // a route can share its `QueryParams` name with one route and its `PathParams` name with a different one.
  const occurrences = new Map<string, number>();
  const tally = (name: string) => occurrences.set(name, (occurrences.get(name) ?? 0) + 1);
  for (const candidate of candidates) {
    if (candidate.hasQueryParams) tally(`${candidate.baseName}QueryParams`);
    if (candidate.hasPathParams) tally(`${candidate.baseName}PathParams`);
  }

  const usedNames = new Set<string>();
  const resolveName = (candidate: AliasCandidate, suffix: 'QueryParams' | 'PathParams'): string => {
    const preferred = `${candidate.baseName}${suffix}`;
    const name = (occurrences.get(preferred) ?? 0) > 1 ? `${toIdentifier(normalizePath(candidate.pathKey))}${suffix}` : preferred;
    // Path keys are unique OpenAPI document keys, so a path-derived name can only collide with another
    // path-derived name if two candidates were generated from identical paths, which cannot happen — this
    // check exists to fail loudly instead of silently emitting a duplicate identifier if that ever changes.
    if (usedNames.has(name))
      throw new ShadowError(`buildTypeAliases produced a duplicate alias "${name}" for ${candidate.pathKey} — this is a bug in the disambiguation rule itself.`);
    usedNames.add(name);
    return name;
  };

  for (const candidate of candidates) {
    if (candidate.hasQueryParams)
      output += `export type ${resolveName(candidate, 'QueryParams')} = Exclude<paths['${candidate.pathKey}']['get']['parameters']['query'], undefined>;\n`;
    if (candidate.hasPathParams)
      output += `export type ${resolveName(candidate, 'PathParams')} = Exclude<paths['${candidate.pathKey}']['get']['parameters']['path'], undefined>;\n`;
  }

  return output;
}

/**
 * Renders a validated+transformed OpenAPI document into the formatted contents of a workspace's
 * `api-types.gen.ts` — the one step both the write path and the `--check` drift path need, so the two
 * can never diverge on what "generated" means. `outputPath` only steers prettier's config resolution
 * (its own upward search from the file's directory); nothing is written here.
 */
export async function generateApiTypesContents(document: OpenApiDocument, outputPath: string): Promise<string> {
  const ast = await openapiTS(document as any); // openapi-typescript's input type is narrower than our validated document shape
  const rawContents = `${astToString(ast)}${buildTypeAliases(document)}`;

  // Format the generated file with the repo's own `.prettierrc.json` (resolved by prettier), so it lands
  // formatted exactly as `verify` and the editor expect — no separate ruleset to drift.
  const prettierOptions = await prettier.resolveConfig(outputPath);
  try {
    return await prettier.format(rawContents, { ...prettierOptions, parser: 'typescript' });
  } catch (cause) {
    throw new ShadowError(`Generated API types failed formatting — left ${outputPath} untouched`, { cause });
  }
}

/**
 * The `apps/*-server` workspace paired with `webApp` by naming convention — the same convention the
 * server↔web contract and AGENTS.md already assume.
 */
function pairedServer(webApp: Workspace, workspaces: Workspace[]): Workspace {
  if (!webApp.dir.startsWith('apps/') || !webApp.dir.endsWith('-web')) throw new ShadowError(`${webApp.dir} is not an apps/*-web workspace`);
  const serverDir = webApp.dir.replace(/-web$/, '-server');
  const server = workspaces.find(workspace => workspace.dir === serverDir);
  if (!server) throw new ShadowError(`No paired server workspace "${serverDir}" found for ${webApp.dir}`);
  return server;
}

/** Every `apps/*-web` workspace that has a paired `apps/*-server` — the full `--all` target set. */
function webAppTargets(workspaces: Workspace[]): Workspace[] {
  return workspaces.filter(workspace => {
    if (!workspace.dir.startsWith('apps/') || !workspace.dir.endsWith('-web')) return false;
    return workspaces.some(candidate => candidate.dir === workspace.dir.replace(/-web$/, '-server'));
  });
}

/**
 * Runs `server`'s dump entry and returns the OpenAPI document it wrote. `--no-env-file` keeps a
 * developer's local `.env` from changing the contract, so a local run and CI capture the same document.
 * Always removes the dump, even on failure.
 */
export async function captureOpenApiDocument(server: Workspace): Promise<unknown> {
  const entryPath = path.join(server.path, DUMP_ENTRY_RELATIVE_PATH);
  if (!fs.existsSync(entryPath)) throw new ShadowError(`${server.dir} has no ${DUMP_ENTRY_RELATIVE_PATH} — every paired server needs one to capture its OpenAPI document`);

  const dumpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-api-types-'));
  const dumpPath = path.join(dumpDir, 'openapi.json');

  try {
    log.info(`boot   ${server.dir} (bun ${DUMP_ENTRY_RELATIVE_PATH})`);
    /** `@shadow-library/common` reads `NODE_ENV` on import, before the entry can set anything, and a production value makes deployment-only config mandatory */
    const child = Bun.spawn(['bun', '--no-env-file', DUMP_ENTRY_RELATIVE_PATH, dumpPath], {
      cwd: server.path,
      env: { ...stripGitEnv(process.env), NODE_ENV: 'development' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: DUMP_TIMEOUT_MS,
    });

    const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (child.signalCode) {
      log.error(stderr);
      throw new ShadowError(`Booting ${server.dir} was killed by ${child.signalCode} — past ${DUMP_TIMEOUT_MS / 1000}s, a provider is probably waiting on a connection`);
    }
    if (status !== 0) {
      log.error(stdout);
      log.error(stderr);
      throw new ShadowError(`Booting ${server.dir} to capture its OpenAPI document failed (exit code ${status})`);
    }

    try {
      return JSON.parse(fs.readFileSync(dumpPath, 'utf-8'));
    } catch (cause) {
      throw new ShadowError(`${server.dir}'s ${DUMP_ENTRY_RELATIVE_PATH} exited cleanly without writing a JSON document to ${dumpPath}`, { cause });
    }
  } finally {
    fs.rmSync(dumpDir, { recursive: true, force: true });
  }
}

/** Fetches and validates+transforms an OpenAPI document from a running server. */
async function fetchOpenApiDocument(url: string): Promise<OpenApiDocument> {
  const response = await fetch(url);
  if (!response.ok) throw new ShadowError(`Failed to fetch OpenAPI spec from ${url}: ${response.status} ${response.statusText}`);

  let rawDocument: unknown;
  try {
    rawDocument = await response.json();
  } catch (cause) {
    throw new ShadowError(`Malformed OpenAPI document fetched from ${url}: not valid JSON`, { cause });
  }

  return transformOpenApiDocument(validateOpenApiDocument(rawDocument, url));
}

/** Writes `contents` to `webApp`'s `api-types.gen.ts` atomically, via a temp file, so a failure mid-write never leaves a truncated file behind. */
function writeApiTypes(webApp: Workspace, contents: string): void {
  const outputPath = path.join(webApp.path, API_TYPES_PATH);
  const tempPath = `${outputPath}.tmp`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(tempPath, contents);
  fs.renameSync(tempPath, outputPath);
  log.success(`Generated API types at ${webApp.dir}/${API_TYPES_PATH}`);
}

/**
 * Regenerates `webApp`'s API types in-process from its paired server's live document and diffs the
 * result against the committed file, without ever writing to it. Returns a human-readable failure
 * message, or `null` on a clean match.
 */
export async function checkOne(webApp: Workspace, workspaces: Workspace[]): Promise<string | null> {
  const server = pairedServer(webApp, workspaces);
  const rawDocument = await captureOpenApiDocument(server);
  const document = transformOpenApiDocument(validateOpenApiDocument(rawDocument, `${server.dir} (in-process)`));

  const outputPath = path.join(webApp.path, API_TYPES_PATH);
  const fresh = await generateApiTypesContents(document, outputPath);
  const regenCommand = `bun scripts/gen-api-types.ts ${webApp.dir}`;

  if (!fs.existsSync(outputPath)) return `${webApp.dir}/${API_TYPES_PATH} is missing — run \`${regenCommand}\` (against a running server) and commit the result.`;

  const committed = fs.readFileSync(outputPath, 'utf-8');
  if (committed === fresh) return null;

  return `${webApp.dir}/${API_TYPES_PATH} is out of date with ${server.dir}'s OpenAPI contract — run \`${regenCommand}\` (against a running server) and commit the result.`;
}

/** Checks every target web app in turn, reporting a combined failure list instead of aborting on the first. */
export async function checkApiTypes(targets: Workspace[], workspaces: Workspace[]): Promise<void> {
  if (targets.length === 0) throw new ShadowError('No apps/*-web workspaces with a paired apps/*-server found — nothing to check.');

  const failures: string[] = [];
  for (const webApp of targets) {
    const failure = await checkOne(webApp, workspaces);
    if (failure) {
      log.error(failure);
      failures.push(failure);
    } else {
      log.success(`${webApp.dir}/${API_TYPES_PATH} matches a fresh generation.`);
    }
  }

  if (failures.length > 0) throw new ShadowError(`${failures.length} of ${targets.length} web app(s) have drifted API types.`);
}

/**
 * Regenerates `webApp`'s API types in-process (its paired server booted hermetically, no dev server
 * needed) and writes them — the `--all` write path, and the same acquisition `--check` uses.
 */
async function genOneInProcess(webApp: Workspace, workspaces: Workspace[]): Promise<void> {
  const server = pairedServer(webApp, workspaces);
  const rawDocument = await captureOpenApiDocument(server);
  const document = transformOpenApiDocument(validateOpenApiDocument(rawDocument, `${server.dir} (in-process)`));
  const outputPath = path.join(webApp.path, API_TYPES_PATH);
  const contents = await generateApiTypesContents(document, outputPath);
  writeApiTypes(webApp, contents);
}

/**
 * Fetches an OpenAPI document from a running server and generates the workspace's single API types file —
 * the one implementation every Shadow web app shares. The server↔web contract is not atomic, so this is
 * run deliberately as part of a coordinated server change, never as a build step.
 */
export async function genApiTypes(workspace: Workspace, url: string): Promise<void> {
  const document = await fetchOpenApiDocument(url);
  const outputPath = path.join(workspace.path, API_TYPES_PATH);
  const contents = await generateApiTypesContents(document, outputPath);
  writeApiTypes(workspace, contents);
}

/** Parses argv and either writes or checks the requested target(s)' API types. */
async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    log.info(USAGE);
    return 0;
  }

  const check = args.includes('--check');
  const all = args.includes('--all');
  const [target, url] = args.filter(arg => !arg.startsWith('-'));
  const workspaces = findWorkspaces();

  if (!target && !all) throw new ShadowError(`A web app or --all is required.\n\n${USAGE}`);

  const targets = all ? webAppTargets(workspaces) : [findWorkspace(target as string, workspaces)];

  if (check) {
    await checkApiTypes(targets, workspaces);
    return 0;
  }

  if (all) {
    for (const webApp of targets) await genOneInProcess(webApp, workspaces);
    return 0;
  }

  await genApiTypes(targets[0] as Workspace, url ?? DEFAULT_URL);
  return 0;
}

if (import.meta.path === Bun.main) process.exitCode = await main().catch(reportError);
