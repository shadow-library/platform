/**
 * Importing npm packages
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface ServiceAccountTokenOptions {
  /** Requested `aud` values. Omitting them yields the cluster's own default audiences, which identity must refuse. */
  audiences?: string[];
  /** Requested lifetime. The TokenRequest API refuses anything under `MIN_TOKEN_DURATION_SECONDS`. */
  durationSeconds?: number;
}

/**
 * Declaring the constants
 *
 * Mints Kubernetes projected service-account tokens for the workload-identity grant, the only assertions identity's cluster
 * issuer will vouch for. The context is pinned because this kubeconfig also holds `k3d-shadow-apps-prod`, and only `create
 * token` on service accounts that already exist is ever issued — nothing here creates, mutates or deletes cluster objects.
 * The minted tokens are credentials: they are passed straight to the token endpoint and never logged or written to disk.
 */

export const KUBE_CONTEXT = 'k3d-shadow-apps-dev';

/** `AUTH_WORKLOAD_ISSUER` in the dev cluster — the `iss` every cluster-signed assertion carries. */
export const WORKLOAD_ISSUER = 'https://kubernetes.default.svc.cluster.local';

/** The TokenRequest API's floor, which is why an expired cluster-signed token cannot be produced inside a test. */
export const MIN_TOKEN_DURATION_SECONDS = 600;

export class ClusterTokenError extends Error {
  override readonly name = 'ClusterTokenError';
}

const run = promisify(execFile);

let availability: Promise<boolean> | undefined;

export function workloadSubject(namespace: string, serviceAccount: string): string {
  return `system:serviceaccount:${namespace}:${serviceAccount}`;
}

/** A projected token for an existing service account, signed by the cluster's own issuer. */
export async function mintServiceAccountToken(namespace: string, serviceAccount: string, options: ServiceAccountTokenOptions = {}): Promise<string> {
  const args = ['--context', KUBE_CONTEXT, 'create', 'token', serviceAccount, '-n', namespace];
  for (const audience of options.audiences ?? []) args.push('--audience', audience);
  if (options.durationSeconds) args.push('--duration', `${options.durationSeconds}s`);

  try {
    const { stdout } = await run('kubectl', args);
    return stdout.trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ClusterTokenError(`could not mint a token for ${workloadSubject(namespace, serviceAccount)}: ${reason}`);
  }
}

/** Whether this host can mint cluster tokens at all, resolved once — a spec skips rather than fails where kubectl or the dev cluster is absent. */
export function clusterTokensAvailable(): Promise<boolean> {
  return (availability ??= mintServiceAccountToken('kube-public', 'default', { audiences: ['e2e-availability-probe'] }).then(
    () => true,
    () => false,
  ));
}
