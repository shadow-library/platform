/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { ShadowError } from './errors.ts';

/**
 * Defining types
 */
/** An `exports` entry: either a raw asset path (`"./dist/styles.css"`) or a conditions map. */
export type PackageExport = string | Record<string, string>;

export interface PackageJson {
  name?: string;
  version?: string;
  type?: string;
  workspaces?: string[];
  scripts?: Record<string, string>;
  exports?: Record<string, PackageExport>;
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
export function readPackageJson(dir: string): PackageJson {
  const filePath = path.join(dir, 'package.json');
  if (!fs.existsSync(filePath)) throw new ShadowError(`No package.json found at ${filePath}`);

  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(raw) as PackageJson;
  } catch (cause) {
    throw new ShadowError(`Failed to parse ${filePath}: not valid JSON`, { cause });
  }
}

/**
 * Returns the first script (in `names` order) that exists in `scripts`. Lets callers accept
 * naming drift (e.g. `type-check` vs `typecheck`) without guessing which one wins.
 */
export function findScript(scripts: Record<string, string> | undefined, names: string[]): { name: string; command: string } | undefined {
  if (!scripts) return undefined;
  for (const name of names) {
    const command = scripts[name];
    if (command) return { name, command };
  }
  return undefined;
}
