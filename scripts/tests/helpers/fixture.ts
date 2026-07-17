/**
 * Importing npm packages
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** Creates a temporary directory for integration tests to build a throwaway fixture repo in. */
export function createFixtureDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeFixtureDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Writes `files` (relative path → content) into `dir`, creating parent directories as needed. */
export function writeFixtureFiles(dir: string, files: Record<string, string>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
}
