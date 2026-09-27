/**
 * Importing npm packages
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { AI_ROLES } from './forge-db';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * `failPin` pins the roles `AI_ROLES` names, a copy of the server's list. A role added on the server and missed here would route
 * unpinned, so this reads the server's own source — the router's `AiRole` union and its `ROLE_GROUP` table — and compares.
 */

const SERVER_DEFAULTS = path.join(import.meta.dirname, '..', '..', '..', 'apps', 'novel-forge-server', 'src', 'modules', 'ai', 'defaults.ts');

function section(source: string, pattern: RegExp, what: string): string {
  const match = pattern.exec(source);
  expect(match?.[1], `${what} in ${SERVER_DEFAULTS}`).toBeDefined();
  return match?.[1] ?? '';
}

test.describe('novel-forge fail-pin roles', () => {
  test('should fail-pin every role the server routes', () => {
    test.skip(!existsSync(SERVER_DEFAULTS), 'the Novel Forge server source is not beside this suite');
    const source = readFileSync(SERVER_DEFAULTS, 'utf8');

    const union = [...section(source, /export type AiRole =([\s\S]*?);/, 'the AiRole union').matchAll(/'([a-z-]+)'/g)].map(match => match[1]);
    const routed = [...section(source, /export const ROLE_GROUP[^=]*= \{([\s\S]*?)\n\};/, 'the ROLE_GROUP table').matchAll(/^\s*([a-z-]+):/gm)].map(match => match[1]);

    expect(union.length, 'the AiRole union was parsed').toBeGreaterThan(0);
    expect([...AI_ROLES].sort(), 'AI_ROLES matches the AiRole union').toEqual([...union].sort());
    expect([...AI_ROLES].sort(), 'AI_ROLES matches every role ROLE_GROUP routes').toEqual([...routed].sort());
  });
});
