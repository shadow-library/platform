/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { ShadowError } from '@lib/utils/errors';

/**
 * Defining types
 */
export interface PackageJson {
  name?: string;
  version?: string;
  type?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  sideEffects?: boolean | string[];
  bin?: string | Record<string, string>;
  [key: string]: unknown;
}

/**
 * Declaring the constants
 */

/** Reads and parses `<dir>/package.json`, failing with a diagnostic message rather than a raw JSON parse error. */
export function readPackageJson(dir: string): {
  filePath: string;
  data: PackageJson;
} {
  const filePath = path.join(dir, 'package.json');
  if (!fs.existsSync(filePath)) throw new ShadowError(`No package.json found at ${filePath}`);

  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return { filePath, data: JSON.parse(raw) as PackageJson };
  } catch (cause) {
    throw new ShadowError(`Failed to parse ${filePath}: not valid JSON`, { cause });
  }
}

/**
 * Returns the first script (in `names` order) that exists in `scripts`. Lets callers accept
 * repo-specific naming drift (e.g. `type-check` vs `typecheck`) without guessing which one wins.
 */
export function findScript(scripts: Record<string, string> | undefined, names: string[]): { name: string; command: string } | undefined {
  if (!scripts) return undefined;
  for (const name of names) {
    const command = scripts[name];
    if (command) return { name, command };
  }
  return undefined;
}

/** Resolves `dirArg` (defaulting to `cwd`) to an absolute path and confirms it is an existing directory. */
export function resolveExistingDir(dirArg: string | undefined, cwd: string): string {
  const resolved = path.resolve(cwd, dirArg ?? '.');
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new ShadowError(`Not a directory: ${resolved}`);
  return resolved;
}
