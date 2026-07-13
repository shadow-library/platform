/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

import alias from '@rollup/plugin-alias';
import nodeResolve from '@rollup/plugin-node-resolve';
import postcssImport from 'postcss-import';
import { type OutputOptions, rollup } from 'rollup';
import banner2 from 'rollup-plugin-banner2';
import esbuild from 'rollup-plugin-esbuild';
import postcss from 'rollup-plugin-postcss';

/**
 * Declaring the constants
 */
const rootDir = path.join(import.meta.dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

const formatTime = (time: number) => (time < 1000 ? `${time.toFixed(0)}ms` : `${(time / 1000).toFixed(3)}s`);
const success = (message: string) => console.log('\x1b[32m%s\x1b[0m', message);
// biome-ignore lint: allow-console
const error = (message: string) => (console.error('\x1b[31m%s\x1b[0m', message), process.exit(1));

async function build() {
  const startTime = performance.now();

  /** Cleaning previous build */
  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
  fs.mkdirSync(distDir);

  /** Running Rollup */
  const output: OutputOptions = {
    format: 'es',
    dir: distDir,
    preserveModules: true,
    preserveModulesRoot: 'src',
    entryFileNames: '[name].js',
    sourcemap: true,
  };

  const bundle = await rollup({
    input: [path.join(srcDir, 'index.ts'), path.join(srcDir, 'router.ts')],
    external: id => !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('@/'),
    plugins: [
      alias({ entries: [{ find: /^@\/(.*)/, replacement: path.resolve(srcDir, '$1') }] }),
      nodeResolve({ extensions: ['.ts', '.tsx', '.js', '.jsx'] }),
      esbuild({ target: 'es2022', jsx: 'automatic', tsconfig: path.join(rootDir, 'tsconfig.build.json') }),
      postcss({
        plugins: [postcssImport()],
        autoModules: true,
        modules: { generateScopedName: 'sh-[local]_[hash:base64:5]' },
        extract: 'styles.css',
        minimize: true,
        sourceMap: true,
      }),
      banner2(chunk => {
        const id = chunk.facadeModuleId ?? '';
        if (id.endsWith('.tsx') || id.includes('/hooks/') || id.endsWith('/router.ts')) return "'use client';\n";
        return '';
      }),
    ],
  });

  await bundle.write(output);
  await bundle.close();

  /** Generating type declarations */
  let result = Bun.spawnSync(['bun', 'tsc', '-p', 'tsconfig.build.json'], { cwd: rootDir, stdio: ['inherit', 'inherit', 'inherit'] });
  if (result.exitCode === 0) result = Bun.spawnSync(['bunx', 'tsc-alias', '-p', 'tsconfig.build.json'], { cwd: rootDir, stdio: ['inherit', 'inherit', 'inherit'] });
  if (result.exitCode !== 0) error('TypeScript declaration generation failed');

  /** Stripping side-effect CSS imports from emitted declarations — they reference source-only paths
   *  (e.g. './styles/index.css') that don't exist in dist and aren't needed in types (CSS ships
   *  separately as styles.css). Left in, they make consumers with `skipLibCheck: false` fail to resolve. */
  const stripCssImports = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stripCssImports(full);
      else if (entry.name.endsWith('.d.ts')) {
        const content = fs.readFileSync(full, 'utf-8');
        const stripped = content.replace(/^\s*import\s+['"][^'"]+\.css['"];?[^\n]*\n?/gm, '');
        if (stripped !== content) fs.writeFileSync(full, stripped);
      }
    }
  };
  stripCssImports(distDir);

  /** Emitting a @layer-wrapped variant so consumers can de-prioritize library styles */
  const stylesContent = fs.readFileSync(path.join(distDir, 'styles.css'), 'utf-8');
  fs.writeFileSync(path.join(distDir, 'styles.layer.css'), `@layer shadow-library {\n${stylesContent}\n}\n`);

  /** Generating dist/package.json */
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  const distPackageJson = structuredClone(packageJson);
  distPackageJson.main = './index.js';
  distPackageJson.module = './index.js';
  distPackageJson.types = './index.d.ts';
  distPackageJson.exports = {
    '.': { types: './index.d.ts', default: './index.js' },
    './router': { types: './router.d.ts', default: './router.js' },
    './styles.css': './styles.css',
    './styles.layer.css': './styles.layer.css',
    './package.json': './package.json',
  };
  distPackageJson.sideEffects = ['*.css'];
  delete distPackageJson.scripts;
  delete distPackageJson.devDependencies;
  fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify(distPackageJson, null, 2));

  /** Copying supporting files */
  fs.copyFileSync(path.join(rootDir, 'README.md'), path.join(distDir, 'README.md'));
  fs.copyFileSync(path.join(rootDir, 'LICENSE'), path.join(distDir, 'LICENSE'));

  const timeTaken = performance.now() - startTime;
  success(`Built successfully in ${formatTime(timeTaken)}`);
}

build().catch(err => error(err.message));
