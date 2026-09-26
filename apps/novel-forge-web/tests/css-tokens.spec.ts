import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_SRC = fileURLToPath(new URL('../src', import.meta.url));
const UI_SRC = fileURLToPath(new URL('../../../packages/ui/src', import.meta.url));

const KNOWN_UNDEFINED: Record<string, readonly string[]> = {
  'components/nf/ImageUpload.module.css': ['--sh-border'],
  'components/nf/ImageGallery.module.css': ['--sh-border'],
  'routes/novels/$novelId/publish.module.css': ['--sh-surface-muted'],
};

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.css'))
    .map(entry => join(entry.parentPath, entry.name));
}

const defined = new Set(cssFiles(UI_SRC).flatMap(file => [...readFileSync(file, 'utf-8').matchAll(/(--sh-[a-z0-9-]+)\s*:/g)].map(match => match[1])));

function undefinedTokens(file: string): string[] {
  const used = [...readFileSync(file, 'utf-8').matchAll(/var\((--sh-[a-z0-9-]+)\s*[,)]/g)].map(match => match[1] ?? '');
  return [...new Set(used)].filter(token => !defined.has(token)).sort();
}

describe('app CSS tokens', () => {
  it('should reference only design tokens the ui package defines', () => {
    const offenders = Object.fromEntries(
      cssFiles(APP_SRC)
        .map(file => [relative(APP_SRC, file), undefinedTokens(file)] as const)
        .filter(([file, tokens]) => tokens.length > 0 && tokens.join() !== [...(KNOWN_UNDEFINED[file] ?? [])].sort().join()),
    );
    expect(offenders).toEqual({});
  });
});
