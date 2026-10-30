import { type ServiceFetch } from '@shadow-library/clients';

import { type ServiceTokenService } from './service-token.service';

type Transport = (url: string, init: RequestInit) => Promise<Response>;

/** A rotated signing key only shows up as a rejection, so the cached token is dropped and the call sent once more with a fresh one. */
export function serviceFetchFrom(tokens: Pick<ServiceTokenService, 'getToken' | 'invalidate'>, transport: Transport = (url, init) => fetch(url, init)): ServiceFetch {
  return async (url, init, { resource, scopes }) => {
    const scope = scopes.join(' ');
    const send = async (): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set('authorization', `Bearer ${await tokens.getToken(resource, scope)}`);
      return transport(url, { ...init, headers });
    };

    const response = await send();
    if (response.status !== 401 && response.status !== 403) return response;
    await response.body?.cancel();
    tokens.invalidate(resource, scope);
    return send();
  };
}
