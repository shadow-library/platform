import fs from 'node:fs';
import path from 'node:path';

import { ShadowError } from './errors.ts';

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

export function findScript(scripts: Record<string, string> | undefined, names: string[]): { name: string; command: string } | undefined {
  if (!scripts) return undefined;
  for (const name of names) {
    const command = scripts[name];
    if (command) return { name, command };
  }
  return undefined;
}
