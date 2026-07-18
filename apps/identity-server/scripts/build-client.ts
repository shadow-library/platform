/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Bundles the browser client into `public/`: `assets/main.js` + `assets/main.css` (Bun emits the
 * imported CSS as a sibling artifact), the self-hosted font files, and `index.html`. The output
 * names are fixed so the HTML template needs no rewriting; cache-busting rides the build id
 * query the server appends when serving.
 */
const rootDir = path.join(import.meta.dirname, '..');
const publicDir = path.join(rootDir, 'public');
const assetsDir = path.join(publicDir, 'assets');

const FONT_FILES = [
  '@fontsource/fraunces/files/fraunces-latin-600-normal.woff2',
  '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-400-normal.woff2',
  '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-500-normal.woff2',
  '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-700-normal.woff2',
  '@fontsource/spline-sans-mono/files/spline-sans-mono-latin-500-normal.woff2',
];

export async function buildClient(): Promise<void> {
  fs.rmSync(publicDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(assetsDir, 'fonts'), { recursive: true });

  const result = await Bun.build({
    entrypoints: [path.join(rootDir, 'client', 'main.tsx')],
    outdir: assetsDir,
    target: 'browser',
    minify: true,
    naming: { entry: '[dir]/main.[ext]', asset: '[dir]/[name]-[hash].[ext]' },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    // Optional peer of @shadow-library/ui reached only through the unused useSearchParams hook;
    // the package marks js modules side-effect free, so tree-shaking drops the import entirely.
    external: ['@tanstack/react-router'],
  });
  if (!result.success) throw new Error(`Client build failed:\n${result.logs.join('\n')}`);

  for (const file of FONT_FILES) {
    const source = path.join(rootDir, 'node_modules', file);
    fs.copyFileSync(source, path.join(assetsDir, 'fonts', path.basename(file)));
  }
  fs.copyFileSync(path.join(rootDir, 'client', 'styles', 'fonts.css'), path.join(assetsDir, 'fonts.css'));
  fs.copyFileSync(path.join(rootDir, 'client', 'index.html'), path.join(publicDir, 'index.html'));
}

if (import.meta.main) {
  const startTime = process.hrtime();
  await buildClient();
  const [seconds, nanoseconds] = process.hrtime(startTime);
  console.log('\x1b[32m%s\x1b[0m', `Client built in ${(seconds * 1e3 + nanoseconds * 1e-6).toFixed(0)}ms`); // eslint-disable-line no-console
}
