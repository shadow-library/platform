/**
 * Importing npm packages
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { type AddressInfo } from 'node:net';

/**
 * Importing user defined packages
 */
import { type WaitOptions, waitUntil } from './wait';

/**
 * Defining types
 */

export interface ReceivedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: string;
  /** `body` parsed as a form post, which is how identity delivers a logout token. */
  readonly form: URLSearchParams;
}

export interface HostReceiver {
  readonly port: number;
  /** The URL a pod uses to reach this server: `http://<clusterHost>:<port><path>`. */
  urlFor(clusterHost: string, path: string): string;
  /** Answers `status` for every request whose path starts with `pathPrefix`. Unmatched paths get 200. */
  answerWith(pathPrefix: string, status: number): void;
  received(pathPrefix?: string): ReceivedRequest[];
  /** Resolves with the first request under `pathPrefix`, or throws `WaitTimeoutError`. */
  waitForRequest(pathPrefix: string, options?: WaitOptions): Promise<ReceivedRequest>;
  close(): Promise<void>;
}

/**
 * Declaring the constants
 *
 * An HTTP server on the host that pods can POST to — identity's back-channel logout delivery is an unguarded `fetch`, so a
 * plain-http loopback target is reachable where the SSRF-guarded webhook sender would refuse one. It binds every interface on
 * an ephemeral port, so parallel workers never collide, and records what arrives instead of answering anything meaningful.
 *
 * Which name reaches the host from inside the cluster is environment-specific: k3d writes `host.k3d.internal` into CoreDNS
 * pointing at the container network's gateway, which is the host under a Linux/Docker-Desktop bridge but only the virtual
 * machine under OrbStack, where `host.docker.internal` is the host instead. Rather than assume, a spec tries the candidates
 * below and keeps the one a delivery actually arrives on; `E2E_CLUSTER_HOST` overrides the list.
 */

const DEFAULT_CLUSTER_HOSTS = ['host.k3d.internal', 'host.docker.internal'];

export const CLUSTER_HOST_CANDIDATES: readonly string[] = (process.env.E2E_CLUSTER_HOST?.split(',') ?? DEFAULT_CLUSTER_HOSTS).map(host => host.trim()).filter(Boolean);

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

export async function startHostReceiver(): Promise<HostReceiver> {
  const requests: ReceivedRequest[] = [];
  const statuses = new Map<string, number>();
  const statusFor = (path: string): number => [...statuses].find(([prefix]) => path.startsWith(prefix))?.[1] ?? 200;

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const path = request.url ?? '/';
    const body = await readBody(request);
    const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : (value ?? '')]));
    requests.push({ method: request.method ?? 'GET', path, headers, body, form: new URLSearchParams(body) });
    response.writeHead(statusFor(path)).end();
  };

  const server: Server = createServer((request, response) => void handle(request, response));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', resolve);
  });
  server.unref();

  const port = (server.address() as AddressInfo).port;
  const received = (pathPrefix?: string): ReceivedRequest[] => (pathPrefix ? requests.filter(request => request.path.startsWith(pathPrefix)) : [...requests]);

  return {
    port,
    urlFor: (clusterHost, path) => `http://${clusterHost}:${port}${path}`,
    answerWith: (pathPrefix, status) => void statuses.set(pathPrefix, status),
    received,
    waitForRequest: (pathPrefix, options) => waitUntil(async () => received(pathPrefix)[0], { message: `no request on ${pathPrefix}`, intervalMs: 200, ...options }),
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}
