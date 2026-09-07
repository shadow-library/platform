/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { APIRequest, AppError, ErrorCode } from '@shadow-library/common';

/**
 * Defining types
 */

interface EchoBody {
  method: string;
  path: string;
  body: string;
  headers: Record<string, string>;
}

/**
 * Declaring the constants
 */

const json = (data: object): Response => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const redirect = (location: string, status: number): Response => new Response('moved', { status, headers: { location } });

describe('APIRequest redirects', () => {
  let origin: ReturnType<typeof Bun.serve>;
  let peer: ReturnType<typeof Bun.serve>;
  let originURL: string;
  let peerURL: string;

  const echo = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    return json({ method: request.method, path: url.pathname + url.search, body: await request.text(), headers: request.headers.toJSON() } satisfies EchoBody);
  };

  beforeAll(() => {
    peer = Bun.serve({ port: 0, fetch: echo });
    peerURL = `http://127.0.0.1:${peer.port}`;

    origin = Bun.serve({
      port: 0,
      fetch: async request => {
        const url = new URL(request.url);
        const hop = Number(url.pathname.split('/')[2] ?? 0);
        switch (url.pathname.split('/')[1]) {
          case 'hop':
            return redirect(hop >= 3 ? '/echo' : `/hop/${hop + 1}`, 302);
          case 'loop':
            return redirect(`/loop/${hop + 1}`, 302);
          case 'see-other':
            return redirect('/echo', 303);
          case 'keep-method':
            return redirect('/echo', 307);
          case 'cross-origin':
            return redirect(`${peerURL}/echo`, 302);
          case 'slow':
            await Bun.sleep(80);
            return redirect(`/slow/${hop + 1}`, 302);
          default:
            return echo(request);
        }
      },
    });
    originURL = `http://127.0.0.1:${origin.port}`;
  });

  afterAll(() => {
    origin.stop(true);
    peer.stop(true);
  });

  it('should follow a redirect chain and return the final resource', async () => {
    const response = await APIRequest.get(`${originURL}/hop/1`).execute<EchoBody>();
    expect(response.statusCode).toBe(200);
    expect(response.data?.path).toBe('/echo');
  });

  it('should resolve a relative location against the current url', async () => {
    const response = await APIRequest.get(`${originURL}/see-other`).execute<EchoBody>();
    expect(response.data?.path).toBe('/echo');
  });

  it('should not carry the original query string onto the redirect target', async () => {
    const response = await APIRequest.get(`${originURL}/see-other`).query('sort', 'asc').execute<EchoBody>();
    expect(response.data?.path).toBe('/echo');
  });

  it('should return the 3xx untouched when redirects are disabled', async () => {
    const response = await APIRequest.get(`${originURL}/hop/1`).followRedirects(false).suppressErrors().execute();
    expect(response.statusCode).toBe(302);
    expect(response.headers['location']).toBe('/hop/2');
  });

  it('should fail once the redirect cap is exceeded rather than loop', async () => {
    const failure = await APIRequest.get(`${originURL}/loop/1`)
      .execute()
      .catch((error: unknown) => error);
    expect(AppError.is(failure, ErrorCode.API_REQUEST_NETWORK_ERROR)).toBe(true);
    expect((failure as AppError).data).toStrictEqual({ reason: 'API request exceeded 5 redirects' });
  });

  it('should rewrite a POST to a GET and drop the body on a 303', async () => {
    const response = await APIRequest.post(`${originURL}/see-other`).body({ a: 1 }).execute<EchoBody>();
    expect(response.data?.method).toBe('GET');
    expect(response.data?.body).toBe('');
    expect(response.data?.headers['content-type']).toBeUndefined();
    expect(response.data?.headers['content-length']).toBeUndefined();
  });

  it('should keep the method and body on a 307', async () => {
    const response = await APIRequest.post(`${originURL}/keep-method`).body({ a: 1 }).execute<EchoBody>();
    expect(response.data?.method).toBe('POST');
    expect(response.data?.body).toBe('{"a":1}');
    expect(response.data?.headers['content-type']).toBe('application/json');
  });

  it('should keep the authorization header on a same-origin redirect', async () => {
    const response = await APIRequest.get(`${originURL}/see-other`).header('authorization', 'Bearer secret').execute<EchoBody>();
    expect(response.data?.headers['authorization']).toBe('Bearer secret');
  });

  it('should drop the authorization header when the redirect crosses origins', async () => {
    const response = await APIRequest.get(`${originURL}/cross-origin`).header('authorization', 'Bearer secret').execute<EchoBody>();
    expect(response.data?.headers['authorization']).toBeUndefined();
  });

  it('should apply the total timeout across the whole redirect chain rather than per hop', async () => {
    const failure = await APIRequest.get(`${originURL}/slow/1`)
      .timeout(150)
      .execute()
      .catch((error: unknown) => error);
    expect(AppError.is(failure, ErrorCode.API_REQUEST_TIMEOUT)).toBe(true);
  });
});
