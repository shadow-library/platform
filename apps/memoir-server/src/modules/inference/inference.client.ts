/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { AppError, Config, ServiceDiscovery } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

/**
 * Defining types
 */

export interface InferenceRequest {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Declaring the constants
 */

/** A Kubernetes service name resolves as `<service>.<namespace>.svc[.cluster.local]`; nothing outside the cluster can hold that suffix. */
const IN_CLUSTER_HOST = /\.svc(\.cluster\.local)?$/;
/** A single-label `svc://` name reaches only a Service in the pod's own namespace through cluster DNS; a dotted one cannot be told apart from a public domain. */
const BARE_SERVICE_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * The single model seam for the whole service (ARCHITECTURE §15.6 and §14.3 step 2 — receipt text is
 * user data, so D6 covers OCR structuring exactly as it covers the AI worker). A class token rather than
 * a TS interface for the same reason `OcrStructuringClient` is one: DI binds against something that
 * survives to runtime. It returns parsed JSON and nothing more — each caller owns its own response
 * contract, and neither shape leaks into the transport.
 */
export abstract class InferenceClient {
  abstract completeJson(request: InferenceRequest): Promise<unknown>;
}

/**
 * [Requirement D6] User data never reaches a third-party endpoint. Any host is allowed off a production
 * deployment so a developer can run Ollama on their own machine; on a real deployment the host must be
 * in-cluster, and the process refuses to boot otherwise rather than degrading quietly into a
 * configuration that would exfiltrate journal text.
 */
export function assertInClusterInference(url: string): void {
  if (!url) return;
  if (!Config.isProductionDeployment()) return;

  const resolved = resolveInferenceUrl(url);
  if (!resolved) throw AppError.internal(`ai.inference-url '${url}' is not a valid URL`);

  const host = new URL(resolved).hostname;
  const bareService = url.startsWith('svc://') && BARE_SERVICE_NAME.test(host) && host !== 'localhost';
  if (!bareService && !IN_CLUSTER_HOST.test(host)) {
    throw AppError.internal(
      `ai.inference-url host '${host}' is not in-cluster; a production deployment may only reach inference over a bare svc://<service> name or a *.svc host (D6)`,
    );
  }
}

/** The address actually dialled, so the D6 check and the call can never disagree: `svc://` goes through the platform's service discovery, overrides and scheme included. */
function resolveInferenceUrl(url: string): string | null {
  try {
    const resolved = ServiceDiscovery.resolve(url);
    return URL.canParse(resolved) ? resolved.replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

/**
 * The ChatOllama call shape novel-forge already runs against the platform's local inference
 * (`ModelRouterService.buildClient`), reduced to the one non-streaming JSON completion this service
 * needs — the LangChain dependency buys nothing here and would drag a third-party-capable router into a
 * service that must never have one. An unset `ai.inference-url` is "no inference configured", which
 * every caller surfaces as an unavailability rather than a fabricated answer.
 */
@Injectable()
export class OllamaInferenceClient extends InferenceClient implements OnModuleInit {
  onModuleInit(): void {
    assertInClusterInference(Config.get('ai.inference-url'));
  }

  async completeJson(request: InferenceRequest): Promise<unknown> {
    const configured = Config.get('ai.inference-url');
    if (!configured) throw AppErrorCode.AI_009.create();

    const baseUrl = resolveInferenceUrl(configured);
    if (!baseUrl) throw AppErrorCode.AI_009.create();

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(Config.get('ai.inference-timeout-ms')),
      body: JSON.stringify({
        model: Config.get('ai.model'),
        stream: false,
        format: 'json',
        options: { temperature: 0.2 },
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
      }),
    }).catch(() => {
      throw AppErrorCode.AI_009.create();
    });

    if (!response.ok) throw AppErrorCode.AI_009.create();
    const body = (await response.json()) as { message?: { content?: string } };
    const content = body.message?.content;
    if (!content) throw AppErrorCode.AI_009.create();

    try {
      return JSON.parse(content);
    } catch {
      throw AppErrorCode.AI_009.create();
    }
  }
}
