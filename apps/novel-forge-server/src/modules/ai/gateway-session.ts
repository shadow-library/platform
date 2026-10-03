import { Config } from '@shadow-library/common';

/**
 * Names the conversation a request belongs to, so the AI gateway resumes its own Claude session for it and sends only the new messages. The
 * gateway honours it only for a model it runs on the claude CLI with no tools of the caller's — its own web tools are fine; anywhere else the
 * call goes out exactly as without it. Only `structured` calls carry it, and those never bind tools.
 */
export const GATEWAY_SESSION_HEADER = 'x-gateway-session';

const OPENROUTER_HOST = 'openrouter.ai';
const CLAUDE_VENDOR = 'anthropic/';

/** Dev and prod share one host gateway, so the stage keeps their conversations apart. */
export function gatewaySessionKey(projectId: bigint, chatSessionId: string): string {
  return `${Config.get('app.stage')}:${projectId}:${chatSessionId}`;
}

/** Whether a call on `model` reaches the gateway's claude CLI, the one backend that keeps a session. */
export function keepsGatewaySession(model: string): boolean {
  if (Config.get('ai.model-override')) return false;
  if (!model.startsWith(CLAUDE_VENDOR)) return false;
  const url = Config.get('ai.openrouter.api.url');
  return URL.canParse(url) && new URL(url).hostname !== OPENROUTER_HOST;
}
