import { describe, expect, it } from 'bun:test';

import { CredentialProber } from '@modules/credentials/credential-prober';

const URL = 'https://openrouter.ai/api/v1/key';

function prober(answer: (init: RequestInit) => Response | Promise<Response>): { prober: CredentialProber; calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  return {
    calls,
    prober: new CredentialProber(async (_url, init) => {
      calls.push(init);
      return answer(init);
    }),
  };
}

describe('CredentialProber.probe', () => {
  it('should send one authenticated GET that never follows a redirect', async () => {
    const { prober: subject, calls } = prober(() => new Response('{}', { status: 200 }));
    expect(await subject.probe(URL, 'sk-or-key')).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect({ method: calls[0]?.method, headers: calls[0]?.headers, redirect: calls[0]?.redirect }).toEqual({
      method: 'GET',
      headers: { authorization: 'Bearer sk-or-key' },
      redirect: 'manual',
    });
  });

  it('should answer a failure with its code alone, never the body the provider sent', async () => {
    const cases: [number, string][] = [
      [401, 'unauthorized'],
      [403, 'unauthorized'],
      [404, 'not_found'],
      [429, 'rate_limited'],
      [503, 'upstream_error'],
      [302, 'redirected'],
      [400, 'rejected'],
    ];
    for (const [status, code] of cases) {
      const { prober: subject } = prober(() => new Response('{"error":{"message":"key sk-or-key is invalid"}}', { status }));
      expect({ status, result: await subject.probe(URL, 'sk-or-key') }).toEqual({ status, result: { ok: false, code } as never });
    }
  });

  it('should report a timeout and a connection failure apart', async () => {
    const timedOut = prober(() => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')));
    const refused = prober(() => Promise.reject(new TypeError('Unable to connect')));
    expect(await timedOut.prober.probe(URL, 'sk-or-key')).toEqual({ ok: false, code: 'timeout' });
    expect(await refused.prober.probe(URL, 'sk-or-key')).toEqual({ ok: false, code: 'connect' });
  });

  it('should give up after the timeout', async () => {
    const { prober: subject } = prober(
      init =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    expect(await subject.probe(URL, 'sk-or-key', 1)).toEqual({ ok: false, code: 'timeout' });
  });
});
