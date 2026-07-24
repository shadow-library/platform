/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { isRepoType, type RepoType, TYPE_DEPENDENCIES } from '@lib/config';
import { log, type PackageJson, readPackageJson, run } from '@lib/utils';

/**
 * Defining types
 */
export interface InitOptions {
  cwd: string;
  /** Repo type (from `--type`). When omitted, `init` prompts interactively on a TTY, else defaults to `library`. */
  type?: RepoType;
}

/**
 * Declaring the constants
 */
const PRE_COMMIT_HOOK = 'shadow verify\n';
const COMMIT_MSG_HOOK = 'shadow commit-msg "$1"\n';

/** The prettier config `init` drops in the parent so a bare `prettier` run uses the shared shadow ruleset. */
const PRETTIER_CONFIG_FILE = 'prettier.config.mjs';
const PRETTIER_CONFIG_CONTENT = `// Shared prettier config — the same ruleset \`shadow verify\` formats with (base rules merged with
// this repo's \`.shadowrc.json\` \`verify.format\`), so a bare \`prettier\` run — editor format-on-save,
// \`bunx prettier --write\` — matches instead of falling back to prettier's own defaults. Managed by
// \`shadow init\`; delete this line and edit freely to take it over.
import { getPrettierConfig } from '@shadow-library/scripts/prettier';

export default getPrettierConfig();
`;

/**
 * Prettier config files, in prettier's own resolution order. A repo that already declares one (or a
 * package.json "prettier" key) configures prettier its own way, so `init` never drops a competing file.
 */
const PRETTIER_CONFIG_FILENAMES = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.json5',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierrc.toml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  '.prettierrc.ts',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  'prettier.config.ts',
];

/** The `.shadowrc.json` a fresh repo of each type starts from — only the fields that type actually uses. */
const STARTER_CONFIG: Record<RepoType, Record<string, unknown>> = {
  library: { type: 'library', build: { exports: { '.': 'index' } } },
  component: { type: 'component', build: { exports: { '.': 'index', './styles.css': 'styles.css' }, alias: { '@/': 'src/' } } },
  backend: { type: 'backend', build: { entry: 'src/main.ts' } },
  spa: { type: 'spa' },
  ssr: { type: 'ssr' },
};

/** The build-tooling packages a repo of `type` needs that aren't already declared in its package.json. */
export function missingDependencies(packageJson: PackageJson, type: RepoType): string[] {
  const declared = new Set([...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.devDependencies ?? {}), ...Object.keys(packageJson.peerDependencies ?? {})]);
  return TYPE_DEPENDENCIES[type].filter(dep => !declared.has(dep));
}

/** Installs the repo type's build tooling as devDependencies (idempotent) — so each repo pulls only what its type builds with. */
function installTypeDependencies(cwd: string, packageJson: PackageJson, type: RepoType): void {
  const missing = missingDependencies(packageJson, type);
  if (missing.length === 0) return;
  log.info(`installing  ${type} build tooling: ${missing.join(', ')}`);
  const result = run('bun', ['add', '-D', ...missing], { cwd, stream: false });
  if (result.status !== 0) log.warn(`failed to install build tooling — run manually: bun add -D ${missing.join(' ')}`);
  else log.info(`installed   ${missing.length} package(s)`);
}

/** Resolves the repo type: the `--type` flag if valid, otherwise an interactive prompt on a TTY, otherwise `library`. */
function resolveRepoType(explicit: RepoType | undefined): RepoType {
  if (explicit) return explicit;
  if (!process.stdin.isTTY) return 'library';
  const answer = (prompt('Repo type? (library / backend / spa / ssr)', 'library') ?? 'library').trim();
  if (isRepoType(answer)) return answer;
  log.warn(`unknown type "${answer}" — defaulting to "library"`);
  return 'library';
}

/** Old/known hook contents that `init` may safely overwrite when re-wiring a repo onto shadow. */
const REPLACEABLE_HOOKS = new Set([
  'bun verify',
  'shadow verify',
  'bunx shadow verify',
  'bun lint\n\nbun type-check\n\nbun test',
  'bunx commitlint --edit $1',
  'bunx commitlint --edit "$1"',
  'npx commitlint --edit $1',
  'shadow commit-msg "$1"',
]);

/**
 * Writes a husky hook, but never clobbers one whose contents this command doesn't recognize — a repo
 * that has customized its `pre-commit`/`commit-msg` keeps it, and is told so.
 */
function writeHook(huskyDir: string, name: string, content: string): void {
  const hookPath = path.join(huskyDir, name);
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf-8').trim();
    if (existing === content.trim()) {
      log.info(`unchanged  .husky/${name}`);
      return;
    }
    if (!REPLACEABLE_HOOKS.has(existing)) {
      log.warn(`skipped    .husky/${name} (has custom content — left as-is)`);
      return;
    }
    fs.writeFileSync(hookPath, content);
    log.info(`updated    .husky/${name}`);
    return;
  }
  fs.writeFileSync(hookPath, content);
  log.info(`created    .husky/${name}`);
}

/**
 * True when the repo already configures prettier some other way — a config file `init` didn't write, or
 * a package.json `"prettier"` key — so `init` leaves prettier alone rather than dropping a competing config.
 */
export function hasForeignPrettierConfig(cwd: string, packageJson: PackageJson): boolean {
  if (packageJson.prettier !== undefined) return true;
  return PRETTIER_CONFIG_FILENAMES.filter(name => name !== PRETTIER_CONFIG_FILE).some(name => fs.existsSync(path.join(cwd, name)));
}

/**
 * Drops a `prettier.config.mjs` that re-exports the shared `@shadow-library/scripts/prettier` config, so
 * a bare `prettier` run in the repo uses the same ruleset `shadow verify` does. Never clobbers a
 * customized config: an existing `prettier.config.mjs` with different content, or any other prettier
 * config the repo already declares, is left as-is. Idempotent.
 */
function writePrettierConfig(cwd: string, packageJson: PackageJson): void {
  const configPath = path.join(cwd, PRETTIER_CONFIG_FILE);
  if (fs.existsSync(configPath)) {
    const existing = fs.readFileSync(configPath, 'utf-8').trim();
    if (existing === PRETTIER_CONFIG_CONTENT.trim()) log.info(`unchanged  ${PRETTIER_CONFIG_FILE}`);
    else log.warn(`skipped    ${PRETTIER_CONFIG_FILE} (has custom content — left as-is)`);
    return;
  }
  if (hasForeignPrettierConfig(cwd, packageJson)) {
    log.info(`skipped    ${PRETTIER_CONFIG_FILE} (repo already configures prettier)`);
    return;
  }
  fs.writeFileSync(configPath, PRETTIER_CONFIG_CONTENT);
  log.info(`created    ${PRETTIER_CONFIG_FILE}`);
}

/**
 * Sets up husky the ecosystem way: ensures a `prepare: husky` script, activates husky, and wires the
 * `pre-commit` → `shadow verify` and `commit-msg` → `shadow commit-msg "$1"` hooks — so a repo needs no
 * hand-written hooks or `commitlint.config.js`. Drops a starter `.shadowrc.json` and a
 * `prettier.config.mjs` (re-exporting the shared ruleset) if absent. Idempotent.
 */
export async function init(options: InitOptions): Promise<void> {
  const repoType = resolveRepoType(options.type);
  const { filePath: packageJsonPath, data: packageJson } = readPackageJson(options.cwd);

  const scripts = (packageJson.scripts ??= {});
  if (scripts.prepare !== 'husky') {
    scripts.prepare = 'husky';
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    log.info('set        package.json scripts.prepare = "husky"');
  }

  // Activate husky (creates .husky/_ and points git at it); tolerate a not-yet-initialized git repo.
  const husky = run('bunx', ['husky'], { cwd: options.cwd, stream: false });
  if (husky.status !== 0) log.warn('husky activation skipped (not a git repo yet?) — re-run after "git init"');

  const huskyDir = path.join(options.cwd, '.husky');
  fs.mkdirSync(huskyDir, { recursive: true });
  writeHook(huskyDir, 'pre-commit', PRE_COMMIT_HOOK);
  writeHook(huskyDir, 'commit-msg', COMMIT_MSG_HOOK);

  const shadowrcPath = path.join(options.cwd, '.shadowrc.json');
  if (fs.existsSync(shadowrcPath)) {
    log.info('unchanged  .shadowrc.json (already present)');
  } else {
    fs.writeFileSync(shadowrcPath, `${JSON.stringify(STARTER_CONFIG[repoType], null, 2)}\n`);
    log.info(`created    .shadowrc.json (type: ${repoType})`);
  }

  writePrettierConfig(options.cwd, packageJson);

  installTypeDependencies(options.cwd, packageJson, repoType);

  log.success('shadow init complete');
}
