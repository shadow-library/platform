import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export interface ServiceAccountTokenOptions {
  /** Requested `aud` values. Omitting them yields the cluster's own default audiences, which identity must refuse. */
  audiences?: string[];
  /** Requested lifetime. The TokenRequest API refuses anything under 600 seconds, so a test cannot produce an expired cluster-signed token. */
  durationSeconds?: number;
}

/**
 * Mints Kubernetes projected service-account tokens for the workload-identity grant. The context is pinned because this kubeconfig also holds `k3d-shadow-apps-prod`;
 * only `create token` on existing service accounts is issued, nothing creates, mutates or deletes cluster objects. The tokens are credentials: never logged or written to disk.
 */

export const KUBE_CONTEXT = process.env.E2E_KUBE_CONTEXT || 'k3d-shadow-apps-dev';

/** `AUTH_WORKLOAD_ISSUER` in the dev cluster — the `iss` every cluster-signed assertion carries. */
export const WORKLOAD_ISSUER = 'https://kubernetes.default.svc.cluster.local';

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
