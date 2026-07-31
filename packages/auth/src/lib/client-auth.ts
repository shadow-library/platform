/**
 * Importing npm packages
 */
import { readFile } from 'node:fs/promises';

import { throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AuthErrorCode } from '../errors';
import { type AuthClientCredential } from '../interfaces';

/**
 * Defining types
 */

export interface ClientAuthentication {
  /** Request headers carrying the credential, when it travels in one (HTTP Basic) */
  headers: Record<string, string>;

  /** Form parameters carrying the credential, when it travels in the body (client assertion, public client) */
  body: Record<string, string>;
}

/**
 * Declaring the constants
 *
 * How this application proves it is itself to `/oauth2/token`. Every request to that endpoint needs
 * it — client credentials, token exchange, introspection, revocation — so it is built in one place:
 * an assertion path and a static secret authenticate in different halves of the request, and getting
 * that split wrong in one caller and right in another is exactly the bug this prevents.
 */

/** RFC 7523 §2.2 — authenticating with a JWT (here: a projected k8s service-account token) */
const JWT_BEARER_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

export async function buildClientAuthentication(client: AuthClientCredential): Promise<ClientAuthentication> {
  if (client.assertionPath) {
    return { headers: {}, body: { client_id: client.id, client_assertion_type: JWT_BEARER_ASSERTION_TYPE, client_assertion: await readAssertion(client.assertionPath) } };
  }

  /** A secret belongs in the Basic header, never the body, so it stays out of access logs and error dumps */
  if (client.secret) return { headers: { authorization: `Basic ${Buffer.from(`${client.id}:${client.secret}`).toString('base64')}` }, body: {} };
  return { headers: {}, body: { client_id: client.id } };
}

/** Whether the credential can prove the application's identity, as every confidential grant requires */
export function isConfidential(client: AuthClientCredential | undefined): client is AuthClientCredential {
  return Boolean(client?.assertionPath ?? client?.secret);
}

/** Read fresh on every request — the kubelet rotates the projected token in place */
async function readAssertion(path: string): Promise<string> {
  const assertion = await readFile(path, 'utf8').catch((error: Error) =>
    throwError(AuthErrorCode.TOKEN_REQUEST_FAILED.create({ reason: `could not read service-account token at '${path}': ${error.message}` })),
  );
  const trimmed = assertion.trim();
  if (!trimmed) throw AuthErrorCode.TOKEN_REQUEST_FAILED.create({ reason: `service-account token at '${path}' is empty` });
  return trimmed;
}
