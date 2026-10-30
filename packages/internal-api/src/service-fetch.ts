export interface ServiceTokenRequest {
  resource: string;
  scopes: string[];
}

/** Sends one request to an already resolved url, authenticated with an M2M token for `token`; retrying a rejected token is the implementation's job. */
export type ServiceFetch = (url: string, init: RequestInit, token: ServiceTokenRequest) => Promise<Response>;

export interface ServiceTarget extends ServiceTokenRequest {
  /** The `svc://` name of the callee, e.g. `pulse-server`. */
  service: string;
}

export interface AuthClientLike {
  fetch(url: string, init?: RequestInit, options?: { resource?: string; scopes?: string[] }): Promise<Response>;
}

/** Structural, so identity-server, which never depends on `@shadow-library/auth`, can still use every client with its own token source. */
export function fromAuthClient(authClient: AuthClientLike): ServiceFetch {
  return (url, init, token) => authClient.fetch(url, init, token);
}
