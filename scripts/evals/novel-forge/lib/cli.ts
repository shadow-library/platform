import { existsSync, readFileSync } from 'node:fs';

import { log, reportError } from '../../../utils/index.ts';
import { Author } from './author.ts';
import { EvalError } from './errors.ts';
import { FakeForgeApi } from './fake-forge-api.ts';
import { type ForgeApi, type ForgeAuth, HttpForgeApi } from './forge-api.ts';
import { COST_TIERS, type CostTier } from './forge.types.ts';
import { assertSafeOutDir, defaultOutDir, OutputSink } from './output.ts';

export type Flags = Map<string, string | true>;

export interface SuiteContext {
  flags: Flags;
  api: ForgeApi;
  sink: OutputSink;
  dryRun: boolean;
  runs: number;
  tier: CostTier | null;
  keepProjects: boolean;
  author: (runLabel: string, tier?: CostTier | null) => Author;
}

export interface SuiteVerdict {
  /** Whether this suite's gate held; advisory suites report `null`. */
  passed: boolean | null;
  headline: string;
}

export interface SuiteDefinition {
  name: string;
  usage: string;
  defaultRuns: number;
  run: (context: SuiteContext) => Promise<SuiteVerdict>;
}

const DEFAULT_BASE_URL = 'https://novelforge.shadow-apps.test';

const COMMON_USAGE = `Common flags:
  --base-url <url>      Novel Forge origin (env NF_EVAL_BASE_URL, then E2E_NOVEL_FORGE_URL; default ${DEFAULT_BASE_URL})
  --out <dir>           output dir (env NF_EVAL_OUT_DIR; default <os tmpdir>/novel-forge-evals). Must be outside the repo or git-ignored.
  --runs <n>            repetitions (each on a fresh project)
  --tier <tier>         cost tier for turns and the project: ${COST_TIERS.join(' | ')} (default: the project's own)
  --keep-projects       leave the eval projects on the server instead of deleting them
  --insecure            accept a self-signed certificate (implied for *.test hosts)
  --dry-run             run the whole suite against the in-process fake Forge: no network, no model calls, no cost
  --fake-faults         with --dry-run: the fake breaks every gated rule, so a correct harness must report FAIL
  --help                print this help

Auth (live runs): NF_EVAL_TOKEN (a bearer token for audience api://novel-forge), or NF_EVAL_STORAGE_STATE (a Playwright
storage-state JSON, e.g. e2e/.auth/user1.json from the e2e setup project), or NF_EVAL_COOKIE (a raw Cookie header).`;

function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (!arg.startsWith('--')) throw new EvalError(`Unexpected argument "${arg}" — every option is a --flag`);
    const [name, inline] = arg.slice(2).split('=', 2) as [string, string | undefined];
    const next = argv[index + 1];
    if (inline !== undefined) flags.set(name, inline);
    else if (next !== undefined && !next.startsWith('--')) {
      flags.set(name, next);
      index += 1;
    } else flags.set(name, true);
  }
  return flags;
}

export function stringFlag(flags: Flags, name: string, env?: string): string | undefined {
  const value = flags.get(name);
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value === true) throw new EvalError(`--${name} needs a value`);
  const fromEnv = env ? process.env[env]?.trim() : undefined;
  return fromEnv || undefined;
}

export function intFlag(flags: Flags, name: string, fallback: number): number {
  const raw = stringFlag(flags, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new EvalError(`--${name} must be a positive integer`);
  return value;
}

function tierFlag(flags: Flags, name = 'tier'): CostTier | null {
  const raw = stringFlag(flags, name);
  if (raw === undefined) return null;
  if (!(COST_TIERS as readonly string[]).includes(raw)) throw new EvalError(`--${name} must be one of ${COST_TIERS.join(', ')}`);
  return raw as CostTier;
}

function cookieHeaderFromStorageState(file: string, host: string): { cookie: string; csrf?: string } {
  if (!existsSync(file)) throw new EvalError(`NF_EVAL_STORAGE_STATE points at ${file}, which does not exist`);
  const state = JSON.parse(readFileSync(file, 'utf-8')) as { cookies?: { name: string; value: string; domain: string }[] };
  const cookies = (state.cookies ?? []).filter(
    cookie => host === cookie.domain.replace(/^\./, '') || host.endsWith(cookie.domain.startsWith('.') ? cookie.domain : `.${cookie.domain}`),
  );
  if (cookies.length === 0) throw new EvalError(`${file} holds no cookies for ${host} — re-run the e2e setup project against this host`);
  const csrfCookie = cookies.find(cookie => cookie.name === 'csrf-token');
  return { cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '), csrf: csrfCookie?.value.split(':')[1] };
}

function resolveAuth(baseUrl: string): ForgeAuth {
  const token = process.env['NF_EVAL_TOKEN']?.trim();
  if (token) return { kind: 'bearer', token };
  const storageState = process.env['NF_EVAL_STORAGE_STATE']?.trim();
  if (storageState) return { kind: 'cookie', ...cookieHeaderFromStorageState(storageState, new URL(baseUrl).hostname) };
  const cookie = process.env['NF_EVAL_COOKIE']?.trim();
  if (cookie) return { kind: 'cookie', cookie, csrf: /(?:^|;\s*)csrf-token=[^:;]*:([^;]+)/.exec(cookie)?.[1] };
  return { kind: 'none' };
}

async function buildApi(flags: Flags, dryRun: boolean): Promise<ForgeApi> {
  if (dryRun) return new FakeForgeApi({ faulty: flags.has('fake-faults') });
  const baseUrl = (stringFlag(flags, 'base-url', 'NF_EVAL_BASE_URL') ?? process.env['E2E_NOVEL_FORGE_URL']?.trim() ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const auth = resolveAuth(baseUrl);
  if (auth.kind === 'none') throw new EvalError('No credentials: set NF_EVAL_TOKEN, NF_EVAL_STORAGE_STATE or NF_EVAL_COOKIE (or pass --dry-run)');
  const insecureTls = flags.has('insecure') || new URL(baseUrl).hostname.endsWith('.test');
  const api = new HttpForgeApi({ baseUrl, auth, insecureTls, turnTimeoutMs: 20 * 60_000 });
  await api.whoami();
  return api;
}

/** Parses the common flags, builds the target (live or fake), runs the suite and exits with its gate: 0 pass or advisory, 1 fail, 2 usage/setup error. */
export async function runSuite(definition: SuiteDefinition): Promise<void> {
  try {
    const flags = parseFlags(process.argv.slice(2));
    if (flags.has('help')) {
      log.info(`${definition.usage}\n\n${COMMON_USAGE}`);
      process.exit(0);
    }
    const dryRun = flags.has('dry-run');
    const outDir = assertSafeOutDir(stringFlag(flags, 'out', 'NF_EVAL_OUT_DIR') ?? defaultOutDir());
    const api = await buildApi(flags, dryRun);
    const sink = new OutputSink(outDir, definition.name);
    const tier = tierFlag(flags);
    const context: SuiteContext = {
      flags,
      api,
      sink,
      dryRun,
      runs: intFlag(flags, 'runs', definition.defaultRuns),
      tier,
      keepProjects: flags.has('keep-projects'),
      author: (runLabel, overrideTier) =>
        new Author(api, sink, { runLabel, tier: overrideTier === undefined ? tier : overrideTier, jobTimeoutMs: dryRun ? 5_000 : 30 * 60_000, pollMs: dryRun ? 1 : 2_000 }),
    };
    log.info(`${definition.name}: ${dryRun ? 'DRY RUN against the in-process fake' : `live against ${api.target}`}; output ${sink.suiteDir}`);
    const verdict = await definition.run(context);
    const label = verdict.passed === null ? 'ADVISORY' : verdict.passed ? 'PASS' : 'FAIL';
    (verdict.passed === false ? log.error : log.success)(`${definition.name}: ${label} — ${verdict.headline}`);
    log.info(`results in ${sink.suiteDir}`);
    process.exit(verdict.passed === false ? 1 : 0);
  } catch (error) {
    const code = reportError(error);
    process.exit(code === 1 ? 2 : code);
  }
}

/** Deletes a project the suite made unless the author asked to keep it; a failed delete is reported, never fatal. */
export async function cleanup(context: SuiteContext, projectId: string): Promise<void> {
  if (context.keepProjects) return;
  try {
    await context.api.deleteProject(projectId);
  } catch (error) {
    log.warn(`could not delete project ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
