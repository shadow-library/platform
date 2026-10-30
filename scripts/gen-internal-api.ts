import fs from 'node:fs';
import path from 'node:path';

import { captureOpenApiDocument, generateApiTypesContents, type OpenApiDocument, transformOpenApiDocument, validateOpenApiDocument } from './gen-api-types.ts';
import { log, reportError, ShadowError } from './utils/index.ts';
import { findWorkspace, findWorkspaces, type InternalContract, type Workspace } from './workspaces.ts';

export const INTERNAL_API_DIR = 'packages/internal-api';

const SCHEMA_REF_PREFIX = '#/components/schemas/';

const USAGE = `Usage: bun scripts/gen-internal-api.ts [<workspace>|--all] [--check]

  workspace  an apps/*-server: only the contracts cut from that server's OpenAPI document;
             ${INTERNAL_API_DIR} (or --all, the default): every contract
  --check    don't write — diff a fresh generation against the committed files and fail on drift

Each contract in ${INTERNAL_API_DIR}/package.json "shadow.internalContracts" is cut from its server's
document, booted over fakes as gen-api-types.ts --check does, and written to
${INTERNAL_API_DIR}/src/<name>/<name>-api.gen.ts.`;

export interface NamedContract extends InternalContract {
  name: string;
}

function matchesPath(pattern: string, pathKey: string): boolean {
  if (pattern.endsWith('*')) return pathKey.startsWith(pattern.slice(0, -1));
  return pattern === pathKey;
}

function collectRefs(value: unknown, refs: Set<string>): void {
  if (Array.isArray(value)) return value.forEach(item => collectRefs(item, refs));
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && typeof child === 'string' && child.startsWith(SCHEMA_REF_PREFIX)) refs.add(child.slice(SCHEMA_REF_PREFIX.length));
    else collectRefs(child, refs);
  }
}

/** Keeps the contract's paths and only the component schemas they reach, so a server's unrelated DTOs never churn a contract. */
export function cutContract(document: OpenApiDocument, contract: NamedContract): OpenApiDocument {
  const paths: NonNullable<OpenApiDocument['paths']> = {};
  for (const pattern of contract.paths) {
    const matched = Object.keys(document.paths ?? {}).filter(pathKey => matchesPath(pattern, pathKey));
    if (matched.length === 0) throw new ShadowError(`Internal contract "${contract.name}" names ${pattern}, which matches no path in ${contract.server}'s OpenAPI document`);
    for (const pathKey of matched) paths[pathKey] = document.paths?.[pathKey] as NonNullable<OpenApiDocument['paths']>[string];
  }

  const available = document.components?.schemas ?? {};
  const reached = new Set<string>();
  const found = new Set<string>();
  collectRefs(paths, found);
  const pending = [...found];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (reached.has(name)) continue;
    if (!(name in available)) throw new ShadowError(`Internal contract "${contract.name}" reaches schema ${name}, which ${contract.server}'s document does not define`);
    reached.add(name);
    const nested = new Set<string>();
    collectRefs(available[name], nested);
    pending.push(...nested);
  }

  const schemas = Object.fromEntries([...reached].sort().map(name => [name, available[name]]));
  return { openapi: document['openapi'], info: document['info'], paths, components: { schemas } };
}

export function readContracts(internalApi: Workspace): NamedContract[] {
  const contracts = internalApi.shadow.internalContracts;
  if (!contracts || Object.keys(contracts).length === 0) throw new ShadowError(`${internalApi.dir}/package.json declares no "shadow.internalContracts"`);
  return Object.entries(contracts).map(([name, contract]) => ({ name, ...contract }));
}

export function contractOutputPath(internalApi: Workspace, name: string): string {
  return path.join(internalApi.path, 'src', name, `${name}-api.gen.ts`);
}

async function renderContracts(contracts: NamedContract[], internalApi: Workspace, workspaces: Workspace[]): Promise<Map<string, string>> {
  const documents = new Map<string, OpenApiDocument>();
  const rendered = new Map<string, string>();
  for (const contract of contracts) {
    let document = documents.get(contract.server);
    if (!document) {
      const server = findWorkspace(contract.server, workspaces);
      document = transformOpenApiDocument(validateOpenApiDocument(await captureOpenApiDocument(server), `${server.dir} (in-process)`));
      documents.set(contract.server, document);
    }
    const outputPath = contractOutputPath(internalApi, contract.name);
    // A free-form object (pulse's template `payload`) would otherwise type as `Record<string, never>` and refuse every real value.
    rendered.set(outputPath, await generateApiTypesContents(cutContract(document, contract), outputPath, { emptyObjectsUnknown: true }));
  }
  return rendered;
}

function selectContracts(target: string | undefined, contracts: NamedContract[], workspaces: Workspace[]): NamedContract[] {
  if (!target) return contracts;
  const workspace = findWorkspace(target, workspaces);
  if (workspace.dir === INTERNAL_API_DIR) return contracts;
  if (!workspace.dir.startsWith('apps/') || !workspace.dir.endsWith('-server')) throw new ShadowError(`${workspace.dir} is neither an apps/*-server nor ${INTERNAL_API_DIR}`);
  return contracts.filter(contract => contract.server === workspace.dir);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    log.info(USAGE);
    return 0;
  }

  const check = args.includes('--check');
  const [target] = args.filter(arg => !arg.startsWith('-'));
  const workspaces = findWorkspaces();
  const internalApi = findWorkspace(INTERNAL_API_DIR, workspaces);
  const contracts = selectContracts(args.includes('--all') ? undefined : target, readContracts(internalApi), workspaces);
  if (contracts.length === 0) {
    log.info(`No internal contract is cut from ${target}; nothing to do.`);
    return 0;
  }

  const rendered = await renderContracts(contracts, internalApi, workspaces);
  const relative = (file: string): string => path.relative(path.resolve(internalApi.path, '../..'), file);

  if (!check) {
    for (const [outputPath, contents] of rendered) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, contents);
      log.success(`Generated ${relative(outputPath)}`);
    }
    return 0;
  }

  const drifted = [...rendered]
    .filter(([outputPath, contents]) => !fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf-8') !== contents)
    .map(([outputPath]) => outputPath);
  for (const outputPath of drifted)
    log.error(`${relative(outputPath)} is out of date with its server's OpenAPI contract — run \`bun scripts/gen-internal-api.ts\` and commit the result.`);
  if (drifted.length > 0) throw new ShadowError(`${drifted.length} of ${rendered.size} internal contract(s) have drifted.`);
  for (const outputPath of rendered.keys()) log.success(`${relative(outputPath)} matches a fresh generation.`);
  return 0;
}

if (import.meta.path === Bun.main) process.exitCode = await main().catch(reportError);
