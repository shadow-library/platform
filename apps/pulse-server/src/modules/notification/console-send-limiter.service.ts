import { Injectable } from '@shadow-library/app';

export type ConsoleSendAdmission = { admitted: true } | { admitted: false; retryAfterSeconds: number };

const CONSOLE_SEND_LIMIT = 20;
const CONSOLE_SEND_WINDOW_MS = 10 * 60 * 1000;

/**
 * A sliding window of each actor's recent console sends. Pulse has no shared store (no Redis), so the count is per replica and a restart
 * forgets it: with N replicas an actor gets up to N times the limit. Only PulseAdmin sessions reach it, so the map stays small.
 */
@Injectable()
export class ConsoleSendLimiter {
  private readonly sends = new Map<string, number[]>();

  admit(actor: string): ConsoleSendAdmission {
    const now = Date.now();
    const recent = (this.sends.get(actor) ?? []).filter(sentAt => sentAt > now - CONSOLE_SEND_WINDOW_MS);
    this.sends.set(actor, recent);
    const [oldest] = recent;
    if (oldest !== undefined && recent.length >= CONSOLE_SEND_LIMIT) return { admitted: false, retryAfterSeconds: Math.ceil((oldest + CONSOLE_SEND_WINDOW_MS - now) / 1000) };
    recent.push(now);
    return { admitted: true };
  }
}
