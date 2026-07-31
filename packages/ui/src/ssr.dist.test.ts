/**
 * Importing npm packages
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */

/**
 * Declaring the constants
 */
const rootDir = path.join(import.meta.dirname, '..');
const distDir = path.join(rootDir, 'dist');
const srcDir = path.join(rootDir, 'src');
const distEntry = path.join(distDir, 'index.js');

/** Newest mtime across the inputs the build reads, so we only rebuild when the artifact is stale. */
function newestInputMtime(): number {
  let newest = 0;
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|css)$/.test(entry.name) && !entry.name.includes('.test.')) newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  };
  walk(srcDir);
  for (const file of ['package.json', '.shadowrc.json']) newest = Math.max(newest, fs.statSync(path.join(rootDir, file)).mtimeMs);
  return newest;
}

function ensureFreshBuild(): void {
  const built = fs.existsSync(distEntry) && fs.statSync(distEntry).mtimeMs >= newestInputMtime();
  if (built) return;
  execFileSync('bun', ['run', 'build'], { cwd: rootDir, stdio: 'pipe' });
}

/**
 * These tests exercise the compiled `dist` in a real Node process — the environment SSR consumers use —
 * rather than the Vite-transformed source (which hides Vite-only globals like `import.meta.env`).
 */
describe('built package (dist) SSR safety', () => {
  beforeAll(() => ensureFreshBuild(), 180_000);

  it('imports, server-renders, and stays deterministic in plain Node', () => {
    // The smoke script asserts import safety, render safety, locale/platform determinism, and no
    // store-state leakage; it exits non-zero (throwing here) with details on the first failure.
    const output = execFileSync('node', ['scripts/ssr-smoke.mjs'], { cwd: rootDir, encoding: 'utf-8' });
    expect(output).toContain('SSR-SMOKE-OK');
  });

  it('resolves every declared export target on disk', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(distDir, 'package.json'), 'utf-8')) as {
      main: string;
      module: string;
      types: string;
      exports: Record<string, string | Record<string, string>>;
    };
    const targets = new Set<string>([pkg.main, pkg.module, pkg.types]);
    for (const entry of Object.values(pkg.exports)) {
      if (typeof entry === 'string') targets.add(entry);
      else for (const value of Object.values(entry)) targets.add(value);
    }
    for (const target of targets) {
      expect(fs.existsSync(path.join(distDir, target)), `${target} should exist in dist`).toBe(true);
    }
  });

  it('ships declarations free of source-only CSS imports', () => {
    const dts = fs.readFileSync(path.join(distDir, 'index.d.ts'), 'utf-8');
    expect(dts).not.toMatch(/\.css['"]/);
  });

  it('exposes ./router with NavProgress and keeps it off the root entry', () => {
    expect(Object.keys(pkgExports())).toContain('./router');
    // The root barrel must not statically pull the optional @tanstack/react-router peer.
    const rootJs = fs.readFileSync(distEntry, 'utf-8');
    expect(rootJs).not.toMatch(/tanstack\/react-router/);
    const routerJs = fs.readFileSync(path.join(distDir, 'router.js'), 'utf-8');
    expect(routerJs).toMatch(/NavProgress/);
  });
});

function pkgExports(): Record<string, unknown> {
  return (JSON.parse(fs.readFileSync(path.join(distDir, 'package.json'), 'utf-8')) as { exports: Record<string, unknown> }).exports;
}
