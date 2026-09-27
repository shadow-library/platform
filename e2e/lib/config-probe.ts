/**
 * Importing npm packages
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Importing user defined packages
 */
import { KUBE_CONTEXT } from './k8s-tokens';

/**
 * Defining types
 */

export interface ConfigKeysProbe {
  /** Whether any of the probed keys is set anywhere among the probed sources. Meaningless when `probeFailed`. */
  configured: boolean;
  /** The cluster couldn't be read at all (not merely "resource absent") — callers must skip rather than trust either state. */
  probeFailed: boolean;
}

export class KubectlProbeError extends Error {
  override readonly name = 'KubectlProbeError';
}

/**
 * Declaring the constants
 *
 * Key-NAMES-only kubectl probing for whether a config env var is set anywhere a workload's `envFrom` reads
 * from, without ever reading a value (`{{println $k}}` never expands `$v`, so a Secret's base64 payload
 * never transits stdout). Originates from `billing.spec.ts`'s `probeBillingConfig`; pulled out here so any
 * spec whose truth depends on an unset dev config key (billing's webhook secret, AI's inference url, ...)
 * shares one implementation rather than re-deriving it.
 */
const KEY_NAMES_TEMPLATE = '{{range $k,$v := .data}}{{println $k}}{{end}}';

const run = promisify(execFile);

/**
 * A resource kubectl reports missing (`NotFound`) is read as "contributes no keys" — the ordinary unconfigured
 * shape. Any other failure (kubectl off PATH, the wrong/unreachable context, RBAC) must not collapse to the
 * same "no keys" result, since that would silently misread "couldn't check" as "unconfigured" — it's raised
 * instead so the caller can tell the two apart.
 */
async function resourceDataKeys(namespace: string, kind: 'configmap' | 'secret', name: string): Promise<string[]> {
  try {
    const { stdout } = await run('kubectl', ['--context', KUBE_CONTEXT, '-n', namespace, 'get', kind, name, '-o', `go-template=${KEY_NAMES_TEMPLATE}`]);
    return stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String((error as { stderr?: unknown }).stderr ?? '') : '';
    if (/\(NotFound\)/.test(stderr)) return [];
    const reason = stderr || (error instanceof Error ? error.message : String(error));
    throw new KubectlProbeError(`could not read ${kind}/${name} in namespace ${namespace}: ${reason}`);
  }
}

/** Whether any of `keys` is set anywhere among `sources` (the configmaps/secrets a workload's `envFrom` reads from). */
export async function probeConfigKeys(namespace: string, sources: readonly (readonly ['configmap' | 'secret', string])[], keys: readonly string[]): Promise<ConfigKeysProbe> {
  try {
    const keysBySource = await Promise.all(sources.map(([kind, name]) => resourceDataKeys(namespace, kind, name)));
    const found = new Set(keysBySource.flat());
    return { configured: keys.some(key => found.has(key)), probeFailed: false };
  } catch {
    return { configured: false, probeFailed: true };
  }
}

/** memoir-server's `envFrom` sources (verified read-only via kubectl — see `billing.spec.ts`), reused by any memoir config-key probe. */
export const MEMOIR_CONFIG_SOURCES: readonly (readonly ['configmap' | 'secret', string])[] = [
  ['configmap', 'cluster-config'],
  ['configmap', 'common-config'],
  ['configmap', 'memoir-server-config'],
  ['secret', 'common-secrets'],
  ['secret', 'memoir-server-secrets'],
];

/** {@link probeConfigKeys} pinned to memoir-server's namespace and config sources. */
export function probeMemoirConfigKeys(keys: readonly string[]): Promise<ConfigKeysProbe> {
  return probeConfigKeys('memoir', MEMOIR_CONFIG_SOURCES, keys);
}
