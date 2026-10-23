import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { KUBE_CONTEXT } from './k8s-tokens';

export interface ConfigKeysProbe {
  /** Whether any of the probed keys is set anywhere among the probed sources. Meaningless when `probeFailed`. */
  configured: boolean;
  /** The cluster couldn't be read at all (not merely "resource absent") — callers must skip rather than trust either state. */
  probeFailed: boolean;
}

export class KubectlProbeError extends Error {
  override readonly name = 'KubectlProbeError';
}

/** Key-NAMES-only kubectl probing of whether a config env var is set anywhere a workload's `envFrom` reads: `{{println $k}}` never expands `$v`, so no value reaches stdout. */
const KEY_NAMES_TEMPLATE = '{{range $k,$v := .data}}{{println $k}}{{end}}';

const run = promisify(execFile);

/** `NotFound` means "contributes no keys"; any other kubectl failure (off PATH, wrong context, RBAC) is raised so "couldn't check" is never misread as "unconfigured". */
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

export async function probeConfigKeys(namespace: string, sources: readonly (readonly ['configmap' | 'secret', string])[], keys: readonly string[]): Promise<ConfigKeysProbe> {
  try {
    const keysBySource = await Promise.all(sources.map(([kind, name]) => resourceDataKeys(namespace, kind, name)));
    const found = new Set(keysBySource.flat());
    return { configured: keys.some(key => found.has(key)), probeFailed: false };
  } catch {
    return { configured: false, probeFailed: true };
  }
}

/** memoir-server's `envFrom` sources. */
export const MEMOIR_CONFIG_SOURCES: readonly (readonly ['configmap' | 'secret', string])[] = [
  ['configmap', 'cluster-config'],
  ['configmap', 'common-config'],
  ['configmap', 'memoir-server-config'],
  ['secret', 'common-secrets'],
  ['secret', 'memoir-server-secrets'],
];

export function probeMemoirConfigKeys(keys: readonly string[]): Promise<ConfigKeysProbe> {
  return probeConfigKeys('memoir', MEMOIR_CONFIG_SOURCES, keys);
}
