import { readFile } from 'node:fs/promises';

import { throwError } from '@shadow-library/common';

import { AuthErrorCode } from '../errors';
import { type AuthClientCredential } from '../interfaces';

export interface ClientAuthentication {
  headers: Record<string, string>;

  body: Record<string, string>;
}

// Built in one place because an assertion and a static secret authenticate in different halves of the request, and every `/oauth2/*` caller must get that split right
const JWT_BEARER_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

export async function buildClientAuthentication(client: AuthClientCredential): Promise<ClientAuthentication> {
  if (client.assertionPath) {
    return { headers: {}, body: { client_id: client.id, client_assertion_type: JWT_BEARER_ASSERTION_TYPE, client_assertion: await readAssertion(client.assertionPath) } };
  }

  // A secret belongs in the Basic header, never the body, so it stays out of access logs and error dumps
  if (client.secret) return { headers: { authorization: `Basic ${Buffer.from(`${client.id}:${client.secret}`).toString('base64')}` }, body: {} };
  return { headers: {}, body: { client_id: client.id } };
}

export function isConfidential(client: AuthClientCredential | undefined): client is AuthClientCredential {
  return Boolean(client?.assertionPath ?? client?.secret);
}

/** Read fresh on every request because the kubelet rotates the projected token in place */
async function readAssertion(path: string): Promise<string> {
  const assertion = await readFile(path, 'utf8').catch((error: Error) =>
    throwError(AuthErrorCode.TOKEN_REQUEST_FAILED.create({ reason: `could not read service-account token at '${path}': ${error.message}` })),
  );
  const trimmed = assertion.trim();
  if (!trimmed) throw AuthErrorCode.TOKEN_REQUEST_FAILED.create({ reason: `service-account token at '${path}' is empty` });
  return trimmed;
}
