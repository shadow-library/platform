import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const APP_DIR = 'apps/pulse-web';

interface IgnoreRule {
  glob: Bun.Glob;
  negated: boolean;
}

function dockerignoreRules(): IgnoreRule[] {
  return readFileSync(`${REPO_ROOT}.dockerignore`, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const negated = line.startsWith('!');
      const pattern = (negated ? line.slice(1) : line).replace(/^\/+/, '').replace(/\/+$/, '');
      return { glob: new Bun.Glob(pattern), negated };
    });
}

/** Docker excludes a path when the last rule matching it, or any directory above it, is not a negation. */
function isExcludedFromContext(path: string, rules: IgnoreRule[]): boolean {
  const segments = path.split('/');
  const selfAndParents = segments.map((_, index) => segments.slice(0, index + 1).join('/'));
  return rules.reduce((excluded, rule) => (selfAndParents.some(candidate => rule.glob.match(candidate)) ? !rule.negated : excluded), false);
}

describe('pulse-web image build context', () => {
  it('should send every source file to the image build', () => {
    const rules = dockerignoreRules();
    const sources = [...new Bun.Glob('src/**/*').scanSync({ cwd: `${REPO_ROOT}${APP_DIR}` })].map(file => `${APP_DIR}/${file}`);

    expect(sources.length).toBeGreaterThan(0);
    expect(sources.filter(source => isExcludedFromContext(source, rules))).toEqual([]);
  });
});
