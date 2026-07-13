/**
 * Standalone SSR smoke test for the *built* package. Runs in plain Node (no Vite, no bundler) so it
 * proves the published `dist` is import-safe, server-renderable, and deterministic — the exact things a
 * Node/SSR consumer needs. Exits non-zero with a message on the first failed assertion. Driven by
 * `src/ssr.dist.test.ts`, but also runnable directly: `node scripts/ssr-smoke.mjs`.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const h = React.createElement;
const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const distEntry = pathToFileURL(path.join(distDir, 'index.js')).href;
const routerEntry = pathToFileURL(path.join(distDir, 'router.js')).href;

// 1. Importing the built main entry must not throw in a plain Node runtime (regression: import.meta.env).
const UI = await import(distEntry);
assert.ok(Object.keys(UI).length > 100, 'main entry should export the full public surface');

// 2. The router subpath must import on its own and expose the hook that pulls @tanstack/react-router.
const router = await import(routerEntry);
assert.equal(typeof router.useSearchParams, 'function', 'router subpath should export useSearchParams');
assert.ok(!('useSearchParams' in UI), 'useSearchParams must NOT be on the root entry (moved to /router)');

// 3. A representative set must server-render without throwing.
const cases = [
  ['Button', h(UI.Button, null, 'Save')],
  ['Badge', h(UI.Badge, null, 'New')],
  ['Alert', h(UI.Alert, { title: 'Heads up' }, 'Body')],
  ['Avatar', h(UI.Avatar, { name: 'Ada Lovelace' })],
  ['Input', h(UI.Input, null)],
  ['Textarea', h(UI.Textarea, null)],
  ['Checkbox', h(UI.Checkbox, null)],
  ['Switch', h(UI.Switch, null)],
  ['Progress', h(UI.Progress, { value: 40 })],
  ['Spinner', h(UI.Spinner, null)],
  ['Kbd', h(UI.Kbd, { keys: 'mod+k' })],
  ['Statistic', h(UI.Statistic, { label: 'Revenue', value: 1234567 })],
  ['Pagination', h(UI.Pagination, { page: 1, pageSize: 10, total: 1234, onPageChange() {} })],
  ['Calendar', h(UI.Calendar, null)],
  ['DatePicker', h(UI.DatePicker, null)],
  ['Slider', h(UI.Slider, { defaultValue: 30 })],
  ['Tooltip', h(UI.TooltipProvider, null, h(UI.Tooltip, { content: 'hi' }, h('button', null, 'x')))],
  ['Dialog', h(UI.Dialog, { trigger: h('button', null, 'open'), title: 'T' }, 'content')],
  ['Select', h(UI.Select, { placeholder: 'Pick' }, h(UI.SelectItem, { value: 'a' }, 'A'))],
  ['SplitPane', h(UI.SplitPane, null, h(UI.SplitPane.Pane, null, 'a'), h(UI.SplitPane.Handle, null), h(UI.SplitPane.Pane, null, 'b'))],
  ['Toaster', h(UI.Toaster, null)],
  ['BannerOutlet', h(UI.BannerOutlet, null)],
  ['ThemeProvider', h(UI.ThemeProvider, null, h('span', null, 'themed'))],
  ['ClientOnly', h(UI.ClientOnly, null, h('span', null, 'client'))],
];
for (const [name, node] of cases) {
  assert.doesNotThrow(() => renderToStaticMarkup(node), `${name} should server-render without throwing`);
}

// 4. Platform detection must not leak into server output: Kbd renders the non-Mac glyph regardless of
//    the server OS (this machine's Node exposes navigator.platform === 'MacIntel').
const kbd = renderToStaticMarkup(h(UI.Kbd, { keys: 'mod+k' }));
assert.ok(kbd.includes('Ctrl') && kbd.includes('Control K'), 'Kbd should render the deterministic non-Mac form on the server');
assert.ok(!kbd.includes('⌘'), 'Kbd must not render the Mac glyph during SSR');

// 5. Number/date formatting must use the pinned locale, not the runtime default locale.
const stat = renderToStaticMarkup(h(UI.Statistic, { label: 'x', value: 1234567, format: { notation: 'compact' } }));
assert.ok(stat.includes('1.2M') && stat.includes('1,234,567'), `Statistic should format with en-US default, got: ${stat}`);
const pag = renderToStaticMarkup(h(UI.Pagination, { page: 1, pageSize: 10, total: 1234, onPageChange() {} }));
assert.ok(pag.includes('Showing 1 to 10 of 1,234'), `Pagination summary should be en-US, got a mismatch`);

// 6. Determinism: rendering the same tree twice yields identical markup.
const once = renderToStaticMarkup(h(UI.Statistic, { label: 'x', value: 1234567 }));
const twice = renderToStaticMarkup(h(UI.Statistic, { label: 'x', value: 1234567 }));
assert.equal(once, twice, 'repeated server renders must be byte-identical');

// 7. Client-only store state must never leak into server HTML (no cross-request bleed via the singleton).
UI.toast.success('leak-canary-toast');
assert.equal(renderToStaticMarkup(h(UI.Toaster, null)), '', 'Toaster must render nothing on the server even after toast() was called');
UI.bannerStore.register({ id: 'leak', message: 'leak-canary-banner' });
assert.ok(!renderToStaticMarkup(h(UI.BannerOutlet, null)).includes('leak-canary-banner'), 'BannerOutlet must not emit registered banners during SSR');

// 8. The standardized shared surface (moved in from the apps) must be exported and SSR-safe.
for (const name of ['ThemeProvider', 'ClientOnly', 'useTheme', 'themeInitScript', 'derivePaginationState', 'calculatePageUpdate', 'toPositiveInt', 'copyText', 'downloadTextFile', 'getInitials']) {
  assert.equal(typeof UI[name], 'function', `${name} should be exported from the root entry`);
}
assert.ok(renderToStaticMarkup(h(UI.ThemeProvider, null, h('span', null, 'themed'))).includes('themed'), 'ThemeProvider should render its children on the server');
assert.equal(renderToStaticMarkup(h(UI.ClientOnly, null, h('span', null, 'x'))), '', 'ClientOnly should render nothing on the server');
assert.equal(UI.derivePaginationState(95, 3, 20).skip, 40, 'derivePaginationState should be pure and correct');
assert.equal(typeof router.NavProgress, 'function', 'router subpath should export NavProgress');

console.log('SSR-SMOKE-OK');
