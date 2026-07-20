/**
 * Importing npm packages
 */
import { existsSync, readFileSync } from 'node:fs';

import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME, oidcDiscoveryUrl } from '@server/constants';

/**
 * Defining types
 */

interface WorkloadJwtHeader {
  alg?: string;
  kid?: string;
}

interface WorkloadJwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
}

interface WorkloadJwk {
  kty?: string;
  kid?: string;
  crv?: string;
  [parameter: string]: unknown;
}

export interface VerifiedWorkload {
  /** The service-account subject, e.g. `system:serviceaccount:prod:pulse` */
  subject: string;
}

/**
 * Declaring the constants
 *
 * Validates projected Kubernetes service-account tokens presented as RFC 7523 client assertions
 * (D-16). The cluster's API server is an OIDC issuer: its JWKS is fetched via standard discovery
 * and cached, and tokens are verified offline (RS256/ES256), checking `iss`, `aud`, and `exp`.
 * The trusted issuer is configured via `AUTH_WORKLOAD_ISSUER`; when unset, workload identity is
 * disabled and assertion-based client authentication is rejected outright.
 */
const JWKS_TTL_MS = 12 * 3_600_000;
const REFRESH_BACKOFF_MS = 30_000;
const CLOCK_SKEW_SECONDS = 60;

const decodeSegment = <T>(segment: string): T | null => {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
};

export class WorkloadAssertionError extends Error {}

@Injectable()
export class WorkloadIdentityService {
  private readonly logger = Logger.getLogger(APP_NAME, WorkloadIdentityService.name);
  private readonly issuer = Config.get('auth.workload.issuer');
  private readonly audience = Config.get('auth.workload.audience') || Config.get('oauth.issuer');
  private readonly jwksUriOverride = Config.get('auth.workload.jwks-uri');
  private readonly saTokenPath = Config.get('auth.workload.sa-token-path');

  private keys = new Map<string, CryptoKey>();
  private fetchedAt = 0;
  private inflight: Promise<void> | null = null;

  isEnabled(): boolean {
    return Boolean(this.issuer);
  }

  /** Verifies a projected SA token offline against the cluster JWKS and returns its subject */
  async verify(assertion: string): Promise<VerifiedWorkload> {
    if (!this.isEnabled()) throw new WorkloadAssertionError('workload identity is not configured');

    const segments = assertion.split('.');
    const [head, body, signature] = segments;
    if (segments.length !== 3 || !head || !body || !signature) throw new WorkloadAssertionError('malformed client assertion');

    const header = decodeSegment<WorkloadJwtHeader>(head);
    const payload = decodeSegment<WorkloadJwtPayload>(body);
    if (!header || !payload) throw new WorkloadAssertionError('malformed client assertion');
    if (header.alg !== 'RS256' && header.alg !== 'ES256') throw new WorkloadAssertionError(`assertion algorithm '${String(header.alg)}' is not allowed`);
    if (!header.kid) throw new WorkloadAssertionError('assertion is missing the kid header');

    const key = await this.getKey(header.kid);
    const verifyAlgorithm = header.alg === 'RS256' ? 'RSASSA-PKCS1-v1_5' : { name: 'ECDSA', hash: 'SHA-256' };
    const isValid = await crypto.subtle.verify(verifyAlgorithm, key, Buffer.from(signature, 'base64url'), Buffer.from(`${head}.${body}`));
    if (!isValid) throw new WorkloadAssertionError('assertion signature verification failed');

    this.validateClaims(payload);
    return { subject: payload.sub as string };
  }

  private validateClaims(payload: WorkloadJwtPayload): void {
    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== this.issuer) throw new WorkloadAssertionError(`assertion issued by untrusted issuer '${String(payload.iss)}'`);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(this.audience)) throw new WorkloadAssertionError(`assertion is not addressed to '${this.audience}'`);
    if (typeof payload.exp !== 'number' || payload.exp <= now - CLOCK_SKEW_SECONDS) throw new WorkloadAssertionError('assertion has expired');
    if (typeof payload.nbf === 'number' && payload.nbf > now + CLOCK_SKEW_SECONDS) throw new WorkloadAssertionError('assertion is not yet valid');
    if (typeof payload.sub !== 'string' || !payload.sub) throw new WorkloadAssertionError('assertion is missing the sub claim');
  }

  private async getKey(kid: string): Promise<CryptoKey> {
    const isStale = Date.now() - this.fetchedAt >= JWKS_TTL_MS;
    if (isStale) {
      await this.refresh().catch(error => {
        if (this.keys.size === 0) throw new WorkloadAssertionError(`cluster jwks unavailable: ${(error as Error).message}`);
      });
    }

    let key = this.keys.get(kid);
    if (!key && Date.now() - this.fetchedAt > REFRESH_BACKOFF_MS) {
      await this.refresh().catch(() => undefined);
      key = this.keys.get(kid);
    }
    if (!key) throw new WorkloadAssertionError(`no cluster key matches kid '${kid}'`);
    return key;
  }

  private refresh(): Promise<void> {
    this.inflight ??= this.load().finally(() => (this.inflight = null));
    return this.inflight;
  }

  /**
   * Fetches a discovery/JWKS document. The apiserver's discovery endpoints require the caller to be
   * an authenticated service account (the default `system:service-account-issuer-discovery` binding),
   * so identity presents its own projected SA token — re-read each fetch because the kubelet rotates
   * it — rather than relying on anonymous access. A missing token file (non-Kubernetes) → an
   * unauthenticated request. The body is parsed directly rather than via content-type-gated helpers:
   * the apiserver serves JWKS as `application/jwk-set+json`, which those helpers skip.
   */
  private async discoveryFetch<T>(url: string): Promise<{ status: number; data: T | null }> {
    const headers: Record<string, string> = {};
    if (this.saTokenPath && existsSync(this.saTokenPath)) {
      const token = readFileSync(this.saTokenPath, 'utf8').trim();
      if (token) headers.authorization = `Bearer ${token}`;
    }
    const response = await fetch(url, { headers });
    const text = await response.text();
    let data: T | null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      data = null;
    }
    return { status: response.status, data };
  }

  private async load(): Promise<void> {
    const jwksUri = this.jwksUriOverride || (await this.discoverJwksUri());
    const response = await this.discoveryFetch<{ keys?: WorkloadJwk[] }>(jwksUri);
    if (response.status >= 400) throw AppError.internal(`cluster jwks endpoint returned http ${response.status}`);
    if (!response.data) throw AppError.internal('cluster jwks endpoint returned no json body');

    const keys = new Map<string, CryptoKey>();
    for (const jwk of response.data.keys ?? []) {
      if (!jwk.kid) continue;
      const importAlgorithm = this.importAlgorithm(jwk);
      if (!importAlgorithm) continue;
      keys.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, importAlgorithm, false, ['verify']));
    }

    this.keys = keys;
    this.fetchedAt = Date.now();
    this.logger.debug('refreshed cluster jwks', { keyCount: keys.size });
  }

  private importAlgorithm(jwk: WorkloadJwk): Parameters<typeof crypto.subtle.importKey>[2] | null {
    if (jwk.kty === 'RSA') return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    if (jwk.kty === 'EC' && jwk.crv === 'P-256') return { name: 'ECDSA', namedCurve: 'P-256' };
    return null;
  }

  private async discoverJwksUri(): Promise<string> {
    const response = await this.discoveryFetch<{ jwks_uri?: string }>(oidcDiscoveryUrl(this.issuer));
    if (response.status >= 400) throw AppError.internal(`cluster oidc discovery returned http ${response.status}`);
    if (!response.data?.jwks_uri) throw AppError.internal('cluster oidc discovery has no jwks_uri');
    return response.data.jwks_uri;
  }
}
