/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { buildManifest, manifestResponse, pwaHeadLinks, pwaHeadMeta } from './manifest';

/**
 * Declaring the constants
 */
describe('buildManifest', () => {
  it('should apply defaults and fall short_name back to name', () => {
    expect(buildManifest({ name: 'Shadow App' })).toMatchObject({ name: 'Shadow App', short_name: 'Shadow App', start_url: '/', scope: '/', display: 'standalone' });
  });

  it('should let explicit values override the defaults', () => {
    const manifest = buildManifest({ name: 'A', short_name: 'B', display: 'fullscreen', start_url: '/home' });
    expect(manifest.short_name).toBe('B');
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.start_url).toBe('/home');
  });
});

describe('manifestResponse', () => {
  it('should serve application/manifest+json with the manifest body', async () => {
    const response = manifestResponse(buildManifest({ name: 'A' }));
    expect(response.headers.get('content-type')).toBe('application/manifest+json');
    expect(JSON.parse(await response.text()).name).toBe('A');
  });
});

describe('pwaHeadLinks / pwaHeadMeta', () => {
  it('should include the manifest link and an optional apple-touch-icon', () => {
    expect(pwaHeadLinks().find(link => link.rel === 'manifest')?.href).toBe('/manifest.webmanifest');
    expect(pwaHeadLinks({ appleTouchIcon: '/icon.png' }).some(link => link.rel === 'apple-touch-icon')).toBe(true);
  });

  it('should include installability meta and the theme color when given', () => {
    expect(pwaHeadMeta().some(meta => meta.name === 'mobile-web-app-capable')).toBe(true);
    expect(pwaHeadMeta({ themeColor: '#000' }).find(meta => meta.name === 'theme-color')?.content).toBe('#000');
  });
});
