/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { buildClient } from '../../scripts/build-client';
import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The client is built before the app boots so the static registration and the page shell both
 * exist — this also keeps the real production build path under test.
 */
await buildClient();

const env = new TestEnvironment('ui-serving').init();

describe('Web client serving', () => {
  const pages = ['/', '/login', '/register', '/recover', '/consent', '/account', '/error'];

  it.each(pages)('should serve the spa shell at %s with no-store', async page => {
    const response = await env.getRouter().mockRequest().get(page);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toStartWith('text/html');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toContain('<div id="root">');
    expect(response.body).toContain('/assets/main.js');
  });

  it('should keep inline script out of the shell so csp script-src self holds', async () => {
    const response = await env.getRouter().mockRequest().get('/login');
    expect(response.body).not.toMatch(/<script(?![^>]*src=)/);
  });

  it('should serve built assets through the static route', async () => {
    const script = await env.getRouter().mockRequest().get('/assets/main.js');
    expect(script.statusCode).toBe(200);
    expect(script.headers['cache-control']).toContain('max-age');

    const styles = await env.getRouter().mockRequest().get('/assets/main.css');
    expect(styles.statusCode).toBe(200);

    const fonts = await env.getRouter().mockRequest().get('/assets/fonts.css');
    expect(fonts.statusCode).toBe(200);
  });

  it('should answer 404 for unknown asset paths', async () => {
    const response = await env.getRouter().mockRequest().get('/assets/nope.js');
    expect(response.statusCode).toBe(404);
  });
});
