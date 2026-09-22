import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { loadPlugins, PLUGIN_ID_PATTERN, type PluginHostApi, validateManifest } from '@modules/plugins';

const noopHost: PluginHostApi = { log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } };

function manifestFor(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, version: '1.0.0', title: `Title ${id}`, description: `Description ${id}`, decisionPoints: ['call.route'], forms: {}, ...overrides };
}

function entrySourceFor(id: string): string {
  return `export default () => ({ id: ${JSON.stringify(id)}, manifest: () => (${JSON.stringify(manifestFor(id))}) });`;
}

interface PluginFiles {
  manifest?: string;
  entry?: string;
  entryName?: string;
}

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'nf-plugins-'));
  roots.push(root);
  return root;
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function writePlugin(root: string, id: string, files: PluginFiles = {}): void {
  writePartialPlugin(root, id, { manifest: files.manifest ?? JSON.stringify(manifestFor(id)), entry: files.entry ?? entrySourceFor(id), entryName: files.entryName });
}

function writePartialPlugin(root: string, id: string, files: PluginFiles): void {
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  if (files.manifest !== undefined) writeFileSync(join(dir, 'manifest.json'), files.manifest);
  if (files.entry !== undefined) writeFileSync(join(dir, files.entryName ?? 'index.ts'), files.entry);
}

describe('validateManifest', () => {
  it('should return the manifest when every declared member is well formed', () => {
    const raw = manifestFor('twin-track', {
      decisionPoints: ['brief.policy', 'call.route'],
      exclusive: ['call.route'],
      forms: { settings: { fields: [{ name: 'noteText', type: 'string', title: 'Note', widget: 'textarea', default: '' }], required: ['noteText'] } },
      actions: [{ id: 'suggest', op: 'suggest', label: 'Suggest', surface: 'settings', form: 'settings' }],
    });

    const manifest = validateManifest(raw, 'twin-track');

    expect(manifest.exclusive).toEqual(['call.route']);
    expect(manifest.forms.settings?.fields[0]?.widget).toBe('textarea');
    expect(manifest.actions?.[0]?.surface).toBe('settings');
  });

  it('should drop members the contract does not declare', () => {
    const manifest = validateManifest(manifestFor('alpha', { rogueField: 'ignored' }), 'alpha');

    expect(manifest).not.toHaveProperty('rogueField');
  });

  it('should reject a manifest whose id differs from the directory name', () => {
    expect(() => validateManifest(manifestFor('other'), 'alpha')).toThrow(/does not match the plugin directory/);
  });

  it('should reject a manifest that is not an object', () => {
    expect(() => validateManifest([], 'alpha')).toThrow(/must be an object/);
    expect(() => validateManifest(null, 'alpha')).toThrow(/must be an object/);
  });

  it('should reject a missing or empty identity field', () => {
    expect(() => validateManifest(manifestFor('alpha', { version: '' }), 'alpha')).toThrow(/version must be a non-empty string/);
    expect(() => validateManifest(manifestFor('alpha', { title: undefined }), 'alpha')).toThrow(/title must be a non-empty string/);
  });

  it('should reject an unknown decision point', () => {
    expect(() => validateManifest(manifestFor('alpha', { decisionPoints: ['canon.rewrite'] }), 'alpha')).toThrow(/decisionPoints\[0\] must be one of/);
  });

  it('should reject a repeated decision point', () => {
    expect(() => validateManifest(manifestFor('alpha', { decisionPoints: ['call.route', 'call.route'] }), 'alpha')).toThrow(/lists the same point twice/);
  });

  it('should reject an exclusive claim on a point that is not claimable', () => {
    expect(() => validateManifest(manifestFor('alpha', { decisionPoints: ['canon.augment'], exclusive: ['canon.augment'] }), 'alpha')).toThrow(/exclusive\[0\] must be one of/);
  });

  it('should reject a repeated exclusive claim', () => {
    const raw = manifestFor('alpha', { decisionPoints: ['call.route'], exclusive: ['call.route', 'call.route'] });

    expect(() => validateManifest(raw, 'alpha')).toThrow(/exclusive lists the same point twice/);
  });

  it('should reject two actions declaring the same id', () => {
    const raw = manifestFor('alpha', {
      actions: [
        { id: 'run', op: 'a', label: 'A', surface: 'novel' },
        { id: 'run', op: 'b', label: 'B', surface: 'novel' },
      ],
    });

    expect(() => validateManifest(raw, 'alpha')).toThrow(/actions declares the same id twice/);
  });

  it('should reject an exclusive claim on a point the plugin does not answer', () => {
    expect(() => validateManifest(manifestFor('alpha', { decisionPoints: ['call.route'], exclusive: ['brief.policy'] }), 'alpha')).toThrow(/not in decisionPoints/);
  });

  it('should reject a form field with an unknown type or widget', () => {
    const badType = manifestFor('alpha', { forms: { settings: { fields: [{ name: 'a', type: 'date', title: 'A' }] } } });
    const badWidget = manifestFor('alpha', { forms: { settings: { fields: [{ name: 'a', type: 'string', title: 'A', widget: 'slider' }] } } });

    expect(() => validateManifest(badType, 'alpha')).toThrow(/forms\.settings\.fields\[0\]\.type must be one of/);
    expect(() => validateManifest(badWidget, 'alpha')).toThrow(/forms\.settings\.fields\[0\]\.widget must be one of/);
  });

  it('should reject an enum on a field that is not a string', () => {
    const numberEnum = manifestFor('alpha', { forms: { settings: { fields: [{ name: 'a', type: 'number', title: 'A', enum: ['1', '2'] }] } } });
    const booleanEnum = manifestFor('alpha', { forms: { settings: { fields: [{ name: 'a', type: 'boolean', title: 'A', enum: ['true'] }] } } });

    expect(() => validateManifest(numberEnum, 'alpha')).toThrow(/forms\.settings\.fields\[0\]\.enum is only valid on a string field/);
    expect(() => validateManifest(booleanEnum, 'alpha')).toThrow(/forms\.settings\.fields\[0\]\.enum is only valid on a string field/);
  });

  it('should reject a required entry naming an undeclared field', () => {
    const raw = manifestFor('alpha', { forms: { settings: { fields: [{ name: 'a', type: 'string', title: 'A' }], required: ['b'] } } });

    expect(() => validateManifest(raw, 'alpha')).toThrow(/names an undeclared field: b/);
  });

  it('should reject an action pointing at an undeclared form', () => {
    const raw = manifestFor('alpha', { actions: [{ id: 'run', op: 'run', label: 'Run', surface: 'novel', form: 'missing' }] });

    expect(() => validateManifest(raw, 'alpha')).toThrow(/names an undeclared form: missing/);
  });
});

describe('PLUGIN_ID_PATTERN', () => {
  it('should reject a name that could escape the plugin directory', () => {
    expect(PLUGIN_ID_PATTERN.test('..')).toBe(false);
    expect(PLUGIN_ID_PATTERN.test('a/b')).toBe(false);
    expect(PLUGIN_ID_PATTERN.test('twin-track')).toBe(true);
  });
});

describe('loadPlugins', () => {
  // Bun transpiles the first dynamically imported plugin entry cold; paying that here keeps it out of the tests.
  beforeAll(async () => {
    const root = makeRoot();
    writePlugin(root, 'warmup');
    await loadPlugins(root, () => noopHost);
  });

  it('should return an empty list when the directory does not exist', async () => {
    await expect(loadPlugins(join(makeRoot(), 'absent'), () => noopHost)).resolves.toEqual([]);
  });

  it('should return an empty list when the path is a file rather than a directory', async () => {
    const root = makeRoot();
    const file = join(root, 'plugins.txt');
    writeFileSync(file, 'not a directory');

    await expect(loadPlugins(file, () => noopHost)).resolves.toEqual([]);
  });

  it('should return an empty list when a path component is a file rather than a directory', async () => {
    const root = makeRoot();
    writeFileSync(join(root, 'plugins.txt'), 'not a directory');

    await expect(loadPlugins(join(root, 'plugins.txt', 'sub'), () => noopHost)).resolves.toEqual([]);
  });

  it.if(process.getuid?.() !== 0)('should return an empty list when the directory cannot be read', async () => {
    const root = makeRoot();
    writePlugin(root, 'alpha');
    chmodSync(root, 0o000);

    try {
      await expect(loadPlugins(root, () => noopHost)).resolves.toEqual([]);
    } finally {
      chmodSync(root, 0o700);
    }
  });

  it('should return an empty list for an empty directory', async () => {
    await expect(loadPlugins(makeRoot(), () => noopHost)).resolves.toEqual([]);
  });

  it('should load a direct child and hand the plugin the host built for its id', async () => {
    const root = makeRoot();
    writePlugin(root, 'alpha');
    const seen: string[] = [];

    const loaded = await loadPlugins(root, id => {
      seen.push(id);
      return noopHost;
    });

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe('alpha');
    expect(loaded[0]?.manifest.title).toBe('Title alpha');
    expect(seen).toEqual(['alpha']);
  });

  it('should load an index.js entry', async () => {
    const root = makeRoot();
    writePlugin(root, 'jsplugin', { entryName: 'index.js', entry: entrySourceFor('jsplugin') });

    const loaded = await loadPlugins(root, () => noopHost);

    expect(loaded.map(entry => entry.id)).toEqual(['jsplugin']);
  });

  it('should follow a symlinked plugin directory', async () => {
    const source = makeRoot();
    writePlugin(source, 'linked');
    const root = makeRoot();
    symlinkSync(join(source, 'linked'), join(root, 'linked'));

    const loaded = await loadPlugins(root, () => noopHost);

    expect(loaded.map(entry => entry.id)).toEqual(['linked']);
  });

  it('should prefer index.js over index.ts when both exist', async () => {
    const root = makeRoot();
    writePlugin(root, 'dual', { entryName: 'index.js', entry: entrySourceFor('dual') });
    writeFileSync(join(root, 'dual', 'index.ts'), "throw new Error('the index.ts entry was imported');");

    const loaded = await loadPlugins(root, () => noopHost);

    expect(loaded.map(entry => entry.id)).toEqual(['dual']);
  });

  it('should return plugins ordered by id', async () => {
    const root = makeRoot();
    for (const id of ['gamma', 'alpha', 'beta']) writePlugin(root, id);

    const loaded = await loadPlugins(root, () => noopHost);

    expect(loaded.map(entry => entry.id)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('should ignore files sitting directly in the plugin directory', async () => {
    const root = makeRoot();
    writeFileSync(join(root, 'README.md'), '# not a plugin');
    writePlugin(root, 'alpha');

    const loaded = await loadPlugins(root, () => noopHost);

    expect(loaded.map(entry => entry.id)).toEqual(['alpha']);
  });

  it('should skip a directory whose name is not a valid plugin id', async () => {
    const root = makeRoot();
    for (const id of ['Alpha', 'my_plugin', '-alpha', 'alpha-', 'alpha--beta', '.hidden'])
      writePartialPlugin(root, id, { manifest: JSON.stringify(manifestFor(id)), entry: entrySourceFor(id) });

    await expect(loadPlugins(root, () => noopHost)).resolves.toEqual([]);
  });

  it('should skip a plugin whose manifest is missing, unparseable, or invalid', async () => {
    const root = makeRoot();
    writePartialPlugin(root, 'nomanifest', { entry: entrySourceFor('nomanifest') });
    writePartialPlugin(root, 'badjson', { manifest: '{ not json', entry: entrySourceFor('badjson') });
    writePartialPlugin(root, 'badmanifest', { manifest: JSON.stringify(manifestFor('badmanifest', { decisionPoints: 'call.route' })), entry: entrySourceFor('badmanifest') });

    await expect(loadPlugins(root, () => noopHost)).resolves.toEqual([]);
  });

  it('should skip a plugin whose manifest id does not match its directory', async () => {
    const root = makeRoot();
    writePartialPlugin(root, 'alpha', { manifest: JSON.stringify(manifestFor('beta')), entry: entrySourceFor('beta') });

    await expect(loadPlugins(root, () => noopHost)).resolves.toEqual([]);
  });

  it('should skip a plugin with no entry file', async () => {
    const root = makeRoot();
    writePartialPlugin(root, 'alpha', { manifest: JSON.stringify(manifestFor('alpha')) });

    await expect(loadPlugins(root, () => noopHost)).resolves.toEqual([]);
  });

  it('should skip a plugin whose entry has no default-exported factory', async () => {
    const root = makeRoot();
    writePlugin(root, 'alpha', { entry: 'export const createPlugin = () => ({});' });

    await expect(loadPlugins(root, () => noopHost)).resolves.toEqual([]);
  });

  it('should skip a plugin whose factory throws', async () => {
    const root = makeRoot();
    writePlugin(root, 'alpha', { entry: "export default () => { throw new Error('boom'); };" });

    await expect(loadPlugins(root, () => noopHost)).resolves.toEqual([]);
  });

  it('should skip a plugin whose factory returns something that is not a plugin', async () => {
    const root = makeRoot();
    writePlugin(root, 'alpha', { entry: 'export default () => 42;' });
    writePlugin(root, 'beta', { entry: "export default () => ({ id: 'beta' });" });

    await expect(loadPlugins(root, () => noopHost)).resolves.toEqual([]);
  });

  it('should skip a plugin whose runtime id disagrees with its directory', async () => {
    const root = makeRoot();
    writePlugin(root, 'alpha', { entry: entrySourceFor('beta') });

    await expect(loadPlugins(root, () => noopHost)).resolves.toEqual([]);
  });

  it('should record the file manifest when manifest() agrees with it, whatever order its keys are in', async () => {
    const root = makeRoot();
    const declared = manifestFor('alpha', { forms: { settings: { fields: [{ name: 'noteText', type: 'string', title: 'Note' }], required: ['noteText'] } } });
    const reordered = Object.fromEntries(Object.entries(declared).reverse());
    writePlugin(root, 'alpha', { manifest: JSON.stringify(declared), entry: `export default () => ({ id: 'alpha', manifest: () => (${JSON.stringify(reordered)}) });` });

    const loaded = await loadPlugins(root, () => noopHost);

    expect(loaded[0]?.manifest).toEqual(validateManifest(declared, 'alpha'));
  });

  it('should skip a plugin whose manifest() disagrees with its manifest file', async () => {
    const root = makeRoot();
    writePlugin(root, 'version', { entry: `export default () => ({ id: 'version', manifest: () => (${JSON.stringify(manifestFor('version', { version: '2.0.0' }))}) });` });
    writePlugin(root, 'points', {
      entry: `export default () => ({ id: 'points', manifest: () => (${JSON.stringify(manifestFor('points', { decisionPoints: ['call.route', 'brief.policy'] }))}) });`,
    });
    writePlugin(root, 'claims', { entry: `export default () => ({ id: 'claims', manifest: () => (${JSON.stringify(manifestFor('claims', { exclusive: ['call.route'] }))}) });` });

    await expect(loadPlugins(root, () => noopHost)).resolves.toEqual([]);
  });

  it('should skip a plugin whose manifest() throws', async () => {
    const root = makeRoot();
    writePlugin(root, 'alpha', { entry: "export default () => ({ id: 'alpha', manifest: () => { throw new Error('boom'); } });" });

    await expect(loadPlugins(root, () => noopHost)).resolves.toEqual([]);
  });

  it('should skip a plugin whose onLoad throws', async () => {
    const root = makeRoot();
    writePlugin(root, 'alpha', {
      entry: `export default () => ({ id: 'alpha', manifest: () => (${JSON.stringify(manifestFor('alpha'))}), onLoad() { throw new Error('boom'); } });`,
    });

    await expect(loadPlugins(root, () => noopHost)).resolves.toEqual([]);
  });

  it('should keep loading the remaining plugins after one fails', async () => {
    const root = makeRoot();
    writePartialPlugin(root, 'broken', { entry: entrySourceFor('broken') });
    writePlugin(root, 'healthy');

    const loaded = await loadPlugins(root, () => noopHost);

    expect(loaded.map(entry => entry.id)).toEqual(['healthy']);
  });
});
